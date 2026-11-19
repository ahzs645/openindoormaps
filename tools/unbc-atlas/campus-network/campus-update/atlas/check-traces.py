"""Bind zooms, route self-intersections and earlier guide detours to the shipped atlas and worker."""
from pathlib import Path
import os
import json,math,sys
from collections import defaultdict
scripts=Path(__file__).resolve().parent
here=Path(os.environ.get("UNBC_ATLAS_OUTPUT",scripts)).resolve(); update=scripts.parent
sys.path.insert(0,str(update/'verification'))
from crossings import loops, levels
from evidence import compact_walk
from shapely.geometry import LineString,Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

source=Path(sys.argv[1]).resolve()
page=here/'campus-network.html'
prefix,token,chunk=page.read_text().partition('const data=')
m,end=json.JSONDecoder().raw_decode(chunk)
for w in m['walks']:w.pop('previousWalk',None)
def load(p):return json.loads(p.read_bytes())
cur=load(source/'trips/current-worker.json')
prev=load(update/'format-replay/browser-measurements.json')
assert cur['runtimeSha256']==m['summary']['runtime']
room_names={r[6]:r[0] for r in m['rooms']}
def keyed(rows,keys):
    ans={}
    for t in rows:
        if t['mode']!='public' or t.get('metres') is None:continue
        a,b=(room_names.get(t[v],t[v]) for v in keys);ans.setdefault((a,b),t)
    return ans
prior_receipt=load(update/'format-replay/installed-receipt.json')
assert prior_receipt['runtimeSha256']==prev['runtimeSha256'] and prior_receipt['datasetSha256']==prev['datasetSha256']
before=keyed(prev['rows'],('a','b'))
if source.name in {'visitor-release','final-checked'} or os.environ.get('UNBC_ATLAS_RECHECK_LOOPS')=='1':
    for p,field,runtime_key in [('verification/prior-crossing-browser.json','rows','runtimeSha256'),('loop-review/building04-upper/observed.json','cases','beforeRuntime')]:
        checks=load(update/p)
        assert checks[runtime_key]==prev['runtimeSha256'] and checks['datasetSha256']==prev['datasetSha256']
        for pair,row in keyed(checks[field],('a','b')).items():
            paths=[section['pointsFeet'] for section in row['paths'] if section['pointsFeet']]
            if paths:
                before.setdefault(pair,{**row,'departure':{'pointFeet':paths[0][0]},'arrival':{'pointFeet':paths[-1][-1]}})
after=keyed(cur['trips'],('from','to'))
# These coordinates frame the reviewed native doorway or crossing. They never supply route vertices.
visits=[('b06-bay','06-205','06-209',694,-123.662,-71.996,'06 · Vestibule 06-207'),
        ('b10-office','10-3066','10-3064',400176,108.0,770.0,'10 · Office 10-3066 approach'),
        ('b10-lower','10-S104','10-1032',1487816,81.452,804.756,'10 · Lower-floor hallway'),
        ('b04-raised','04-125','04-110',1487816,-66.45,365.51,'04 · Raised rotunda approach'),
        ('b05-library','05-234','05-248',694,233.0735,200.1349,'05 · Hallway near 05-234')]
if source.name in {'visitor-release','final-checked'} or os.environ.get('UNBC_ATLAS_RECHECK_LOOPS')=='1':
    visits.extend([('b10-upper','10-3026','10-3060',400176,107.73056,835.94498,'10 · Upper-floor crossing'),
                   ('b04-balcony','08-135','04-434',402367,-73.02002,211.144118,'04 · Upper balcony approach'),
                   ('b09-west','09-232','09-205',1450417,188.58411,514.425981,'09 · Lower-level hallway'),
                   ('b09-stair','09-S201','09-205',1450417,177.286347,450.894585,'09 · Stair landing approach')])
def rings(row):
    out={}
    if not row:return out
    acceptable=loops(row)
    for run in levels(row):
        pts=[run[0][0]]+[s[1] for s in run]
        lines=[LineString([a[:2],b[:2]]) for a,b,_ in run];tree=STRtree(lines)
        for i,line in enumerate(lines):
            for j in tree.query(line,predicate='intersects'):
                if j<i+2:continue
                hit=line.intersection(lines[j])
                if hit.geom_type!='Point':continue
                xy=hit.coords[0];ring=LineString([xy,*[p[:2] for p in pts[i+1:j+1]],xy])
                key=(round(pts[i][2],4),round(xy[0],4),round(xy[1],4),round(ring.length*.3048,3))
                if key in acceptable:out[key]=ring
    assert out.keys()==acceptable.keys(),(out.keys(),acceptable.keys())
    return out
def turns_near(row,x,y):
    found=[]
    for run in levels(row):
        for left,right in zip(run,run[1:]):
            a,b=left[:2];c=right[1]
            if math.dist(b[:2],[x,y])>21:continue
            u=[b[i]-a[i] for i in (0,1)];v=[c[i]-b[i] for i in (0,1)]
            den=math.hypot(*u)*math.hypot(*v)
            if den:
                angle=math.degrees(math.acos(min(1,max(-1,sum(a*b for a,b in zip(u,v))/den))))
                if angle>=145:found.append(round(angle,1))
    return found

# Compare the old closed path with current public arcs and entrance branches. A visible
# stroke can serve several journeys. Its presence alone does not establish a walk.
arcs=load(source/'audit/arcs.json')
branches=load(source/'audit/all-branches.json')
stops=load(source/'audit/stops.json')
def bounds_touch(points,x,y):
    return min(p[0] for p in points)<=x+40 and max(p[0] for p in points)>=x-40 and min(p[1] for p in points)<=y+40 and max(p[1] for p in points)>=y-40
