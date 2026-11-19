"""Simplify only duplicate surveyed linework and source-checked display branches."""
from collections import defaultdict
from pathlib import Path
import json
import math
import re

def point(p):
    return tuple(round(x, 2) for x in p[:2])

def key(row):
    group,a,b=row
    return (group,*sorted((point(a),point(b))))

def segment_distance(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    u=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)
    v=max(0,min(1,u))
    return math.dist(p,(a[0]+v*dx,a[1]+v*dy)),u

def _line_points(arc):
    points = []
    for p in arc['p']:
        q = point(p)
        if not points or points[-1] != q:
            points.append(q)
    return points


def _segments(points):
    return {tuple(sorted((a,b))) for a,b in zip(points,points[1:]) if a != b}


def remove_redundant(level, lines, arcs, branches, stops, marks, records, reserved):
    """Prune only duplicate strokes and small, two-way seams with a witnessed bypass."""
    removed = set()
    protected_lines = set(reserved)
    protected_points = {point(p) for _,p in marks}
    for row in stops.values():
        for station in (row['depart'], row['arrive']):
            if station and station['levelId']==level:
                protected_points.add(point(station['pointFeet']))
    branch_shapes = set()
    for row in branches:
        if row['level']==level:
            points = [point(p) for p in row['branch']['pathToHallway']]
            protected_points.update(points)
            branch_shapes.update(_segments(points))

    # Use actual graph vertex identities. Different stations may round to the
    # same map coordinate, and a seam's last two indices can include 0 or 1.
    seam_re = re.compile(r'opening:recovered-circulation-seam:(rm-[^:|]+):(rm-[^:|]+):[0-9]+:[0-9]+')
    incident = defaultdict(set)
    source = defaultdict(set)
    gates = defaultdict(set)
    for i,arc in enumerate(arcs):
        ls = arc['levels']
        if level not in ls or not arc['p']:
            continue
        for v in (arc['f'],arc['t']):
            incident[v].add(i)
        if ls != [level,level]:
            for lid,p in ((ls[0],arc['p'][0]),(ls[-1],arc['p'][-1])):
                if lid==level:
                    protected_points.add(point(p))
            continue
        pts = _line_points(arc)
        segs = _segments(pts)
        for segment in segs:
            source[segment].add(i)
        if arc['k']=='opening' and seam_re.fullmatch(arc['e']):
            gates[arc['e']].add(i)
        elif arc['k']!='walk':
            protected_points.update(pts)
            branch_shapes.update(segs)

    neighbors = defaultdict(set)
    groups_by_point = defaultdict(set)
    for group,a,b in lines:
        neighbors[group,a].add(b)
        neighbors[group,b].add(a)
        groups_by_point[a].add(group)
        groups_by_point[b].add(group)
        if (a,b) in branch_shapes:
            protected_lines.add((group,a,b))
    protected_points.update(q for (_,a,b) in protected_lines for q in (a,b))
    protected_points.update(q for q,groups in groups_by_point.items() if len(groups)>1)
    # Source paths and display coordinates are rounded to hundredths of a foot.
    # Index all protected points, including ones lying within unsplit strokes.
    tile = lambda p: (math.floor(p[0]/16),math.floor(p[1]/16))
    indexed = defaultdict(set)
    for p in protected_points:
        indexed[tile(p)].add(p)
    def bins(a,b):
        lo=tile((min(a[0],b[0])-.015,min(a[1],b[1])-.015))
        hi=tile((max(a[0],b[0])+.015,max(a[1],b[1])+.015))
        return ((x,y) for x in range(lo[0],hi[0]+1) for y in range(lo[1],hi[1]+1))
    indexed_lines=defaultdict(set)
    for e in lines:
        for cell in bins(e[1],e[2]):
            indexed_lines[cell].add(e)
    def side(a,b,c):
        (ax,ay),(bx,by),(cx,cy)=[(round(100*p[0]),round(100*p[1])) for p in (a,b,c)]
        return (bx-ax)*(cy-ay)-(by-ay)*(cx-ax)
    def intersects(a,b,c,d,allowed):
        if not all(max(min(a[k],b[k]),min(c[k],d[k]))<=min(max(a[k],b[k]),max(c[k],d[k])) for k in (0,1)):
            return False
        s,t=side(a,b,c),side(a,b,d)
        if s==t==0:
            # Distinct collinear edges overlapping only at a permitted endpoint
            # are harmless. Interior overlap with a protected stroke is not.
            axis=0 if a[0]!=b[0] else 1
            lo=max(min(a[axis],b[axis]),min(c[axis],d[axis]))
            hi=min(max(a[axis],b[axis]),max(c[axis],d[axis]))
            return lo<hi or not any(p[axis]==lo for p in allowed)
        if any(p in (a,b) and segment_distance(p,c,d)[0]<1e-9 for p in allowed):
            return False
        return s*t<=0 and side(c,d,a)*side(c,d,b)<=0
    def touches_anchor(group,a,b,allowed=()):
        cells=list(bins(a,b))
        if any(p not in allowed and segment_distance(p,a,b)[0]<.015
               for cell in cells for p in indexed.get(cell,())):
            return True
        # Check protected long strokes and other groups even if the map omits
        # a vertex at the intersection. A nearby bend must not erase a join.
        return any(intersects(a,b,c,d,allowed) for g,c,d in
                   set().union(*(indexed_lines.get(cell,set()) for cell in cells))
                   if g!=group or (g,c,d) in protected_lines)
    def remove(e):
        group,a,b=e
        removed.add(e)
        neighbors[group,a].discard(b)
        neighbors[group,b].discard(a)

    # Coalesce only exact collinear overdraw. Neither a close parallel line
    # nor a minor bend counts as shared geometry.
    for e in sorted(lines,key=lambda e:(-math.dist(e[1],e[2]),e)):
        group,a,b=e
        if e in protected_lines or not source[a,b] or touches_anchor(group,a,b):
            continue
        if any(arcs[i]['k']!='walk' for i in source[a,b]):
            continue
        for c in sorted(neighbors[group,a] & neighbors[group,b]):
            distance,u=segment_distance(c,a,b)
            if distance<1e-9 and 0<u<1:
                remove(e)
                break

    loops = []
    for seam,gate in sorted(gates.items()):
        keys = seam_re.fullmatch(seam).groups()
        if keys[0]==keys[1] or any(not records.get(k,{}).get('circulation') or not records[k].get('walkable') or records[k].get('stair') or records[k].get('access')=='staff' for k in keys):
            continue
        ends = sorted({arcs[i][side] for i in gate for side in ('f','t')})
        if len(ends)!=2 or {(arcs[i]['f'],arcs[i]['t']) for i in gate}!={tuple(ends),tuple(reversed(ends))}:
            continue
        local = set(gate)
        peers = []
        cells = set()
        for v in ends:
            legs=incident[v]-gate
            if not legs or any(arcs[i]['levels']!=[level,level] or arcs[i]['k']!='walk' or not arcs[i]['e'].startswith('native-cell:') or ':walk:' not in arcs[i]['e'] for i in legs):
                break
            forward={arcs[i]['t'] for i in legs if arcs[i]['f']==v}
            reverse={arcs[i]['f'] for i in legs if arcs[i]['t']==v}
            if len(forward)!=1 or forward!=reverse:
                break
            peers.append(next(iter(forward)))
            cells.update(arcs[i]['e'].split(':walk:',1)[0] for i in legs)
            local.update(legs)
        if len(peers)!=2 or peers[0]==peers[1] or len(cells)!=1:
            continue
        cell=next(iter(cells))
        # The bypass itself can carry the source seam's ID in either terminal
        # position. Require its exact projected path and opposite graph arc.
        alternatives = defaultdict(set)
        for i in incident[peers[0]] & incident[peers[1]]:
            a=arcs[i]
            if set((a['f'],a['t']))!=set(peers) or a['k']!='walk' or a['levels']!=[level,level] or not a['e'].startswith(cell+':walk:'):
                continue
            pts=tuple(_line_points(a))
            forward=a['f']==peers[0]
            alternatives[pts if forward else pts[::-1]].add(forward)
        if len(alternatives)!=1:
            continue
        path,senses=next(iter(alternatives.items()))
        if len(path)<2 or len(senses)!=2 or math.dist(path[0],path[-1])>20:
            continue
        bypass=_segments(path)
        detour=set().union(*(_segments(_line_points(arcs[i])) for i in local))
        extras=detour-bypass
        if not extras or any(source[edge]-local for edge in extras):
            continue
        common=set.intersection(*(groups_by_point[p] for edge in extras|bypass for p in edge))
        if len(common)!=1:
            continue
        group=next(iter(common))
        visible=lines-removed
        if not all((group,*e) in visible for e in extras|bypass):
            continue
        if any((group,*e) in protected_lines for e in extras):
            continue
        sub=defaultdict(set)
        for a,b in extras:
            sub[a].add(b)
            sub[b].add(a)
        # The removable part must be a single nonbranching detour between two
        # distinct vertices of the same bypass. Reject real loops and side joins.
        tips={p for p,neighbors_ in sub.items() if len(neighbors_)==1}
        if len(tips)!=2 or not tips<=set(path) or any(len(v)>2 for v in sub.values()):
            continue
        seen=set()
        stack=[min(tips)]
        while stack:
            p=stack.pop()
            if p not in seen:
                seen.add(p)
                stack.extend(sub[p]-seen)
        if len(seen)!=len(sub) or any(neighbors[group,p]!=sub[p] or len(groups_by_point[p])!=1 for p in seen-tips):
            continue
        if any(touches_anchor(group,a,b,tips) for a,b in extras):
            continue
        if any(min(segment_distance(p,a,b)[0] for a,b in bypass)>2 for p in seen-tips):
            continue
        for e in sorted(extras):
            remove((group,*e))
        protected_lines.update((group,*e) for e in bypass)
        loops.append(seam)
    return removed,loops


