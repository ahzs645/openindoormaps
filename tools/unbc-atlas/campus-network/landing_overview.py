"""Draw a shared same-face approach when a ramp's per-destination spokes duplicate it."""
import collections, gzip, hashlib, heapq, json, math, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent/'py'))
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union,polygonize
from shapely.strtree import STRtree

def load(p):return json.loads(p.read_bytes())
def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def xy(p):return tuple(round(v,2) for v in p[:2])
def seg(a,b):return tuple(sorted((xy(a),xy(b))))
def line(row):return Point(row['p'][0][:2]) if len(row['p'])==1 else LineString([p[:2] for p in row['p']])
def segments(points):return {seg(a,b) for a,b in zip(points,points[1:]) if xy(a)!=xy(b)}
def shape(edge):return LineString(edge)
def straight(source,destination,adj):
    q=[(0,source)];cost={source:0};previous={}
    while q:
        length,k=heapq.heappop(q)
        if length!=cost[k]:continue
        if k==destination:
            path=[]
            while k!=source:
                a=previous[k];path.append(a);k=a['f']
            return list(reversed(path))
        for e,w in adj.get(k,()):
            v=e['t'];c=length+w
            if c<cost.get(v,math.inf):
                previous[v]=e;cost[v]=c;heapq.heappush(q,(c,v))
    return None

def source_face(topology,cell):
    def point(i):
        p=topology['coordinates'][i];return [int(p[k][0])/int(p[k][1]) for k in ('x','y')]
    src=next(r for r in topology['faces'] if r['id']==cell)
    return unary_union([Polygon([point(i) for i in rings[0]],[[point(i) for i in hole] for hole in rings[1:]]) for rings in src['parts']])

def component_ids(lines):
    adj=collections.defaultdict(set)
    for a,b in lines:adj[a].add(b);adj[b].add(a)
    result={}
    for node in adj:
        if node in result:continue
        todo=[node];result[node]=node
        while todo:
            for nxt in adj[todo.pop()]:
                if nxt not in result:
                    result[nxt]=node;todo.append(nxt)
    return result

def reviewed_landing(data,landing,arcs,all_branches,stops,topology):
    """Return a removal-only patch with a same-face, two-way path for each eligible source."""
    source=collections.defaultdict(list)
    for a in arcs:
        if a['k']=='opening' and a['e'].startswith('native-circulation:') and json.dumps([landing],separators=(',',':')) in (a['f'],a['t']):
            source[a['e']].append(a)
    assert source and all(len(a['levels'])==2 for members in source.values() for a in members)
    lv,={l for members in source.values() for a in members for l in a['levels']}
    g=data['geo'][lv] if lv in data['geo'] else data['geo'][str(lv)]
    lev=[a for a in arcs if a['levels']==[lv,lv]]
    cells=collections.defaultdict(lambda:collections.defaultdict(list))
    owners=collections.defaultdict(set)
    for a in lev:
        for edge in segments(a['p']):owners[edge].add(a['e'])
        if a['k']=='walk' and a['e'].startswith('native-cell:') and ':walk:' in a['e']:
            cells[a['e'].split(':walk:')[0]][a['f']].append((a,line(a).length))
    faces={};report=[];eligible=set()
    for name,rows in sorted(source.items()):
        if len(rows)!=2 or rows[0]['f']!=rows[1]['t'] or rows[0]['t']!=rows[1]['f'] or rows[0]['p']!=rows[1]['p'][::-1]:
            report.append(dict(id=name,status='one-way or different directional geometry'));continue
        result={'id':name,'status':'no common core walkway on the same native face'}
        for cell,adj in cells.items():
            if not all(a['f'] in adj for a in rows):continue
            alt=[straight(a['f'],a['t'],adj) for a in rows]
            if not all(alt):continue
            if cell not in faces:faces[cell]=source_face(topology,cell)
            face=faces[cell].buffer(.00001)
            original=line(rows[0]);corridor=[]
            for direction,path in enumerate(alt):
                fallback=[tuple(p[:2]) for p in rows[direction]['p']]
                points=[];continuous=True
                for source_arc in path:
                    section=[tuple(p[:2]) for p in source_arc['p']]
                    if points and math.dist(points[-1],section[0])>.00001:
                        continuous=False;break
                    points.extend(section)
                if (not continuous or not points or math.dist(points[0],fallback[0])>.00001 or
                        math.dist(points[-1],fallback[-1])>.00001):
                    break
                # Close tiny numeric seams explicitly before polygonizing. Otherwise
                # two lines can enclose a column without forming a GEOS polygon.
                closed=LineString(fallback+list(reversed(points))+fallback[:1])
                lines=unary_union(closed)

                # A hole or partition inside an alternative loop makes it a different
                # physical passage even when the endpoints and components are identical.
                region=unary_union([lines,*polygonize(lines)])
                if not face.covers(region):break
                corridor.append(sum(line(a).length for a in path))
            if len(corridor)<2:
                result.update(status='alternative surrounds material or leaves source face');continue
            eligible.add(name)
            result.update(status='same-face public alternative',cell=cell,sourceFeet=original.length,
                          alternativeFeet=corridor,alternateSourceEdges=[[a['e'] for a in path] for path in alt],
                          fromVertex=rows[0]['f'],toVertex=rows[0]['t'])
            break
        report.append(result)
    families={r['e'] for ns in source.values() for r in ns}
    branches=set()
    for r in all_branches:
        if r['level']==lv:branches.update(segments(r['branch']['pathToHallway']))
    protected=set()
    for r in stops:
        for mode in ('depart','arrive'):
            s=r[mode]
            if s and s['levelId']==lv:protected.add(xy(s['pointFeet']))
    for a in lev:
        if a['e'] not in families and a['k']!='walk':
            protected.update((xy(a['p'][0]),xy(a['p'][-1])))
    for t in data['transfers']:
        protected.update(xy(v['xy']) for v in t['ends'] if v['l']==lv)
    protected.update(xy(p) for _,p in g['stops'])
    protected.update(p for k in families for r in source[k] for p in (xy(r['p'][0]),xy(r['p'][-1])))
    groups=collections.defaultdict(set)
    for group,a,b in g['network']:groups[group].add(seg(a,b))
    patch=[];held=[];proof=[]
    for group,network in groups.items():
        proposed={e for e in network if owners[e] and owners[e]<=eligible and e not in branches}
        if not proposed:continue
        other={e for e,v in owners.items() if v-eligible}|branches
        core=[shape(e) for e in other];tree=STRtree(core)
        # Preserve partial collinear overlaps when a current branch/arc splits the same rail differently.
        for e in list(proposed):
            l=shape(e)
            if any(l.intersection(core[i]).length>.015 for i in tree.query(l)):proposed.remove(e)
        # A protected station lying in a stroke's interior must remain on actual network ink.
        stationary=[Point(p) for p in protected];idx=STRtree(stationary)
        remaining=unary_union([shape(e) for e in network-proposed]).buffer(.015)
        for e in list(proposed):
            l=shape(e).buffer(.015)
            if any(l.covers(stationary[i]) and not remaining.covers(stationary[i]) for i in idx.query(l)):
                proposed.remove(e);held.append([group,*e,'retained physical station'])
        anchors=protected|{p for e in network-proposed for p in e}
        original=component_ids(network)
        minimum={k:v for k,v in original.items() if k in anchors}
        def cut_ok(removed):
            after=component_ids(network-removed);mapped={}
            for p,c in minimum.items():
                if p not in after or after[p]!=mapped.setdefault(c,after[p]):return False
            return len(set(after.values()))<=len(set(original.values()))
        if not cut_ok(proposed):
            # Prefer paths attached to a genuine native endpoint. Re-designating a
            # connected graph intersection as a junction is never needed.
            restore=[]
            for k in sorted(eligible,key=lambda n:line(source[n][0]).length):
                own=segments(source[k][0]['p'])&proposed
                if own:restore.append(own)
                proposed-=own
                if cut_ok(proposed):break
            if not cut_ok(proposed):raise AssertionError('protected graphic connectivity')
            for part in reversed(restore):
                if cut_ok(proposed|part):proposed.update(part)
        assert cut_ok(proposed)
        patch.extend([group,*e] for e in sorted(proposed))
        proof.append(dict(group=group,before=len(network),after=len(network-proposed),componentsBefore=len(set(original.values())),
                          protectedVertices=len(minimum),protectedComponentPartitionIdentical=cut_ok(proposed)))
    key=lambda row:(row[0],seg(*row[1:]))
    actual={key(row) for row in g['network']};old={key(row) for row in g['previousExtra']}|(actual-{key(row) for row in g['currentExtra']})
    after=actual-{key(row) for row in patch}
    serial=lambda s:[[group,*e] for group,e in sorted(s)]
    if patch:
        g.update(network=serial(after),currentExtra=serial(after-old),previousExtra=serial(old-after))
    return dict(level=lv,landing=landing,sources=report,remove=patch,held=held,groups=proof)


