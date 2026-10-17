import assert from 'node:assert/strict';
import {nativeFloorPolygons,routingFloorPlateRecords} from '../../../reviter/lib/reviter/routing-floor-support';
import {nativeDerivedFrameHash,verifyNativeDerivedFrameReturns} from '../../../reviter/lib/reviter/native-derived-frame-returns';
import {nativeProvisionalCornerSealsHash,createNativeProvisionalCornerSealIndex,validateNativeProvisionalCornerSeals,verifyDrawingBackedDrawingEvidence,resetDrawingBackedRowMemo,drawingBackedRowMemoStats,type DwgDerivedOutlines} from '../../../reviter/lib/reviter/native-provisional-corner-seals';
import {nativeIndoorEnvelopeHash,verifyNativeIndoorEnvelopes} from '../../../reviter/lib/reviter/native-indoor-envelopes';
import type{RoomDirectoryData}from '../../../reviter/lib/reviter/room-directory';
import type{IndoorDataset}from '../../../reviter/lib/reviter/indoor-contract';
import type{ConvertResult}from '../../../reviter/lib/reviter/types';

type Model=Pick<ConvertResult,'elementBounds'>;
type Binding={nativeElementId:number;elevationFeet:number;partsFeet:[number,number][][][]};
export const DRAWING_FLOOR_REBIND_ALGORITHM='named-native-drawing-floor-source-review-v1';
function currentNamedFloor(model:Model,id:number,elevationFeet:number,label:string):Binding{
 const matches=routingFloorPlateRecords(model,elevationFeet).filter(f=>f.elementId===id);
 assert.equal(matches.length,1,`${label}: named native floor ${id} is missing, duplicated, nonflat or on another physical plane`);
 const floor=matches[0]!,partsFeet=nativeFloorPolygons(floor,true);
 assert.ok(partsFeet.length,`${label}: native floor ${id} has no strict source profile`);
 return{nativeElementId:id,elevationFeet:floor.boundsFeet.max.z,partsFeet};
}

/** An UNVALIDATED source-review proposal, never a geometry equivalence claim.
 * The new source floor coordinates (including every shell/hole) are retained
 * exactly. Only named-floor bindings/checksums and dependent checksum references
 * change; bodies, decisions, IDs, drawing evidence and history stay intact. */
