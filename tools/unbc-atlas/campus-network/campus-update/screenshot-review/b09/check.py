"""Validate the delivered drawing, including retained public graph semantics and route overlays."""
from pathlib import Path
from collections import Counter
import hashlib,json,math,sys
here=Path(__file__).resolve().parent; update=here.parents[1]
sys.path.insert(0,str(update.parents[1]/'py'));sys.path.insert(0,str(update/'verification'))
from shapely.geometry import LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
from crossings import levels
from inventory import unpack,seg,pt
load=lambda p:json.loads(p.read_bytes())
before=unpack(update/'final-atlas/campus-network.html')
after=unpack(here/'campus-network.html')
r=load(here/'proof.json');lv='1450417'
all_marks=0;raw_refs={v[6]:v[0] for v in before['rooms']}
# The geometry layer has changed. Every route, doorway, stair/ramp, directory record,
# arrival group, route overlay and reachability relation retains its exact bytes of JSON data.
for key in before:
    if key not in ('geo','reviewedViews'):assert before[key]==after[key],key
for l,g in before['geo'].items():
    h=after['geo'][l]
    if l!=lv:assert g==h,l;continue
    for key in g:
        if key not in ('network','previousExtra','currentExtra'):assert g[key]==h[key],key
    def colored(seq):return {(group,seg(a,b)) for group,a,b in seq}
    pre,post=map(colored,(g['network'],h['network']))
    assert post<pre and len(pre-post)==r['removedSegments']
    assert pre-colored(g['currentExtra'])|colored(g['previousExtra'])==post-colored(h['currentExtra'])|colored(h['previousExtra'])
    all_marks=len(h['stops'])
proof=load(update/'final-atlas/measured-trace-checks.json')
assert proof['runtime']==r['runtime']
previous={}
for p in [update/'format-replay/browser-measurements.json',update/'verification/prior-crossing-browser.json']:
    doc=load(p);assert doc['runtimeSha256']==proof['priorRuntime']
    for t in doc['rows']:
        if t['mode']=='public' and t.get('metres'):
            previous.setdefault(tuple(raw_refs.get(t[k],t[k]) for k in ('a','b')),t)
net=unary_union([LineString([a,b]) for group,a,b in after['geo'][lv]['network']]).buffer(.015)
def ring_shape(t,signature):
    for run in levels(t):
        if abs(run[0][0][2]-signature[0])>.0001:continue
        segs=[LineString([a[:2],b[:2]]) for a,b,_ in run];tree=STRtree(segs)
        for i,seg in enumerate(segs):
            for j in tree.query(seg,predicate='intersects'):
                if j<i+2:continue
                hit=segs[j].intersection(seg)
                if hit.geom_type!='Point':continue
                p=hit.coords[0]
                if math.dist(p,signature[1:3])>.0001:continue
                loop=LineString([p,*[b[:2] for _,b,_ in run[i:j]],p])
                if abs(loop.length*.3048-signature[3])<.001:return loop
    raise ValueError(signature)
views=[]
for row in proof['views']:
    if row['level']!=int(lv):continue
    for trip in row['measuredDirections']:
        t=previous[trip['origin'],trip['destination']]
        signatures=trip['previousLoopShapesStillFullyDrawn']
        views.append(dict(id=row['id'],origin=trip['origin'],destination=trip['destination'],previous=len(signatures),
                          current=sum(net.covers(ring_shape(t,s)) for s in signatures)))
native_shapes={}
for p in [(149.09,458.78),(171.09,500.58),(172.29,501.78),(147.09,458.78)]:
    native_shapes[str(p)]=[sum(p in (pt(a),pt(b)) for group,a,b in data['geo'][lv]['network']) for data in (before,after)]
result={'runtime':r['runtime'],'levelsChecked':len(after['levels']),'allOriginalWalkingRoutesPreserved':len(after['walks']),
        'beforeSegments':len(before['geo'][lv]['network']),'afterSegments':len(after['geo'][lv]['network']),
        'unchangedDoorwayMarks':all_marks,'unchangedTransfers':len(after['transfers']),'retainedGraphDirections':after['summary']['publicTrips'],
        'metresOfRemovedRepeatedInk':sum(math.dist(a,b)*.3048 for v in r['landings'] for _,a,b in v['remove']),
        'degreeBeforeAfter':native_shapes,'oldGuideLoopsFullyVisible':views}
(here/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
