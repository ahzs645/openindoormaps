from pathlib import Path
import json, collections, math
here=Path(__file__).resolve().parent
update=here.parents[1]; read=lambda p: json.loads(p.read_bytes())
def unpack(page):return json.JSONDecoder().raw_decode(page.read_text().split('const data=',1)[1])[0]
def pt(p):return tuple(round(x,2) for x in p[:2])
def seg(a,b):return tuple(sorted((pt(a),pt(b))))
layer=1450417
me=unpack(update/'final-atlas/campus-network.html')
geo=me['geo'][str(layer)]
raw=read(update/'final-checked/audit/arcs.json')
walk=collections.defaultdict(set);gates=set();arrival_stops=set()
for a in raw:
 if a['levels']!=[layer,layer]:continue
 for i,j in zip(a['p'],a['p'][1:]):
  s=seg(i,j); walk[s].add(a['e'])
  if a['k']!='walk':gates.add(s)
branches=collections.defaultdict(set)
for r in read(update/'final-checked/audit/all-branches.json'):
 if r['level']!=layer:continue
 for i,j in zip(r['branch']['pathToHallway'],r['branch']['pathToHallway'][1:]):branches[seg(i,j)].add(r['room'])
for r in read(update/'final-checked/audit/stops.json'):
 for k in ('depart','arrive'):
  if r[k] and r[k]['levelId']==layer:arrival_stops.add(pt(r[k]['pointFeet']))
if __name__=='__main__':
 for gr,a,b in geo['network']:
  s=seg(a,b);cell={x.split(':walk:')[0] for x in walk[s]}
  if math.dist(a,b)>5 and 145<a[0]<216 and 445<a[1]<528:print(s,'len',round(math.dist(a,b)),cell,'branches',len(branches[s]),'stop',set(s)&arrival_stops)
