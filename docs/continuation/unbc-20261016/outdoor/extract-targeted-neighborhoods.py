"""Bounded raw JSON inspection authorized by root; never invokes a map importer.
Select issues/nearby record locators, not routes or geometry certificates.
"""
import hashlib,json,resource,zipfile,re,time
from pathlib import Path
resource.setrlimit(resource.RLIMIT_AS,(1536*1024**2,1536*1024**2))
base=Path(__file__).parent
small=json.loads((base/'targeted-viewer-evidence.json').read_text())
ids={1842431,1460777,1821194,1523099,1844188,1728649,1727059}
flights=[f for f in small['selectedSourceFlights'] if f['stairElementId'] in ids]
def bounds(points):return [min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
def distance(a,b):return max(a[0]-b[2],b[0]-a[2],a[1]-b[3],b[1]-a[3],0)
start=time.monotonic()
with zipfile.ZipFile(small['zip']['path']) as z:
 raw=z.read(small['indoorEntry']['path'])
 assert len(raw)==small['indoorEntry']['bytes'] and hashlib.sha256(raw).hexdigest()==small['indoorEntry']['sha256']
 data=json.loads(raw)
 del raw
rows=[]
for f in flights:
 relatedids={f['stairElementId'],*(r['runElementId'] for r in f.get('runs',[])),*(l['nativeElementId'] for l in f.get('landings',[]))}
 box=bounds([p for t in f['treads'] for p in t['ringFeet']])
 issues=[]
 for issue in data.get('issues',[]):
  if issue.get('nativeElementId') in relatedids or any(re.search(r'(?<!\d)'+str(i)+r'(?!\d)',str(issue.get('message',''))) for i in relatedids):issues.append(issue)
 nearby=[]
 for r in data['records']:
  if r['levelId'] not in f['levelIds']:continue
  ps=[p for ring in r['ringsFeet'] for p in ring]
  if ps and distance(box,bounds(ps))<=10:
   nearby.append({k:r[k] for k in ['key','number','name','building','levelId','elevationFeet','stair','circulation','access','walkable','arrivalNodeId'] if k in r}|{'bboxFeet':bounds(ps),'bboxSeparationFeet':distance(box,bounds(ps))})
 rows.append({'stairElementId':f['stairElementId'],'treadProjectionBoundsFeet':box,'issues':issues,'nearbyRecordLocators':nearby,'nearbyRecordsAreNotAssociations':True})
result={'version':1,'inputIndoorSha256':small['indoorEntry']['sha256'],'method':'raw JSON inspection; no indoor importer, no geometry reconstruction','assemblies':rows,'allStairEdges':[e for e in data['edges'] if e['kind']=='stairs'],'issueCount':len(data.get('issues',[])),'runtime':{'elapsedSeconds':time.monotonic()-start,'maxRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'addressSpaceLimitBytes':1536*1024**2}}
with (base/'targeted-neighborhood-evidence.json').open('x') as out:json.dump(result,out,indent=2);out.write('\n')
print(json.dumps({'assemblies':[{'id':r['stairElementId'],'issues':len(r['issues']),'nearby':len(r['nearbyRecordLocators'])} for r in rows],'stairEdges':len(result['allStairEdges']),'heldStairEdges':sum(e.get('enabled') is False for e in result['allStairEdges']),'runtime':result['runtime']}))
