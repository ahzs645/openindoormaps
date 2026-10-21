/** All five source placements in one complete actual-RVT census. Discovery
 * locators cannot approve geometry, membership, operation, owners or access. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {preparedDisplayEngineBinding} from "../../../../../scripts/indoor/prepared-display-engine-binding.ts";
import {createOriginalNativeForeignEnvelopeCensus,originalNativeForeignEnvelopeFacts,readOriginalForeignEnvelopeScopedFrame} from "../../../../../../reviter/lib/reviter/native-source-foreign-envelope-census.ts";
import {certifyOriginalCurtainCellBindings} from "../../../../../../reviter/lib/reviter/native-source-curtain-cell-bindings.ts";
import {certifyOriginalCurtainMaterialContainer,originalCurtainMaterialContainerFact} from "../../../../../../reviter/lib/reviter/native-source-curtain-material-container.ts";
import {inspectOriginalCurrentCurtainDoorDefinition} from "../../../../../../reviter/lib/reviter/native-source-curtain-door-definition.ts";
import {inspectFilledThresholdFrames} from "../../../../../../reviter/lib/reviter/native-filled-threshold-body.ts";
import {certifyOriginalFilledThresholdDemand,auditOriginalFilledThresholdDemand,auditOriginalFilledThresholdFloorSupport,auditOriginalFilledThresholdSupportedMaterial} from "../../../../../../reviter/lib/reviter/native-filled-threshold-step.ts";
import {decodeRevit2027FramedGRepRoot} from "../../../../../../reviter/lib/reviter/revit-2027-framed-grep-root.ts";
import {replayRevit2027GRepFifo} from "../../../../../../reviter/lib/reviter/revit-2027-grep-replay.ts";
import {revit2027OwnerMeshIndex,revit2027OwnerSurface} from "../../../../../../reviter/lib/reviter/revit-2027-owner-mesh-index.ts";
import type {Revit2027PlaneSurface} from "../../../../../../reviter/lib/reviter/revit-2027-surfaces.ts";
import {Rational,rational,nativeRationalOverlay} from "../../../../../../reviter/lib/reviter/native-rational-overlay.ts";
const [original,output,dependenciesPath,drawingReviewPath]=process.argv.slice(2);
if(!original||!output||!dependenciesPath||!drawingReviewPath)throw Error("Usage: replay-five-original-thresholds.mts ORIGINAL.rvt NEW-OUTPUT SOURCE-DEPENDENCIES.json DRAWING-REVIEW.json");
const hash=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex"),modelSha="8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178";
const projectRoot=resolve(new URL("../../../../../",import.meta.url).pathname),consumerRoots=["../reviter/package-lock.json","../reviter/lib/reviter/native-filled-threshold-step.ts","../reviter/lib/reviter/native-source-curtain-door-definition.ts"],
 sourceBefore=preparedDisplayEngineBinding(projectRoot,consumerRoots,{namespace:"original-filled-threshold-consumer-v1"}),driverBytes=await readFile(new URL(import.meta.url));
const encode=(v:unknown):unknown=>v instanceof Rational?{numerator:v.n.toString(),denominator:v.d.toString()}:typeof v==="bigint"?v.toString():Array.isArray(v)?v.map(encode):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)])):v;
const bytes=await readFile(original);if(hash(bytes)!==modelSha)throw Error("Wrong original RVT");
const proposalBytes=await readFile(new URL("../../door-threshold-workflow/five-door-proposals.json",import.meta.url)),originalProposal=JSON.parse(proposalBytes.toString()).proposals.find((p:{nativeDoorElementId:number})=>p.nativeDoorElementId===2465283);
const candidateProposal=structuredClone(originalProposal);candidateProposal.proposedPointsFeet[0][0]+=1;
const proposals=[candidateProposal],ownerBytes=await readFile(new URL("./fifth-standing-owner-context.json",import.meta.url)),ownerContext=JSON.parse(ownerBytes.toString());
if(ownerContext.sourceDatasetSha256!=="87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b"||ownerContext.sourceModelSha256!==modelSha||ownerContext.ownerRecord.key!==originalProposal.sideProposal.from.roomKey)throw Error("Wrong saved-mathematical owner discovery context");
const standing=(p:number[])=>[[[[p[0]-1,p[1]-1],[p[0]+1,p[1]-1],[p[0]+1,p[1]+1],[p[0]-1,p[1]+1]].map(v=>v.map(rational))]],asParts=(rings:number[][][])=>[rings.map(r=>r.map(p=>p.map(rational)))];
const mathematicalOwnerContainment=[originalProposal.proposedPointsFeet[0],candidateProposal.proposedPointsFeet[0]].map((p:number[])=>({pointFeet:p,ownerRecordResidualParts:nativeRationalOverlay("difference",standing(p),asParts(ownerContext.ownerRecord.ringsFeet)).length,currentPreparedCellResiduals:ownerContext.cells.map((c:{id:string;ringsFeet:number[][][]})=>({id:c.id,residualParts:nativeRationalOverlay("difference",standing(p),asParts(c.ringsFeet)).length})),savedMathematicsOnly:true,sourceOwnerAuthorityGranted:false}));
if(mathematicalOwnerContainment[1].ownerRecordResidualParts||mathematicalOwnerContainment[1].currentPreparedCellResiduals.some((c:{residualParts:number})=>c.residualParts))throw Error("Candidate standing square leaves its unchanged saved-mathematical owner/current cell");
const dependencyBytes=await readFile(dependenciesPath),dependencies=JSON.parse(dependencyBytes.toString()),drawingBytes=await readFile(drawingReviewPath),drawingReview=JSON.parse(drawingBytes.toString());
if(dependencies.sourceModelSha256!==modelSha)throw Error("Wrong source dependency locators");
const sillDefinitions=new Map([[2315423,1223587],[2311773,1223587],[1505916,2464392],[2042019,1191708],[2465287,1439914]]),
 definitionLocators=[1191708,1223587,1439914,2312095,2464392,2464665,2464763,2492611],
 points=proposals.flatMap((p:{proposedPointsFeet:number[][]})=>p.proposedPointsFeet),
 scope={min:{x:Math.min(...points.map((p:number[])=>p[0]))-2,y:Math.min(...points.map((p:number[])=>p[1]))-2,z:Math.min(...points.map((p:number[])=>p[2]))-.5},max:{x:Math.max(...points.map((p:number[])=>p[0]))+2,y:Math.max(...points.map((p:number[])=>p[1]))+2,z:Math.max(...points.map((p:number[])=>p[2]))+8}};
await mkdir(output,{recursive:false});const started=performance.now();
const requested=[...new Set<number>([...definitionLocators,...dependencies.requestedOriginalFrameIds,1505065,...proposals.flatMap((p:{nativeDoorElementId:number;nativeHostElementId:number;members:{nativeElementId:number}[]})=>[p.nativeDoorElementId,p.nativeHostElementId,...p.members.map(m=>m.nativeElementId)])])];
const {certificate,summary}=createOriginalNativeForeignEnvelopeCensus(bytes,modelSha,scope,drawingReview,requested),facts=originalNativeForeignEnvelopeFacts(certificate);
const bodyFrame=(id:number)=>{const bytes=readOriginalForeignEnvelopeScopedFrame(certificate,id);return {bytes,nativeElementId:id,sha256:hash(bytes)};};
const results=[];
for(const proposal of proposals){
 const nativeDoorElementId=proposal.nativeDoorElementId as number,nativeHostElementId=proposal.nativeHostElementId as number,nativeSillElementId=proposal.members[0].nativeElementId as number,nativeSillDefinitionId=sillDefinitions.get(nativeSillElementId);
 if(!nativeSillDefinitionId)throw Error("Unknown discovery sill definition");
 const row:Record<string,unknown>={nativeDoorElementId,nativeHostElementId,nativeSillElementId,nativeSillDefinitionId,originalProposedPointsFeet:originalProposal.proposedPointsFeet,candidateProposedPointsFeet:proposal.proposedPointsFeet,candidateProposalOnly:true,candidateApplied:false,originalOwnerProposals:proposal.proposedOwnerNumbers,originalOwnerAccess:proposal.proposedOwnerAccess,sourceOwnerPairApplied:false,sourceGeometryEdited:false,routeApproved:false,wheelchairApproved:false};
 const attempt=(name:string,fn:()=>unknown)=>{try{const value=fn();row[name]={ok:true,result:value};return value;}catch(e){row[name]={ok:false,blocked:e instanceof Error?e.message:String(e)};return undefined;}};
 attempt("originalClosedFilledBody",()=>{const r=inspectFilledThresholdFrames(bodyFrame(nativeSillElementId),bodyFrame(nativeSillDefinitionId));if(!r.ok)throw Error(r.blockers.join("; "));return r;});
 const binding=attempt("currentCellBinding",()=>certifyOriginalCurtainCellBindings(certificate,nativeHostElementId)) as ReturnType<typeof certifyOriginalCurtainCellBindings>|undefined,
 container=attempt("currentSourceMaterialContainer",()=>certifyOriginalCurtainMaterialContainer(certificate,nativeHostElementId)) as ReturnType<typeof certifyOriginalCurtainMaterialContainer>|undefined;
 if(container){row.currentSourceMaterialContainer={ok:true,result:originalCurtainMaterialContainerFact(certificate,container)};attempt("originalCurrentDoorDefinition",()=>inspectOriginalCurrentCurtainDoorDefinition(certificate,container,nativeDoorElementId));}
 const demand=binding?attempt("sourceFilledThresholdDemand",()=>certifyOriginalFilledThresholdDemand({census:certificate,hostBinding:binding,nativeDoorElementId,nativeSillElementId,nativeSillDefinitionId,fromFeet:proposal.proposedPointsFeet[0],toFeet:proposal.proposedPointsFeet[1]})) as ReturnType<typeof certifyOriginalFilledThresholdDemand>|undefined:undefined;
 if(demand){row.sourceFilledThresholdDemand={ok:true,result:auditOriginalFilledThresholdDemand(certificate,demand)};
  const x0=Math.min(...proposal.proposedPointsFeet.map((p:number[])=>p[0]))-1,x1=Math.max(...proposal.proposedPointsFeet.map((p:number[])=>p[0]))+1,y0=Math.min(...proposal.proposedPointsFeet.map((p:number[])=>p[1]))-1,y1=Math.max(...proposal.proposedPointsFeet.map((p:number[])=>p[1]))+1,z=proposal.proposedPointsFeet[0][2];
  const floors=[...new Set(facts.rows.filter(r=>r.categoryId===-2000032&&(!r.boundsFeet||(r.boundsFeet.max.x>=x0&&r.boundsFeet.min.x<=x1&&r.boundsFeet.max.y>=y0&&r.boundsFeet.min.y<=y1&&r.boundsFeet.min.z<=z&&r.boundsFeet.max.z>=z))).map(r=>r.nativeElementId))],caps=[],floorDiscoveryRefusals=[];
  for(const id of floors)try{const b=readOriginalForeignEnvelopeScopedFrame(certificate,id),v=new DataView(b.buffer,b.byteOffset,b.byteLength),root=decodeRevit2027FramedGRepRoot(b,{offset:0,elementId:id,marker:2246,objectLength:v.getUint32(12,true),typeCode:v.getUint32(18,true)},2027);if(!root.ok)throw Error(root.error);const r=replayRevit2027GRepFifo(b,root.value);if(!r.ok)throw Error(r.error);const index=revit2027OwnerMeshIndex(r.value);for(const token of index.faces.keys()){const p=revit2027OwnerSurface<Revit2027PlaneSurface>(index,634,token);if(p&&p.kind==="plane"&&p.xVector[2]===0&&p.yVector[2]===0&&p.origin[2]===z)caps.push({nativeFloorElementId:id,originalCapFaceToken:token});}}catch(e){floorDiscoveryRefusals.push({nativeFloorElementId:id,blocked:e instanceof Error?e.message:String(e)});}
  row.floorDiscovery={nativeFloorElementIds:floors,originalCapLocators:caps,refusals:floorDiscoveryRefusals,discoveryOnly:true};
  const supportAttempts=caps.map(cap=>{try{return {cap,ok:true,result:auditOriginalFilledThresholdFloorSupport(certificate,demand,[cap])};}catch(e){return {cap,ok:false,blocked:e instanceof Error?e.message:String(e)};}});row.originalFloorSupportAttempts=supportAttempts;
  const supported=supportAttempts.find(c=>c.ok&&c.result!.fullStripAndBothStandingInteriorsSourceSupported);
  if(supported&&container)attempt("composedOriginalSourceMaterial",()=>auditOriginalFilledThresholdSupportedMaterial(certificate,demand,container,[supported.cap]));
 }
 results.push(row);
 console.log(JSON.stringify({nativeDoorElementId,body:(row.originalClosedFilledBody as {ok?:boolean})?.ok,container:(row.currentSourceMaterialContainer as {ok?:boolean})?.ok,demand:(row.sourceFilledThresholdDemand as {ok?:boolean})?.ok,composed:(row.composedOriginalSourceMaterial as {ok?:boolean})?.ok,routeApproved:false}));
}
const sourceAfter=preparedDisplayEngineBinding(projectRoot,consumerRoots,{namespace:"original-filled-threshold-consumer-v1"}),sourceCodeUnchangedDuringReplay=sourceBefore.sha256===sourceAfter.sha256,driverUnchanged=hash(driverBytes)===hash(await readFile(new URL(import.meta.url))),sourceModelUnchanged=hash(bytes)===hash(await readFile(original));
const report={format:"unapplied-fifth-original-threshold-standing-candidate-replay-v1",mathematicalOwnerContainment,ownerDiscoveryContextSha256:hash(ownerBytes),originalProposalPreserved:true,candidateApplied:false,candidateProposalOnly:true,sourceModelSha256:modelSha,sourceSchemaSha256:certificate.sourceSchemaSha256,scopeBoundsFeet:scope,originalCensus:summary,actualSourceConsumerBinding:sourceBefore,actualSourceConsumerBindingAfter:sourceAfter,sourceCodeUnchangedDuringReplay,driverSha256:hash(driverBytes),driverUnchanged,sourceModelUnchanged,requestSha256:hash(proposalBytes),dependencyLocatorsSha256:hash(dependencyBytes),drawingReviewSha256:hash(drawingBytes),results,elapsedSeconds:(performance.now()-started)/1000,sourceGeometryEdited:false,sourceOwnersApplied:false,routeApproved:false,published:false};
await writeFile(resolve(output,"report.json"),JSON.stringify(encode(report),null,2)+"\n",{flag:"wx"});
if(!sourceCodeUnchangedDuringReplay||!driverUnchanged||!sourceModelUnchanged)throw Error("Original source/consumer changed during replay; report cannot bind current consumer");
console.log(JSON.stringify({cases:results.length,sourceCodeUnchangedDuringReplay,driverUnchanged,sourceModelUnchanged,routeApproved:false}));
