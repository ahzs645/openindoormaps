from pathlib import Path
import json,sys
p=Path(__file__).resolve().parent;campus=p.parents[2];sys.path.insert(0,str(campus))
from physical_level_overview import apply_physical_levels, _entry
from shapely.geometry import LineString,Point
d,_=json.JSONDecoder().raw_decode((campus/'campus-update/final-atlas/campus-network.html').read_text().split('const data=',1)[1])
a=campus/'campus-update/final-checked/audit'
previous=lambda g:({_entry(s) for s in g['network']}-{_entry(s) for s in g['currentExtra']})|{_entry(s) for s in g['previousExtra']}
old={l:previous(g) for l,g in d['geo'].items()};original={l:{_entry(x) for x in g['network']} for l,g in d['geo'].items()};transfers=json.dumps(d['transfers'],sort_keys=True)
data=json.loads((a/'browser-route-data.json').read_bytes());arcs=json.loads((a/'arcs.json').read_bytes())
proof=apply_physical_levels(d,a,data,arcs);print(proof['mixedLevelArcs'],len(proof['walks']),proof['addedSegments'])
assert proof['addedSegments']==3 and len(proof['walks'])==2
assert apply_physical_levels(d,a,data,arcs)['addedSegments']==0
for lv,g in d['geo'].items():
 assert old[lv]==previous(g)
 if lv!='1487816':assert original[lv]=={_entry(x) for x in g['network']}
assert json.dumps(d['transfers'],sort_keys=True)==transfers
from copy import deepcopy
base,_=json.JSONDecoder().raw_decode((campus/'campus-update/final-atlas/campus-network.html').read_text().split('const data=',1)[1])
ids={w['source'] for w in proof['walks']}
control=[row for row in arcs if row['e'] in ids]
checks={}
def held(name,rows,meta=None):
    run=apply_physical_levels(deepcopy(base) if meta is None else meta,a,data,rows)
    assert run['addedSegments']==0,name
    checks[name]=True
held('missing reverse public walk',[v for v in control if v['levels'][0]<=v['levels'][-1]])
wrong=deepcopy(control)
for v in wrong:
    if v['levels'][0]!=v['levels'][-1]: v['p'][0][2]+=.1
held('sloping transfer geometry',wrong)
closed=deepcopy(base)
for t in closed['transfers']:
    if t['key']=='unbc-04-lift':t['status']='Held'
held('unavailable lift',control,closed)
wrong=deepcopy(control)
for v in wrong:
    if v['levels'][0]!=v['levels'][-1]: v['p'].insert(1,[0,0,v['p'][0][2]])
held('path outside native shelf face',wrong)
retired=deepcopy(base)
for r in proof['walks']:
    retired['geo']['1487816']['previousExtra'].extend(r['segments'])
held('spans suppressed by earlier display review',control,retired)
isolated=deepcopy(base); isolated['geo']['1487816']['network']=[]
held('no confirmed district anchor',control,isolated)
(p/'upper-display-proof.json').write_text(json.dumps(dict(**proof,previousLayerIdentical=True,repeatAddsNothing=True,originalTransferGeometriesIdentical=True,negativeControls=checks),indent=2))
