import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.env.REVITER_ROOT??process.cwd()),folder=dirname(fileURLToPath(import.meta.url)),out=resolve(process.argv[2]??resolve(root,'../scratch/assembly-binding-membership-replay/actual-ten.json'));
assert(!existsSync(out));const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),modulePath=join(root,'lib/reviter/native-source-stair-assembly.ts'),implementationSha256=hash(readFileSync(modulePath));
const api=await import(pathToFileURL(modulePath).href),input=JSON.parse(readFileSync(join(folder,'../../../../../unbc-20261017/source-recovery/all-connections-review.json'),'utf8'));
const stairs=input.stairs.filter(s=>s.recordedRepairGroup==='multi-run-landing-contract-required');assert.equal(stairs.length,10);
const bytes=readFileSync(process.env.UNBC_ORIGINAL_RVT??resolve(root,'../scratch/native-source-restored/derived/UNBC.original.rvt')),started=Date.now();
const context=api.createOriginalNativeStairAssemblyContext(bytes,input.sourceModelSha256,stairs.map(s=>s.nativeStairId));
const rows=[];
for(const stair of stairs){const facts=api.inspectOriginalNativeStairAssemblyMembership(context,stair.nativeStairId);let binding;try{const h=api.bindOriginalNativeStairAssembly(context,stair.nativeStairId);binding={ok:true,assemblyMembershipSha256:h.assemblyMembershipSha256}}catch(e){binding={ok:false,blocker:String(e)}}rows.push({...facts,binding,originalHeldEdgeId:stair.id,previouslyRecordedRunIds:stair.originalRuns.map(r=>r.nativeRunId)});console.log(JSON.stringify({stair:stair.nativeStairId,runs:facts.originalRunIds,landings:facts.originalLandingIds,declared:facts.originalParentDeclaredMemberIds,binding,landingMaps:facts.members.filter(m=>m.kind==='landing').map(m=>({id:m.nativeElementId,def:m.originalDefinitionId,base:m.originalLandingBaseElevationFeet,map:m.originalLandingRisersMap}))}));}
assert.equal(hash(readFileSync(modulePath)),implementationSha256,'Assembly implementation changed during import/replay');mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({format:'actual-original-ten-stair-assembly-membership-v1',sourceModelSha256:context.sourceModelSha256,sourceSchemaSha256:context.sourceSchemaSha256,completeSourcePages:context.completeSourcePages,implementationSha256,implementationStable:true,elapsedMs:Date.now()-started,rows,sourcePhysicalJoinsApproved:false,sourceTerminalCoordinatesChanged:false,routeApproved:false},null,2)+'\n',{flag:'wx'});
