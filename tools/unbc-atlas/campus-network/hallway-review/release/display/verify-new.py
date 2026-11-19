"""Verify that new public route lines and newly available hallway stops survive the final atlas drawing."""
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
import argparse
import json
from rebind import DEFAULT_OLD,HERE,ROOT,read,write,graphic,xy,edge
from shapely.geometry import Point,LineString
from shapely.strtree import STRtree
from shapely.ops import unary_union

class Network:
    def __init__(self,rows):
        self.lines={edge(a,b) for _,a,b in rows if xy(a)!=xy(b)}
        self.shapes=[LineString(pair) for pair in self.lines]
        self.index=STRtree(self.shapes)
    @lru_cache(maxsize=None)
    def retains(self,coords):
        if len(coords)==2 and coords in self.lines:return True
        target=LineString(coords) if len(coords)==2 else Point(coords[0])
        near=[self.shapes[int(i)] for i in self.index.query(target.buffer(.012))]
        return bool(near) and unary_union(near).buffer(.012).covers(target)

def signature(a):
    return (a['e'],a['f'],a['t'],a['k'],tuple(a['levels']),tuple(map(tuple,a['p'])))

def index_stations(audit):
    return {(row['key'],direction):(s['levelId'],tuple(s['pointFeet'])) for row in read(audit/'stops.json') for direction in ('depart','arrive') if (s:=row[direction])}

def verify(args):
    old,new,atlas=args.baseline,args.audit,args.map
    data=json.JSONDecoder().raw_decode(atlas.read_text().split('const data=',1)[1])[0]
    new_input=graphic(new)
    def grouped(by_level):
        out={}
        for level,rows in by_level.items():
            groups=defaultdict(list)
            for row in rows:groups[row[0]].append(row)
            out[int(level)]={g:Network(geometry) for g,geometry in groups.items()}
        return out
    input_net=grouped(new_input['visitorSegments'])
    final_net=grouped({l:g['network'] for l,g in data['geo'].items()})
    def represented(level,coordinates):
        return {g for g,graph in input_net.get(level,{}).items() if graph.retains(coordinates)}
    def retained_groups(level,groups,coordinates):
        return all(g in final_net.get(level,{}) and final_net[level][g].retains(coordinates) for g in groups)
    rooms={r['k']:r for r in new_input['rooms']}
    receipt=read(new/'installed-receipt.json')
    bound=read(args.proof)
    assert all(bound[k]==receipt[k] for k in ('runtimeSha256','compressedSha256'))
    assert data['summary']['runtime']==receipt['runtimeSha256'] and data['summary']['source']==receipt['datasetSha256']
    old_arcs={signature(a) for a in read(old/'arcs.json')}
    new_arcs=[a for a in read(new/'arcs.json') if signature(a) not in old_arcs]
    before_stops=index_stations(old);changes={key:value for key,value in index_stations(new).items() if before_stops.get(key)!=value}
    new_lines=defaultdict(set); vertical=defaultdict(set);lost=[]
    for a in new_arcs:
        if len(set(a['levels']))!=1:
            for l,point in zip((a['levels'][0],a['levels'][-1]),(a['p'][0],a['p'][-1])):
                vertical[l].add((xy(point),))
            continue
        l=a['levels'][0]
        for u,v in zip(a['p'],a['p'][1:]):
            if xy(u)!=xy(v): new_lines[l].add(edge(u,v))
    counted=0;not_drawn=0
    for l,es in new_lines.items():
        for e in es:
            groups=represented(l,e)
            if not groups:
                not_drawn+=1;continue
            counted+=1
            if not retained_groups(l,groups,e):lost.append({'kind':'new public line','level':l,'groups':sorted(groups),'line':e})
    nstations=0;outside=0
    for key,(l,p) in changes.items():
        point=(xy(p),)
        g=rooms[key[0]]["d" if key[1]=="depart" else "a"]
        if g not in represented(l,point):
            outside+=1;continue
        nstations+=1
        if not retained_groups(l,{g},point):lost.append({'kind':'new public station','key':key,'group':g,'level':l,'point':point})
    landings=0
    for l,points in vertical.items():
        for point in points:
            groups=represented(l,point)
            if groups:
                landings+=1
                if not retained_groups(l,groups,point):lost.append({'kind':'vertical transfer','level':l,'groups':sorted(groups),'point':point})
    old_branches={r['room']:r for r in read(old/'all-branches.json')}
    current_doors=read(new/'public-room-branches.json')['doors']
    changed_branches=[r for r in read(new/'all-branches.json') if r!=old_branches.get(r['room'])]
    protected_approaches=0;unsigned=[]
    for row in changed_branches:
        r=row['room'];branch=row['branch'];d=current_doors.get(branch['entranceId']);pts=branch['pathToHallway']
        if not d or not d.get('normalFeet'):
            unsigned.append(r);continue
        origin,normal=d['pointFeet'],d['normalFeet']
        offset=lambda q:sum((q[k]-origin[k])*normal[k] for k in (0,1))
        for i,(a,b) in enumerate(zip(pts,pts[1:])):
            src,dst=offset(a),offset(b)
            if src*dst<=0 and src!=dst:
                t=src/(src-dst)
                crossing=tuple(a[j]+t*(b[j]-a[j]) for j in (0,1))
                break
        else:
            unsigned.append(r);continue
        l=row['level']
        suffix=[crossing,*pts[i+1:]]
        groups={rooms[r][v] for v in ('d','a') if rooms[r][v] is not None}
        # The overview can shorten the interior tip. Keep every group which represented
        # the branch from its verified threshold to the hallway in the raw drawing.
        for a,b in zip(suffix,suffix[1:]):
            if xy(a)==xy(b):continue
            line=edge(a,b);present=groups & represented(l,line)
            if not present:continue
            protected_approaches+=1
            if not retained_groups(l,present,line):lost.append({'kind':'new verified room approach','room':r,'level':l,'line':line})
    stats={'runtimeSha256':receipt['runtimeSha256'],'newOrChangedDirectedArcs':len(new_arcs),'newOrChangedStationDirections':len(changes),
           'distinctHorizontalSegmentsOnNewArcs':sum(map(len,new_lines.values())),'newArcSegmentsInOriginalOverview':counted,'newArcSegmentsOutsideOriginalOverview':not_drawn,
           'newOrChangedStationDirectionsInOriginalOverview':nstations,'newOrChangedStationDirectionsOutsideOriginalOverview':outside,
           'newTransferEndsInOriginalOverview':landings,'newOrChangedRoomBranches':len(changed_branches),
           'changedApproachSegmentsInOriginalOverview':protected_approaches,'changedBranchesWithoutVerifiedDoorPlane':unsigned,'lostDrawings':lost}
    write(args.output,stats)
    print(json.dumps(stats,indent=2))
    return int(bool(lost))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audit',type=Path,default=HERE.parent/'audit');parser.add_argument('--baseline',type=Path,default=DEFAULT_OLD)
    parser.add_argument('--map',type=Path,default=ROOT/'campus-network/campus-network.html')
    parser.add_argument('--proof',type=Path,default=HERE/'rebind-proof.json')
    parser.add_argument('--output',type=Path,default=HERE/'new-uses-verification.json')
    raise SystemExit(verify(parser.parse_args()))
