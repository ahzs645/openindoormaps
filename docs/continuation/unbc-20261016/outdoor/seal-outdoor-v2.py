import datetime,hashlib,json
from pathlib import Path
base=Path(__file__).parent
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  while block:=f.read(1024*1024):h.update(block)
 return h.hexdigest()
protected=[]
for name,path,raw in [
 ('compiler955','/workspace/scratch/unbc-pathway-repair-20261015/regeneration-source-v3-r2-before.json','5d918463420214b01486c77aa22580efa6830fe01f6a20fd06cb22d4cd62684a'),
 ('coordinator1031','/workspace/scratch/unbc-pathway-repair-20261015/stair-clearance/r2-resume1-serial-pipeline/reviewed-configuration-v2.json','3b08f92a3e3de3337625e183673ea6c705302ed233eee807589bbfe5d222d4d6')]:
 assert sha(path)==raw
 entries=json.loads(Path(path).read_text())['files']
 changes=[p for p,s in entries.items() if sha(p)!=s]
 assert not changes,changes
 protected.append({'name':name,'path':path,'sha256':raw,'filesChecked':len(entries),'allExact':True})
fixture=json.loads((base/'targeted-viewer-evidence.json').read_text());parity=json.loads((base/'actual-retention-parity.json').read_text());inventory=json.loads((base/'seven-assembly-inventory.json').read_text())
assert fixture['counts']['sourceFlights']==82 and not fixture['sourceContexts'] and len(inventory['heldStairEdgeIds'])==28
assert len(inventory['assemblies'])==7 and all(not a['savedRouteEdges'] and not a['savedRoomBoundDisplayFlights'] for a in inventory['assemblies'])
files=[{'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(base.iterdir()) if p.is_file() and p.name not in {'receipt-v2.json','sealing-v2.log'}]
receipt={'version':2,'supersedes':{'path':str(base/'receipt.json'),'sha256':sha(base/'receipt.json'),'reason':'First seal included its own then-empty stdout log; v2 excludes its active stdout log and preserves that receipt as history.'},'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'taskScope':'seven excluded source assemblies and narrow historical context-retention proposal','publishedZip':fixture['zip'],'verifiedIndoorEntry':fixture['indoorEntry'],'sourceModelSha256':fixture['source']['modelSha256'],'historicalOrigin':json.loads((base/'reviewed-stair-contexts.authoring-proposal.json').read_text())['origin'],'focusedTests':{'passed':8,'failed':0,'log':'retention-tests-final.log'},'selectedActualParity':parity,'optionalNeighborhoodExtraction':'refused at1536MiB address space; no output; not retried','protectedInventories':protected,'sourceOrRouteAuthorityGranted':False,'productionWired':False,'authoringOrCompiledDatasetModified':False,'routesEnabled':False,'all28RemainHeld':True,'preparationCacheIdentityPreservationClaimed':False,'artifactFiles':files}
with (base/'receipt-v2.json').open('x') as f:json.dump(receipt,f,indent=2);f.write('\n')
print(json.dumps({'receipt':str(base/'receipt-v2.json'),'sha256':sha(base/'receipt-v2.json'),'files':len(files),'protected':protected}))