def simplify(geo,audit,arcs,records,stops,receipt,base):
    read=lambda p:json.loads(p.read_bytes())
    branches=read(audit/'all-branches.json')
    protected=defaultdict(set);claimed=defaultdict(set)
    original={l:{key(r) for r in g['network']} for l,g in geo.items()}
    lines={l:set(s) for l,s in original.items()}
    patches={}
    for name in ('junction','building08'):
        patch=read(base/name/'display-patch.json')
        assert all(patch[k]==receipt[k] for k in ('datasetSha256','runtimeSha256'))
        l=patch['level'];rm=set(map(key,patch['remove']));add=set(map(key,patch['add']))
        assert rm<=lines[l] and not rm&protected[l]
        lines[l].difference_update(rm);lines[l].update(add);protected[l].update(add);claimed[l].update(rm|add)
        patches[name]={'removed':len(rm),'added':len(add)}
    threshold=read(base/'thresholds/patch.json')
    assert all(threshold[k]==receipt[k] for k in ('datasetSha256','runtimeSha256'))
    clipped=0;skipped=0
    for lid,patch in threshold['levels'].items():
        l=int(lid)
        for branch in patch['branches']:
            src=set(map(key,branch['source']))
            rm=set(map(key,branch['remove']));add=set(map(key,branch['add']))
            if claimed[l]&src or not rm<=lines[l]:
                skipped+=1;continue
            lines[l].difference_update(rm);lines[l].update(add);protected[l].update(add)
            clipped+=1
    general={}
    for l,g in geo.items():
        rm,loops=remove_redundant(l,lines[l],arcs,branches,stops,g['stops'],records,protected[l])
        lines[l]-=rm
        general[l]={'segmentsRemoved':len(rm),'seams':loops}
        g['network']=sorted(lines[l])
        g['previousExtra']=sorted(original[l]-lines[l])
        g['currentExtra']=sorted(lines[l]-original[l])
    return {'dataset':receipt['datasetSha256'],'runtime':receipt['runtimeSha256'],'local':patches,'thresholdsTrimmed':clipped,'localPriority':skipped,'other':general}