def source_uses(l,x,y,shapes):
    shape=unary_union(shapes);mask=shape.buffer(.018)
    uses=defaultdict(set);doorways=set();stations=set()
    for arc in arcs:
        pts=arc['p']
        if set(arc['levels'])!={l} or len(pts)<2 or not bounds_touch(pts,x,y):continue
        line=LineString([p[:2] for p in pts])
        if mask.intersection(line).length>.12:uses[arc['k']].add(arc['e'])
    for branch in branches:
        pts=branch['branch']['pathToHallway']
        if branch['level']==l and len(pts)>=2 and bounds_touch(pts,x,y) and mask.intersection(LineString([p[:2] for p in pts])).length>.12:
            doorways.add(branch['branch']['entranceId'])
    for r in stops:
        for direction in ('depart','arrive'):
            st=r[direction]
            if st and st['levelId']==l and mask.covers(Point(st['pointFeet'][:2])):stations.add(r['key'])
    return {'publicSourceEdges':{k:sorted(v) for k,v in uses.items()},'sharedEntranceIds':sorted(doorways),'directoryStations':sorted(stations)}
# Only the changed follow-up has an earlier measured route to compare here.
elevations={r['id']:r['elevationFeet'] for r in load(source/'audit/browser-route-data.json')['nativeLevels']}
stats=[];ui=[]
for id,origin,destination,l,x,y,name in visits:
    if (origin,destination) not in after and id=='b10-lower':
        origin,destination='10-1020','10-1028'
    geo=m['geo'][str(l)]
    graph=unary_union([LineString([a,b]) for g,a,b in geo['network'] if min(a[0],b[0])<=x+40 and max(a[0],b[0])>=x-40 and min(a[1],b[1])<=y+40 and max(a[1],b[1])>=y-40]).buffer(.015)
    rows=[];old_drawn={}
    for a,b in [(origin,destination),(destination,origin)]:
        current=after.get((a,b))
        if not current:continue
        past=rings(before.get((a,b)));now=rings(current)
        near=lambda k:math.dist([x,y],k[1:3])<=28
        old_shapes={k:shape for k,shape in past.items() if near(k)}
        live={k:shape for k,shape in now.items() if near(k)}
        onmap=[list(k) for k,shape in old_shapes.items() if graph.covers(shape)]
        old_drawn.update({k:old_shapes[k] for k in map(tuple,onmap)})
        rows.append(dict(origin=a,destination=b,priorLoopsInView=len(old_shapes),currentLoopsInView=len(live),previousLoopShapesStillFullyDrawn=onmap,
                         currentLoops=[list(k) for k in live],turnsOver145Degrees=turns_near(current,x,y),walk=next((i for i,w in enumerate(m['walks']) if (w['origin'],w['destination'])==(a,b)),None)))
    if not rows:continue
    if cur['runtimeSha256']!=prev['runtimeSha256']:
        for direction in rows:
            i=direction['walk'];a,b=direction['origin'],direction['destination']
            if i is None or (a,b) not in before:continue
            prior=compact_walk({**before[a,b],'from':a,'to':b},elevations)
            if prior:m['walks'][i]['previousWalk']={'layers':prior['layers'],'metres':prior['metres'],'runtime':prev['runtimeSha256']}
    totals=sum(r['currentLoopsInView'] for r in rows); retained=sum(len(r['previousLoopShapesStillFullyDrawn']) for r in rows)
    note=('The measured public walk crosses itself here.' if totals else 'The measured public walk has no self-crossing in this view.')
    if id=='b10-office':
        peak=max((t for r in rows for t in r['turnsOver145Degrees']),default=None)
        if peak:note+=' At the approach to 10-3066, the trace turns back by '+str(round(peak))+'°.'
        else:note+=' The measured approach to 10-3066 has no turn-back of 145° or more.'
    sources=source_uses(l,x,y,list(old_drawn.values())) if old_drawn else {}
    if retained:
        note+=' The green overview still includes the earlier detour.'
        if sources['sharedEntranceIds'] or sources['directoryStations']:note+=' A room entrance or hallway stop still uses part of it.'
        elif sources['publicSourceEdges']:note+=' Its strokes overlap current public route segments.'

    note+=' Choose a direction to overlay the returned walk in blue.'
    current_ink=any(len(r['previousLoopShapesStillFullyDrawn']) for r in rows)
    ui.append(dict(id=id,name=name,level=l,building=id[1:3],box=[x-21,y-20,x+21,y+20],note=note,traceWalks=[v['walk'] for v in rows if v['walk'] is not None]))
    stats.append(dict(id=id,level=l,centre=[x,y],earlierLoopsStillOnMap=current_ink,sourceUsesOnEarlierDrawnDetour=sources,measuredDirections=rows))
assert all(x['traceWalks'] for x in ui),ui
m['reviewedViews']=[v for v in m['reviewedViews'] if v['id'] not in {r['id'] for r in ui}]+ui
proof=dict(runtime=cur['runtimeSha256'],priorRuntime=prev['runtimeSha256'],coordinateToleranceFeet=.015,
           scope='Public returned directions at the reviewed locations. Geometry within 0.018 ft identifies current overlapping source uses. A green line does not establish a traversable junction.',views=stats)
(here/'measured-trace-checks.json').write_text(json.dumps(proof,indent=2)+'\n')
page.write_text(prefix+token+json.dumps(m,separators=(',',':'),allow_nan=False).replace('</','<\\/')+chunk[end:])
print([(v['id'],[(q['origin'],q['destination'],q['priorLoopsInView'],q['currentLoopsInView'],len(q['previousLoopShapesStillFullyDrawn'])) for q in v['measuredDirections']]) for v in stats])