export async function proposeCurrentDrawingFloorBindings<T extends RoomDirectoryData>(model:Model,rooms:T,sourceModelSha256:string){
 const originalDigest=nativeDerivedFrameHash(rooms),original=rooms.nativeProvisionalCornerSeals;
 assert.ok(original,'Drawing floor review needs existing source assumptions');
 validateNativeProvisionalCornerSeals(original,sourceModelSha256);
 assert.equal(original.geometrySha256,nativeProvisionalCornerSealsHash(original),'Original assumption source checksum mismatch');
 await verifyNativeIndoorEnvelopes(rooms.nativeIndoorEnvelopes,sourceModelSha256);
 const currentFloors=new Map<number,Binding>();
 for(const row of original.rows){
  if(!row.drawingBacked)continue;
  for(const id of row.sourceFloorIds){
   const binding=currentNamedFloor(model,id,row.elevationFeet,`Drawing row ${row.id}`);
   const previous=currentFloors.get(id);
   if(previous)assert.deepEqual(previous,binding,`Native floor ${id} changed between declared planes`);
   else currentFloors.set(id,binding);
  }
 }
 const changedRows:{id:string;state:string;kind:string;floorIds:number[];beforeSha256:string;afterSha256:string;originalBindings:Binding[];currentBindings:Binding[]}[]=[];
 const rows=original.rows.map(row=>{
  if(!row.drawingBacked)return row;
  assert.equal(row.sourceFloorPartsSha256,nativeDerivedFrameHash(row.sourceFloorBindings),`Drawing row ${row.id}: original floor binding checksum is damaged`);
  const sourceFloorBindings=[...new Set(row.sourceFloorIds)].map(id=>currentFloors.get(id)!).sort((a,b)=>a.nativeElementId-b.nativeElementId);
  assert.equal(sourceFloorBindings.length,row.sourceFloorIds.length,`Drawing row ${row.id}: duplicate named floor identities`);
  const sourceFloorPartsSha256=nativeDerivedFrameHash(sourceFloorBindings);
  if(JSON.stringify(sourceFloorBindings)===JSON.stringify(row.sourceFloorBindings)){
   assert.equal(sourceFloorPartsSha256,row.sourceFloorPartsSha256);return row;
  }
  changedRows.push({id:row.id,state:row.state,kind:row.drawingBacked.kind,floorIds:[...row.sourceFloorIds],beforeSha256:row.sourceFloorPartsSha256,afterSha256:sourceFloorPartsSha256,originalBindings:row.sourceFloorBindings,currentBindings:sourceFloorBindings});
  return{...row,sourceFloorBindings,sourceFloorPartsSha256};
 });
 const seals={...original,rows};seals.geometrySha256=nativeProvisionalCornerSealsHash(seals);
 let envelope=rooms.nativeIndoorEnvelopes;
 const envelopeChanges:{levelId:number;elevationFeet:number}[]=[];
 if(envelope && seals.geometrySha256!==original.geometrySha256){
  envelope={...envelope,levels:envelope.levels.map(level=>{
   if(level.provisionalCornerGeometrySha256===undefined)return level;
   assert.equal(level.provisionalCornerGeometrySha256,original.geometrySha256,'Existing enclosure assumption binding was already stale');
   envelopeChanges.push({levelId:level.levelId,elevationFeet:level.elevationFeet});
   return{...level,provisionalCornerGeometrySha256:seals.geometrySha256};
  })};envelope.geometrySha256=await nativeIndoorEnvelopeHash(envelope);
 }
 const candidate={...rooms,nativeProvisionalCornerSeals:seals,...(envelope?{nativeIndoorEnvelopes:envelope}:{})};
 assert.equal(nativeDerivedFrameHash(rooms),originalDigest,'Source floor review mutated the input source');
 const receipt={format:'reviter-drawing-native-floor-source-rebind',version:1,algorithm:DRAWING_FLOOR_REBIND_ALGORITHM,status:'UNVALIDATED_SOURCE_REVIEW_PROPOSAL',sourceModelSha256,sourceRoomsBeforeSha256:originalDigest,sourceRoomsAfterSha256:nativeDerivedFrameHash(candidate),allRows:original.rows.length,drawingRows:original.rows.filter(r=>r.drawingBacked).length,changedRows,envelopeChanges,descriptorBeforeSha256:original.geometrySha256,descriptorAfterSha256:seals.geometrySha256,envelopeBeforeSha256:rooms.nativeIndoorEnvelopes?.geometrySha256,envelopeAfterSha256:envelope?.geometrySha256,patchBodiesUnchanged:rows.every((r,i)=>r.partsFeet===original.rows[i]!.partsFeet),sourceHistoryAndDecisionsUnchanged:rows.every((r,i)=>r.evidenceSha256===original.rows[i]!.evidenceSha256&&r.assumption===original.rows[i]!.assumption&&r.drawingBacked===original.rows[i]!.drawingBacked),sourceInputMutated:false,geometryEquivalenceClaimed:false,sourceCoordinatesSnapped:false,physicalGuardWaived:false};
 return{rooms:candidate,receipt,currentFloors:[...currentFloors.values()].sort((a,b)=>a.nativeElementId-b.nativeElementId)};
}

/** Apply a source-review candidate only after the unchanged complete original
 * constructor (including foreign bodies, source openings and doors) and every
 * registered drawing citation have passed against the actual current profiles.
 * No raw proposal/hash can bypass these checks. */
