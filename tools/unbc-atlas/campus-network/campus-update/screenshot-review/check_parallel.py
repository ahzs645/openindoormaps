"""Check the neighboring north–south Agora lines against true same-face graph vertices."""
from pathlib import Path
import json,sys,collections
here=Path(__file__).resolve().parent;campus=here.parents[1]
sys.path.insert(0,str(campus))
from landing_overview import line,straight
audit=Path(sys.argv[1]) if len(sys.argv)>1 else here/'release/audit';out=Path(sys.argv[2]) if len(sys.argv)>2 else here/'atlas/agora-parallel-check.json'
arcs=json.loads((audit/'arcs.json').read_bytes())
donor='walk:ramp:1622190:lower';rows=[r for r in arcs if r['e']==donor and r['levels']==[311,311] and len(r['p'])>=2]
assert rows
adj=collections.defaultdict(list)
for r in arcs:
    if r['levels']==[311,311] and r['k']=='walk' and r['e'].startswith('native-cell:0.000000:71:walk:'):
        adj[r['f']].append((r,line(r).length))
records=[]
for r in rows:
    p=r['p'];alt=straight(r['f'],r['t'],adj)
    records.append(dict(source=r['e'],fromVertex=r['f'],toVertex=r['t'],coordinates=p,
                        displayedLengthFeet=line(r).length,identicalEndpointSameFaceAlternative=bool(alt),
                        alternateSourceEdges=[a['e'] for a in alt] if alt else []))
out.write_text(json.dumps({'runtime':json.loads((audit/'installed-receipt.json').read_bytes())['runtimeSha256'],
    'logicalLevel':311,'nativeFace':'native-cell:0.000000:71','arcs':records},indent=2)+'\n')
print(len(records),'directed approach pieces',sum(r['identicalEndpointSameFaceAlternative'] for r in records),'have same-face alternatives')