def apply_reviewed_landings(payload,audit):
    """Clean verified ramp fans in the public overview in place. Return replayable source evidence.

    Supports payload geo keys as native integer IDs or their JSON string form. The previous
    drawing is reconstructed before a cut and preserved exactly by updating the symmetric diff.
    """
    audit=Path(audit)
    receipt=load(audit/'installed-receipt.json')
    for item in (load(audit/'visitor-display-proof.json'),load(audit/'public-room-branches.json')):
        assert all(item[k]==receipt[k] for k in ('datasetSha256','runtimeSha256'))
    assert payload['summary']['source']==receipt['datasetSha256'] and payload['summary']['runtime']==receipt['runtimeSha256']
    arcs=load(audit/'arcs.json')
    by_landing=collections.defaultdict(set)
    for a in arcs:
        if a['k']=='opening' and a['e'].startswith('native-circulation:') and len(set(a['levels']))==1:
            for v in (a['f'],a['t']):
                node=json.loads(v)
                if len(node)==1 and isinstance(node[0],str) and node[0].startswith('ramp:'):
                    by_landing[node[0]].add(a['e'])
    landings=sorted({e['node'] for t in payload['transfers'] if t['type']=='Ramp' for e in t['ends']})
    fans=[k for k in landings if len(by_landing[k])>=2]
    asset=audit.parent/'openindoormaps/public'/receipt['url'].lstrip('/')
    assert digest(asset)==receipt['compressedSha256']
    with gzip.open(asset) as stream:packed=json.load(stream)
    assert packed['datasetSha256']==receipt['datasetSha256'] and packed['hydration']['runtimeSha256']==receipt['runtimeSha256']
    assert packed['source']==receipt['source']
    branches=load(audit/'all-branches.json');stops=load(audit/'stops.json')
    checked=[reviewed_landing(payload,landing,arcs,branches,stops,packed['topology']) for landing in fans]
    return dict(runtime=receipt['runtimeSha256'],dataset=receipt['datasetSha256'],cache=receipt['compressedSha256'],
                evidenceFiles={n:digest(audit/n) for n in ('arcs.json','stops.json','all-branches.json','visitor-display-proof.json','public-room-branches.json')},
                surveyedEndpoints={k:len(by_landing[k]) for k in landings},landings=checked,
                removedSegments=sum(len(row['remove']) for row in checked))