export async function roomsWithCurrentDrawingFloorBindings<T extends RoomDirectoryData>(model:Model,rooms:T,sourceModelSha256:string,originalPhysicalContext:IndoorDataset){
 assert.equal(originalPhysicalContext.source.modelSha256,sourceModelSha256,'Physical context belongs to another source model');
 assert.equal(rooms.nativeMaterialSections?.sourceModelSha256,sourceModelSha256,'Source review must contain the verified hydrated native material descriptor');
 assert.equal(originalPhysicalContext.nativeMaterialSections?.geometrySha256,rooms.nativeMaterialSections.geometrySha256,'Original physical material context differs from the preserved source review');
 assert.equal(originalPhysicalContext.nativeProvisionalCornerSeals?.geometrySha256,rooms.nativeProvisionalCornerSeals?.geometrySha256,'Physical context assumption source differs from the source review');
 const proposal=await proposeCurrentDrawingFloorBindings(model,rooms,sourceModelSha256);
 const named=new Map(proposal.currentFloors.map(f=>[f.nativeElementId,f]));
 // Refresh EVERY original walking floor, including those used only by human
 // assumptions or frame returns. A stale untouched profile cannot hide a
 // changed source hole from the complete original guard replay.
 assert.equal(originalPhysicalContext.walkingSupport?.sourceModelSha256,sourceModelSha256,'Original walking floors belong to another model');
 const existing=originalPhysicalContext.walkingSupport?.floors??[];
 const ids=new Set(existing.map(f=>f.nativeElementId));
 assert.equal(ids.size,existing.length,'Original walking floor identities are duplicated');
 const refreshed=existing.map(f=>{
  const current=currentNamedFloor(model,f.nativeElementId,f.elevationFeet,'Original walking support');
  const drawing=named.get(f.nativeElementId);if(drawing)assert.deepEqual(current,drawing,'Drawing and walking floor source profiles disagree');
  return{...f,...current,ringsFeet:current.partsFeet[0]!};
 });
 const floorChanges=refreshed.flatMap((f,i)=>{
  const old=existing[i]!,before={nativeElementId:old.nativeElementId,elevationFeet:old.elevationFeet,partsFeet:old.partsFeet??[old.ringsFeet]},after={nativeElementId:f.nativeElementId,elevationFeet:f.elevationFeet,partsFeet:f.partsFeet};
  return JSON.stringify(before)===JSON.stringify(after)?[]:[{nativeElementId:f.nativeElementId,beforeSha256:nativeDerivedFrameHash(before),afterSha256:nativeDerivedFrameHash(after),before,after}];
 });
 const floors=[...refreshed,
  ...proposal.currentFloors.filter(f=>!ids.has(f.nativeElementId)).map(f=>({...f,ringsFeet:f.partsFeet[0]!}))].sort((a,b)=>a.nativeElementId-b.nativeElementId);
 const context={...originalPhysicalContext,nativeProvisionalCornerSeals:proposal.rooms.nativeProvisionalCornerSeals,nativeIndoorEnvelopes:proposal.rooms.nativeIndoorEnvelopes,
  walkingSupport:{version:1 as const,sourceModelSha256,floors}};
 resetDrawingBackedRowMemo();const start=performance.now();
 createNativeProvisionalCornerSealIndex(context);
 verifyNativeDerivedFrameReturns(context);
 verifyDrawingBackedDrawingEvidence(proposal.rooms.nativeProvisionalCornerSeals,proposal.rooms.boundaryReference,proposal.rooms.dwgDerivedOutlines as DwgDerivedOutlines|undefined);
 await verifyNativeIndoorEnvelopes(proposal.rooms.nativeIndoorEnvelopes,sourceModelSha256);
 assert.equal(nativeDerivedFrameHash(rooms),proposal.receipt.sourceRoomsBeforeSha256,'Complete source review mutated the input source');
 return{...proposal,replayContext:context,receipt:{...proposal.receipt,status:'COMPLETE_ORIGINAL_PHYSICAL_AND_DRAWING_REPLAY_PASSED',completeReplayScope:'Original unchanged source material, complete foreign-body census, physical doors/edges and drawing evidence with ALL current strict native walking-floor profiles. Freshly regenerated complete material/route QA remains mandatory.',completeReplayMilliseconds:Math.round(performance.now()-start),memo:drawingBackedRowMemoStats(),originalPhysicalDoorsRetained:context.doors?.length??0,originalPhysicalEdgesRetained:context.edges.length,allOriginalWalkingFloorIdsRefreshed:existing.map(f=>f.nativeElementId),floorChanges,allOriginalGuardPredicatesRetained:true}};
}
