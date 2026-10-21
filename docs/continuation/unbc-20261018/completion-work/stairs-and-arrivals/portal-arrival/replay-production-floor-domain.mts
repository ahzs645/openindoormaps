/** Exact saved original-frame replay through the integrated production cap parser. No opaque source capability or route authority is restored. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {decodeRevit2027FramedGRepRoot} from '/workspace/reviter/lib/reviter/revit-2027-framed-grep-root.ts';
import {replayRevit2027GRepFifo} from '/workspace/reviter/lib/reviter/revit-2027-grep-replay.ts';
import {inspectOriginalNamedFloorCapBoundaryOperands,validateOriginalNamedCapReference} from '/workspace/reviter/lib/reviter/native-source-floor-local-support.ts';
import {inspectOriginalFloorCapBoundaryDemand} from '/workspace/reviter/lib/reviter/native-source-floor-cap-demand.ts';
import {inspectOriginalElementLevelPrefix} from '/workspace/reviter/lib/reviter/native-source-element-level-prefix.ts';
import {readSchema} from '/workspace/reviter/lib/reviter/schema-reader.ts';
import {Rational,rational} from '/workspace/reviter/lib/reviter/native-rational-overlay.ts';
import {originalTwoFootStandingSquare} from '/workspace/reviter/lib/reviter/native-source-standing-footprint.ts';
const output=process.argv[2];assert(output);
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),base='/workspace/scratch/source-portal-arrival-20261018/',inputPath=base+'scoped-floor-demand.json',inputBytes=await readFile(inputPath),input=JSON.parse(inputBytes.toString()),previousPath=base+'localized-floor-domain-fast.json',previousBytes=await readFile(previousPath),previous=JSON.parse(previousBytes.toString());
const affected=['native-source-cylinder-domain-enclosure.ts','native-source-floor-local-support.ts','native-source-floor-cap-demand.ts','native-source-element-level-prefix.ts'],implementationStart=[];
for(const file of affected){const path='/workspace/reviter/lib/reviter/'+file;implementationStart.push({path,sha256:hash(await readFile(path))});}
const schemaPath=base+'scoped-floor-demand.json.original-frames/schema.bin',schemaBytes=await readFile(schemaPath);assert.equal(hash(schemaBytes),input.sourceSchemaSha256);const schema=readSchema(schemaBytes);assert(schema.ok);
const p=input.standingPoint,square=originalTwoFootStandingSquare(p.slice(0,2).map(rational)),results=[];
for(const id of [400479,490040]){
  console.log('integrated-production-floor-start',id);
  const frames=[];
  for(const marker of [2246,2153]){const f=input.originalFrameCopies.find((f:any)=>f.sourceKey===`${id}:${marker}`);assert(f);const bytes=await readFile(f.path);assert.equal(hash(bytes),f.sha256);frames.push({marker,bytes,sha256:f.sha256});}
  const raw=frames[0].bytes,v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),root=decodeRevit2027FramedGRepRoot(raw,{offset:0,elementId:id,marker:2246,objectLength:v.getUint32(12,true),typeCode:v.getUint32(18,true)},2027);assert(root.ok);const replay=replayRevit2027GRepFifo(raw,root.value);assert(replay.ok);
  const prefix=inspectOriginalElementLevelPrefix(frames[1].bytes,schema.schema,'Floor');assert.equal(prefix.nativeElementId,id);assert.equal(prefix.nativeAssociatedLevelId,694);
  // This cap is passed unchanged, directly from the integrated production parser.
  const cap=inspectOriginalNamedFloorCapBoundaryOperands(replay.value,5),report=inspectOriginalFloorCapBoundaryDemand(cap,square),baseline=previous.results.find((r:any)=>r.id===id).after;
  assert.equal(report.completeConnectedDemandSupported,true);assert.equal(report.completeBoundaryUncertaintyContact,false);assert.equal(report.retainedOriginalHoleCount,id===400479?3:6);assert.equal(cap.originalBoundaryEnvelopeCellsFeet.length,id===400479?70:339);
  assert.deepEqual(report.originalCapLoopTokens,baseline.originalCapLoopTokens);assert.deepEqual(report.originalCapEdgeTokens,baseline.originalCapEdgeTokens);assert.deepEqual(report.sourceLoopWindings,baseline.sourceLoopWindings);
  const qz=rational(p[2]);assert.equal(cap.originalPhysicalTopElevationFeet.n*qz.d,qz.n*cap.originalPhysicalTopElevationFeet.d);
  let globalReferenceRefusal='';try{validateOriginalNamedCapReference(cap.originalReferenceWindingPartsFeet);}catch(e){globalReferenceRefusal=String(e);}assert.equal(globalReferenceRefusal,id===400479?'Error: Self-intersecting exact native rings 0:72/0:70.':'Error: Self-intersecting exact native rings 0:411/0:409.');
  const holeBoundaryControls=cap.originalReferenceWindingPartsFeet[0].slice(1).map((ring,index)=>{const demand=originalTwoFootStandingSquare(ring[0]),control=inspectOriginalFloorCapBoundaryDemand(cap,demand);assert.equal(control.completeConnectedDemandSupported,false);assert.equal(control.completeBoundaryUncertaintyContact,true);return{originalHoleLoopToken:cap.originalCapLoopTokens[index+1],completeTwoFootSquareRetained:true,report:control};});
  results.push({id,sourceFrames:frames.map(f=>({marker:f.marker,sha256:f.sha256,bytes:f.bytes.length})),nativeAssociatedLevelId:prefix.nativeAssociatedLevelId,originalCapFaceToken:5,unchangedIntegratedProductionCap:true,allOriginalBoundaryCellCount:cap.originalBoundaryEnvelopeCellsFeet.length,originalHoleCount:report.retainedOriginalHoleCount,allOriginalLoopsAndEdgesMatchEarlierReplay:true,physicalTopEqualsOriginalNominalPortalExactly:true,report,globalReferenceRefusal,holeBoundaryControls});
  console.log('integrated-production-floor-complete',id,'supported',report.completeConnectedDemandSupported,'original-holes',report.retainedOriginalHoleCount,'hole-controls-refuse',holeBoundaryControls.length);
}
const implementationChanged=[];for(const f of implementationStart)if(hash(await readFile(f.path))!==f.sha256)implementationChanged.push(f.path);assert.deepEqual(implementationChanged,[]);
const plain=(v:any):any=>v instanceof Rational?{numerator:v.n.toString(),denominator:v.d.toString()}:typeof v==='bigint'?v.toString():Array.isArray(v)?v.map(plain):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;
await writeFile(output,JSON.stringify(plain({kind:'integrated-production-cap-parser-original-floor-domain-replay',input:{path:inputPath,sha256:hash(inputBytes)},previousLocalizedReplay:{path:previousPath,sha256:hash(previousBytes)},schema:{path:schemaPath,sha256:hash(schemaBytes)},implementationStart,implementationChanged,standingPoint:p,widthFeet:2,results,capReconstructedOrMutated:false,opaqueSourceAuthorityRestored:false,arrivalPointerChanged:false,doorOrHostMaterialContactWaived:false,routeApproved:false}),null,2)+'\n',{flag:'wx'});
