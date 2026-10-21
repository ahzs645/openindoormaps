import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {createOriginalNativeStairPhysicalContext,inspectOriginalNativeStairPhysicalInventory,readOriginalNativeStairPhysicalSource} from '/workspace/reviter/lib/reviter/native-source-stair-physical-inventory.ts';
import {certifyOriginalNativePlacedStairEnvelope} from '/workspace/reviter/lib/reviter/native-source-stair-placed-envelope.ts';
import {inspectOriginalStairTypedRiserSequence} from '/workspace/reviter/lib/reviter/native-source-stair-stepped-stations.ts';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const output=process.argv[2];assert(output,'Supply output JSON path');
const folder=dirname(output);mkdirSync(join(folder,'implementation-snapshot'),{recursive:true});
const modules=['native-source-stair-physical-inventory.ts','native-source-stair-placed-envelope.ts','native-source-stair-support-envelopes.ts','native-source-stair-local-material.ts','native-source-stair-stepped-stations.ts'];
const implementationSnapshots=Object.fromEntries(modules.map(name=>{const bytes=readFileSync('/workspace/reviter/lib/reviter/'+name);writeFileSync(join(folder,'implementation-snapshot',name+'.txt'),bytes);return [name,hash(bytes)]}));
const inventoryPath='/workspace/openindoormaps/docs/continuation/unbc-20261017/source-recovery/all-connections-review.json';
const inventoryBytes=readFileSync(inventoryPath),inventory=JSON.parse(inventoryBytes.toString());
const requests=inventory.stairs.flatMap(s=>s.originalRuns.map(r=>({nativeStairId:s.nativeStairId,nativeRunId:r.nativeRunId,nativeDefinitionId:r.nativeDefinitionId})));
assert.equal(requests.length,38);assert.equal(new Set(requests.map(r=>r.nativeRunId)).size,38);
const bytes=readFileSync(process.env.UNBC_ORIGINAL_RVT??'/workspace/scratch/native-source-restored/derived/UNBC.original.rvt');
const started=Date.now(),context=createOriginalNativeStairPhysicalContext(bytes,inventory.sourceModelSha256,requests),contextElapsedMs=Date.now()-started;
assert.equal(context.completeSourcePages,3666);assert.deepEqual(context.missingOriginalRecords,[]);
const rows:any[]=[];
const save=(complete:boolean)=>{
 const groups=Object.fromEntries([...new Set(inventory.stairs.map(s=>s.recordedRepairGroup))].map(group=>{const r=rows.filter(r=>r.recordedRepairGroup===group);return [group,{runs:r.length,sourceCensusComplete:r.filter(r=>r.inventory.completeOriginalSourceFaceCensus).length,namedRiserSequenceComplete:r.filter(r=>r.riserSequence.completeNamedSourceRiserSequence).length,placedEnvelopeAvailable:r.filter(r=>r.placedEnvelope.ok).length,localizedMaterialAvailable:r.filter(r=>r.placedEnvelope.ok&&r.placedEnvelope.summary.sourceMaterialLocalizationBlockers.length===0).length}]}));
 writeFileSync(output,JSON.stringify({format:'all-held-current-source-census-v1',complete,sourceModelSha256:context.sourceModelSha256,sourceSchemaSha256:context.sourceSchemaSha256,sourceInventorySha256:hash(inventoryBytes),completeSourcePages:context.completeSourcePages,missingOriginalRecords:context.missingOriginalRecords,implementationSnapshots,implementationFilesystemHashesAtWrite:Object.fromEntries(modules.map(name=>[name,hash(readFileSync('/workspace/reviter/lib/reviter/'+name))])),contextElapsedMs,elapsedMs:Date.now()-started,requestedStairs:28,requestedRuns:38,completedRuns:rows.length,groups,rows,exactSolidCertificationAttempted:false,stationsProposed:false,servedApproachesApproved:false,physicalClearanceApproved:false,physicalBodyApproved:false,routeApproved:false},null,2)+'\n');
};
save(false);console.log(JSON.stringify({contextElapsedMs,pages:context.completeSourcePages,runs:requests.length}));
for(const request of requests){
 const rowStarted=Date.now(),roles=inspectOriginalNativeStairPhysicalInventory(context,request.nativeRunId),source=readOriginalNativeStairPhysicalSource(context,request.nativeRunId),typed=inspectOriginalStairTypedRiserSequence(source.run,roles.sourceTypedTreadCount);
 const typedElapsedMs=Date.now()-rowStarted;
 const placed=certifyOriginalNativePlacedStairEnvelope(context,request.nativeRunId);
 const stair=inventory.stairs.find(s=>s.nativeStairId===request.nativeStairId);
 const {treads,...inventorySummary}=roles;
 rows.push({...request,recordedRepairGroup:stair.recordedRepairGroup,recordedFirstUnsupportedCondition:stair.recordedFirstUnsupportedCondition,assemblyRunCount:stair.originalRuns.length,actualOriginalRunBottomElevationFeet:source.run.root.m_bottomElevation,actualOriginalRunTopElevationFeet:source.run.root.m_topElevation,actualOriginalRunTerminalLayout:{beginWithRiser:source.run.root.m_beginWithRiser,endWithRiser:source.run.root.m_endWithRiser,baseRiserIndex:source.run.root.m_baseRiserIndex,topRiserIndex:source.run.root.m_topRiserIndex,orderedRiserCount:Array.isArray(source.run.root.m_orderedRisers)?source.run.root.m_orderedRisers.length:null},inventory:{...inventorySummary,physicalTreadCount:treads.length,typedHeightDiscrepancies:treads.filter(t=>!t.exactHeightMatchesTyped).map(t=>t.typedIndex),nonidenticalOriginalUVCoedges:treads.filter(t=>!t.exactUVCoedgeContinuity).map(t=>t.typedIndex)},riserSequence:{completeNamedSourceRiserSequence:typed.completeNamedSourceRiserSequence,orderedRisers:typed.orderedRisers.length,treadRelations:typed.treadRelations.length,blockers:typed.blockers},placedEnvelope:placed.ok?{ok:true,summary:placed.summary}:{ok:false,blockers:placed.blockers},timings:{inventoryAndTypedMs:typedElapsedMs,placedEnvelopeMs:Date.now()-rowStarted-typedElapsedMs,totalMs:Date.now()-rowStarted},noStationOrClearanceAuthority:true,routeApproved:false});
 save(false);console.log(JSON.stringify({run:request.nativeRunId,group:stair.recordedRepairGroup,census:roles.completeOriginalSourceFaceCensus,risers:typed.completeNamedSourceRiserSequence,placed:placed.ok,localizationBlockers:placed.ok?placed.summary.sourceMaterialLocalizationBlockers:placed.blockers,elapsedMs:Date.now()-rowStarted}));
}
save(true);console.log(JSON.stringify({complete:true,runs:rows.length,elapsedMs:Date.now()-started}));
