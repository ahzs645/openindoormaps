/** Explicit source review of a superseded native wall continuation.
 * This authoring-only helper recomputes every physical operand. It never reads
 * a serialized approval boolean and never alters native model/geometry bytes. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {deriveNativeMaterialSectionSupplement} from "../../../reviter/lib/reviter/native-material-section-supplement-derive.ts";
import {architecturalPlanGeometry} from "../../../reviter/lib/reviter/architectural-plan.ts";
import {directoryDoorReviews,directoryDoors} from "../../../reviter/lib/reviter/directory-navigation.ts";
import {splitGeneratedLandingDoorLinks,type RoomDirectoryData} from "../../../reviter/lib/reviter/room-directory.ts";
import {supportedSemanticDoorLinks} from "../../../reviter/lib/reviter/semantic-door-links.ts";
import {nativeWallPositionRepairedWalls} from "../../../reviter/lib/reviter/native-wall-position-repairs.ts";
import {verifyNativeMaterialSections} from "../../../reviter/lib/reviter/native-material-sections.ts";
import {validateIndoorExclusions} from "../../../reviter/lib/reviter/indoor-exclusions.ts";
import {nativeMaterialPlanWalls} from "../../../reviter/lib/reviter/native-material-plan.ts";
import {routingFloorPlateRecords,nativeFloorPolygons} from "../../../reviter/lib/reviter/routing-floor-support.ts";
import {boundaryPatchMaterialParts,reviewedBoundaryWalls,validateCurrentBoundaryContacts,validateNativeBoundaryPatches,type NativeBoundaryPatch,type BoundaryWall} from "../../../reviter/lib/reviter/native-boundary-patches.ts";
import {nativeRationalOverlay as overlay,rational,type NativeRationalParts,type NativeRationalOverlayInput,type Rational} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import {add,sub,mul,compare} from "../../../reviter/lib/reviter/vendor/native-rational-overlay-arithmetic.mjs";
import type {IndoorDataset} from "../../../reviter/lib/reviter/indoor-contract.ts";
import type {ConvertResult} from "../../../reviter/lib/reviter/types.ts";
export const nativeBoundaryMemberDigest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest=(value:unknown):value is string=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
export type NativeBoundaryMemberReview={
 format:"source-native-boundary-member-supersession-v1";
 sourceModelSha256:string;sourceRoomsSha256:string;nativeCacheSha256:string;
 oldPatchId:string;oldPatchSha256:string;sourceWallId:number;targetNativeElementId:number;
 targetNativeBodySha256:string;targetNativeHostRelationsSha256:string;
 newPatch:NativeBoundaryPatch;
};
export type NativeBoundaryMemberReviewReceipt={
 format:"checked-native-boundary-member-review-v1";physicalGuardsWaived:false;
 sourceModelSha256:string;originalSourceRoomsSha256:string;nativeCacheSha256:string;
 sourceBeforeSha256:string;sourceAfterSha256:string;reviewSha256:string;
 oldOriginalRecord:NativeBoundaryPatch;oldRetainedRecord:NativeBoundaryPatch;newAppliedRecord:NativeBoundaryPatch;
 appliedBefore:number;appliedAfter:number;sourcePreservation:{onlyOldStatusAndNewRecordChanged:true;allOtherSourceReferencesUnchanged:true};
 physical:{currentAllPatchContacts:true;currentHistoricalBinding:true;nativeFloorIds:number[];doorFootprintIntersections:0;reviewedApertureIntersections:0;exclusionIntersections:0;firstMaterial:ReturnType<typeof checkNoNewMaterialBeyondFirstNativeSurface>;currentPhysicalMaterialSha256:string;currentDoorsSha256:string;sourceFloorGeometrySha256:string;materialGeometrySha256:string;supplementGeometrySha256?:string};
};
export function nativeBoundaryMemberReviewEvidenceSha256(review:Omit<NativeBoundaryMemberReview,"newPatch">,sourceRings:BoundaryWall["ringsFeet"],targetRings:BoundaryWall["ringsFeet"]){
 return nativeBoundaryMemberDigest([review.format,review.sourceModelSha256,review.sourceRoomsSha256,review.nativeCacheSha256,review.oldPatchId,review.oldPatchSha256,review.sourceWallId,review.targetNativeElementId,review.targetNativeBodySha256,review.targetNativeHostRelationsSha256,sourceRings,targetRings]);
}
const plus=(a:number|Rational,b:number|Rational)=>rational(add(a,b)),minus=(a:number|Rational,b:number|Rational)=>rational(sub(a,b)),times=(a:number|Rational,b:number|Rational)=>rational(mul(a,b));
const dot=(a:[Rational,Rational],b:[Rational,Rational])=>plus(times(a[0],b[0]),times(a[1],b[1]));
const minimum=(a:Rational[])=>a.reduce((a,b)=>compare(a,b)<0?a:b),maximum=(a:Rational[])=>a.reduce((a,b)=>compare(a,b)>0?a:b);
/** Exact ray-shadow check over the ENTIRE unchanged original cap.
 * Coordinates use the unnormalized original cap basis, so no trigonometric or
 * floating projection enters an overlay. A hole behind a first native face is
 * still in its shadow: filling that downstream hole is correctly refused.
 * All native owners remain distinct in the source; this temporary union proves
 * absence of newly added material, and never supplies an invented target owner. */
export function checkNoNewMaterialBeyondFirstNativeSurface(patch:NativeBoundaryPatch,current:readonly BoundaryWall[]){
 const proof=patch.continuationProof;assert(proof,"An original native cap continuation is required");
 const [a,b]=proof.sourceCapFeet.map(p=>p.map(rational) as [Rational,Rational]),v:[Rational,Rational]=[minus(b[0],a[0]),minus(b[1],a[1])];
 let u:[Rational,Rational]=[minus(0,v[1]),v[0]];const target=proof.targetContactFeet[0].map(rational) as [Rational,Rational];
 if(compare(dot([minus(target[0],a[0]),minus(target[1],a[1])],u),0)<0)u=[minus(0,u[0]),minus(0,u[1])];
 const local=(p:[number,number]):[Rational,Rational]=>{const q:[Rational,Rational]=[minus(p[0],a[0]),minus(p[1],a[1])];return[dot(q,u),dot(q,v)];};
 const projectedPatch:NativeRationalParts=[patch.ringsFeet.map(r=>r.map(local))],width=dot(v,v);assert(compare(width,0)>0,"The original cap must have positive width");
 const far=plus(maximum(projectedPatch.flat(2).map(p=>p[0])),1),zero=rational(0),domain:NativeRationalParts=[[[[zero,zero],[far,zero],[far,width],[zero,width]]]];
 const sourceEvidence=patch.wallEvidence.find(w=>w.nativeElementId===proof.sourceWallId);assert(sourceEvidence,"Original source material evidence is required");
 const operands:NativeRationalParts=[],owners:number[]=[],shadows:NativeRationalOverlayInput[]=[];
 for(const wall of current){
  if(wall.levelId!==patch.levelId||wall.reviewPatchId||wall.approximate)continue;
  const projected=[wall.ringsFeet.map(r=>r.map(local))],vertices=projected.flat(2),ts=vertices.map(p=>p[0]),ss=vertices.map(p=>p[1]);
  if(compare(maximum(ts),zero)<=0||compare(minimum(ts),far)>=0||compare(maximum(ss),zero)<=0||compare(minimum(ss),width)>=0)continue;
  const clipped=overlay("intersection",projected,domain);if(!clipped.length)continue;owners.push(wall.nativeElementId);operands.push(...projected);
  for(const part of clipped){const outer=part[0]!;shadows.push([[outer]]);
   for(let i=0;i<outer.length;i++){const q=outer[i]!,next=outer[(i+1)%outer.length]!;if(compare(q[1],next[1])===0)continue;shadows.push([[[q,next,[far,next[1]],[far,q[1]]]]]);}
  }
 }
 assert(operands.length,"The complete cap has no current original native target material");
 const solid=overlay("union",operands),shadow=overlay("union",shadows[0]!,...shadows.slice(1)),newMaterial=overlay("difference",projectedPatch,solid),forbidden=overlay("intersection",newMaterial,shadow);
 assert.equal(forbidden.length,0,"The proposal adds new material behind a nearer native first surface or into its downstream void");
 return{exactRationalWholeCapShadow:true as const,addsNoNewMaterialBehindAnyFirstSurface:true as const,currentNativeOwners:[...new Set(owners)].sort((a,b)=>a-b)};
}

/** Caller supplies the exact decoded model whose file SHA it just calculated.
 * The helper has no serialized authority/capability setter; current section,
 * floor, door and whole-cap geometry are independently rebuilt below. */
export async function roomsWithCheckedNativeBoundaryMemberReview<T extends RoomDirectoryData>(
 rooms:T,context:IndoorDataset,model:ConvertResult,
 options:{sourceRoomsSha256:string;nativeCacheSha256:string;review:NativeBoundaryMemberReview},
):Promise<{rooms:T;receipt:NativeBoundaryMemberReviewReceipt}>{
 const review=options.review,before=nativeBoundaryMemberDigest(rooms),modelSha=context.source.modelSha256;
 assert(review?.format==="source-native-boundary-member-supersession-v1","An explicit native member source review is required");
 assert([review.sourceModelSha256,review.sourceRoomsSha256,review.nativeCacheSha256,review.oldPatchSha256,review.targetNativeBodySha256,review.targetNativeHostRelationsSha256].every(digest),"Invalid checked source review digest");
 assert.equal(review.sourceModelSha256,modelSha,"Source model changed");assert.equal(review.sourceRoomsSha256,options.sourceRoomsSha256,"Original source room bytes changed");assert.equal(context.source.roomsSha256,options.sourceRoomsSha256,"Original physical context belongs to different source room bytes");assert.equal(review.nativeCacheSha256,options.nativeCacheSha256,"Original decoded native cache bytes changed");
 assert(rooms.nativeMaterialSections,"Hydrated original source material sections are required");assert.equal(rooms.nativeMaterialSections.sourceModelSha256,modelSha);await verifyNativeMaterialSections(rooms.nativeMaterialSections,modelSha);assert.equal(context.nativeMaterialSections?.geometrySha256,rooms.nativeMaterialSections.geometrySha256,"Original physical/source material contexts differ");
 validateNativeBoundaryPatches(rooms.nativeBoundaryPatches,modelSha);const old=rooms.nativeBoundaryPatches?.patches.find(p=>p.id===review.oldPatchId);assert(old&&old.status==="applied","The reviewed original applied continuation is missing");assert.equal(nativeBoundaryMemberDigest(old),review.oldPatchSha256,"Historical continuation changed");
 const proposed=review.newPatch;validateNativeBoundaryPatches({version:1,patches:[proposed]},modelSha);assert.equal(proposed.status,"proposed","Review input must remain a proposal");assert(!rooms.nativeBoundaryPatches!.patches.some(p=>p.id===proposed.id),"Replacement identity already exists");
 assert(old.continuationProof&&proposed.continuationProof,"Both source recipes must retain an original native continuation proof");assert.equal(old.continuationProof.sourceWallId,review.sourceWallId);assert.equal(proposed.continuationProof.sourceWallId,review.sourceWallId);
 assert.deepEqual(proposed.continuationProof.sourceCapFeet,old.continuationProof.sourceCapFeet,"Moving or splitting the original source cap is forbidden");
 const oldSource=old.wallEvidence.find(w=>w.nativeElementId===review.sourceWallId),newSource=proposed.wallEvidence.find(w=>w.nativeElementId===review.sourceWallId),newTarget=proposed.wallEvidence.find(w=>w.nativeElementId!==review.sourceWallId);assert(oldSource&&newSource&&newTarget);assert.deepEqual(newSource,oldSource,"Original supporting source wall evidence changed");assert.equal(newTarget.nativeElementId,review.targetNativeElementId);assert.equal(proposed.levelId,old.levelId);
 const nativeBodies=model.elementBounds.filter(r=>r.elementId===review.targetNativeElementId);assert.equal(nativeBodies.length,1,"Original target native body identity is duplicated or missing");const nativeBody=nativeBodies[0]!;assert(nativeBody.renderGeometryProvenance==="native","The new target needs an original native body");assert.equal(nativeBoundaryMemberDigest(nativeBody),review.targetNativeBodySha256,"Original target native body changed");
 const hosts=(model.nativeHostRelations??[]).filter(r=>r.elementId===review.targetNativeElementId);assert.equal(hosts.length,1,"Exactly one resolved original persisted target host identity is required");const host=hosts[0]!;assert(host.evidence==="persisted"&&host.kind==="host"&&host.source==="Partitions/InsertableInst.m_hostId"&&Number.isSafeInteger(host.hostId)&&host.hostId>0&&host.hostId!==review.targetNativeElementId&&Number.isSafeInteger(host.fieldOffset)&&host.fieldOffset>=0&&Number.isSafeInteger(host.recordOffset)&&host.recordOffset>=0&&Number.isSafeInteger(host.objectLength)&&host.objectLength>=host.fieldOffset+4,"Original persisted target host field/frame binding is required");assert.equal(nativeBoundaryMemberDigest(hosts),review.targetNativeHostRelationsSha256,"Original target host identity changed");
 assert.equal(proposed.continuationProof.evidenceSha256,nativeBoundaryMemberReviewEvidenceSha256(review,newSource.ringsFeet,newTarget.ringsFeet),"New continuation evidence digest is stale");
 const nativeLevels=model.levels.filter(l=>Number.isSafeInteger(l.levelId)&&Number.isFinite(l.elevation)).map(l=>({id:l.levelId!,name:l.name??`Level ${l.levelId}`,elevationFeet:l.elevation}));assert.deepEqual(nativeLevels,context.nativeLevels,"Original/native physical floor levels changed");
 const walls:IndoorDataset["walls"]=[],doors:NonNullable<IndoorDataset["doors"]>=[],immediate=splitGeneratedLandingDoorLinks(rooms.navigation?.doorLinks??[]).immediate,semantic=supportedSemanticDoorLinks(model,rooms,modelSha,immediate);
 for(const levelId of [...new Set(rooms.annotations.map(r=>r.levelId))]){const g=architecturalPlanGeometry(model,levelId);walls.push(...[...g.walls.map(w=>({...w,kind:"wall" as const})),...g.columns.map(w=>({...w,kind:"column" as const}))].filter(w=>w.polygon.length>=3).map(w=>({levelId,nativeElementId:w.elementId,kind:w.kind,approximate:w.approximate,ringsFeet:[w.polygon]})));
 doors.push(...directoryDoorReviews(rooms.annotations.filter(r=>r.levelId===levelId),directoryDoors(model,levelId),semantic.links,immediate).map(({door,candidates,state,portal})=>({id:`door:${levelId}:${door.id}`,levelId,nativeElementId:door.id,pointFeet:door.point,footprintFeet:door.footprint,normalFeet:door.normal,roomKeys:portal?.rooms??candidates,state})));}
 const derived=deriveNativeMaterialSectionSupplement(model,rooms.nativeMaterialSections),stage:IndoorDataset={...context,nativeLevels,walls,doors,nodes:[],edges:[],nativeMaterialSections:rooms.nativeMaterialSections,nativeMaterialSectionSupplement:derived.supplement,nativeWallPositionRepairs:rooms.nativeWallPositionRepairs,nativeIndoorEnvelopes:rooms.nativeIndoorEnvelopes,nativeProvisionalCornerSeals:rooms.nativeProvisionalCornerSeals,nativeDerivedFrameReturns:rooms.nativeDerivedFrameReturns};
 // Rebuild original floor geometry for current source-row binding checks. These
 // floors never contribute guessed wall material or authorize a target owner.
 const elevations=new Set([...nativeLevels.map(l=>l.elevationFeet),...context.records.map(r=>r.elevationFeet)]),floors=new Map([...elevations].flatMap(z=>routingFloorPlateRecords(model,z)).map(f=>[f.elementId,f]));
 stage.walkingSupport={version:1,sourceModelSha256:modelSha,floors:[...floors.values()].sort((a,b)=>a.elementId-b.elementId).map(f=>({nativeElementId:f.elementId,elevationFeet:f.boundsFeet.max.z,ringsFeet:nativeFloorPolygons(f,!!stage.nativeIndoorEnvelopes)[0]!,partsFeet:nativeFloorPolygons(f,!!stage.nativeIndoorEnvelopes)}))};
 stage.walls=nativeWallPositionRepairedWalls(stage,{deferPhysicalChecks:true});const current=new Map<number,BoundaryWall[]>(),material=(levelId:number)=>{if(!current.has(levelId))current.set(levelId,nativeMaterialPlanWalls(stage,levelId,rooms.reviewedDoorApertures));return current.get(levelId)!;};
 const applied=rooms.nativeBoundaryPatches!.patches.filter(p=>p.status==="applied");let refusal="";try{validateCurrentBoundaryContacts(applied,material,p=>boundaryPatchMaterialParts(p,rooms.reviewedDoorApertures,modelSha));}catch(error){refusal=error instanceof Error?error.message:String(error);}
 const oldTarget=old.wallEvidence.find(w=>w.nativeElementId!==review.sourceWallId)!;assert.equal(refusal,`Boundary patch ${old.id} does not contact actual current native material #${oldTarget.nativeElementId}. Review or supersede it before regeneration.`,"Only the independently reproduced original missing-material contact may be superseded");
 const physical=material(proposed.levelId).filter(w=>!w.reviewPatchId&&!w.approximate);
 const completeOriginal=(wall:BoundaryWall)=>((wall as BoundaryWall & {geometrySource?:string}).geometrySource==="original-native-material-section");
 assert(physical.some(w=>completeOriginal(w)&&w.nativeElementId===review.sourceWallId&&nativeBoundaryMemberDigest(w.ringsFeet)===nativeBoundaryMemberDigest(newSource.ringsFeet)),"The unchanged full source cap no longer belongs to a complete current native source part");
 assert(physical.some(w=>completeOriginal(w)&&w.nativeElementId===newTarget.nativeElementId&&nativeBoundaryMemberDigest(w.ringsFeet)===nativeBoundaryMemberDigest(newTarget.ringsFeet)),"New target evidence is not a complete actual current native section part");
 const firstMaterial=checkNoNewMaterialBeyondFirstNativeSurface(proposed,physical),level=nativeLevels.find(l=>l.id===proposed.levelId)!;
 const support=routingFloorPlateRecords(model,level.elevationFeet),supportParts=support.flatMap(f=>nativeFloorPolygons(f,true));assert(supportParts.length,"No original same-plane native support exists");assert.equal(overlay("difference",[proposed.ringsFeet],supportParts).length,0,"Continuation leaves original supported floor or fills a native floor hole");
 const doorHits=doors.filter(d=>d.levelId===proposed.levelId&&d.footprintFeet&&d.footprintFeet.length>=3&&overlay("intersection",[proposed.ringsFeet],[[d.footprintFeet]]).length);assert.equal(doorHits.length,0,"Continuation fills a real original doorway footprint");
 const apertures=(rooms.reviewedDoorApertures?.patches??[]).filter(p=>p.levelId===proposed.levelId);assert.equal(apertures.filter(p=>overlay("intersection",[proposed.ringsFeet],[[p.apertureFeet]]).length).length,0,"Continuation fills an original reviewed doorway aperture");
 validateIndoorExclusions(rooms.indoorExclusions,modelSha,nativeLevels);const exclusions=(rooms.indoorExclusions?.areas??[]).filter(a=>a.levelId===proposed.levelId);assert.equal(exclusions.filter(a=>overlay("intersection",[proposed.ringsFeet],a.partsFeet).length).length,0,"Continuation intrudes into a preserved indoor exclusion or void");
 const retained={...old,status:"proposed" as const},replacement={...proposed,status:"applied" as const},next:T={...rooms,nativeBoundaryPatches:{...rooms.nativeBoundaryPatches!,patches:[...rooms.nativeBoundaryPatches!.patches.map(p=>p===old?retained:p),replacement]}};
 // Both current contacts and the independent historical evidence binding of the
 // COMPLETE candidate set must pass; no temporary diagnostic worklist is used.
 reviewedBoundaryWalls(stage.walls,next.nativeBoundaryPatches,modelSha,undefined,rooms.reviewedDoorApertures,rooms.nativeMaterialSections,material);
 assert.equal(nativeBoundaryMemberDigest(rooms),before,"Source input was mutated");assert(Object.keys(rooms).every(k=>k==="nativeBoundaryPatches"||rooms[k as keyof RoomDirectoryData]===next[k as keyof RoomDirectoryData]),"An unrelated source operand changed");
 const receipt:NativeBoundaryMemberReviewReceipt={format:"checked-native-boundary-member-review-v1",physicalGuardsWaived:false,sourceModelSha256:modelSha,originalSourceRoomsSha256:options.sourceRoomsSha256,nativeCacheSha256:options.nativeCacheSha256,sourceBeforeSha256:before,sourceAfterSha256:nativeBoundaryMemberDigest(next),reviewSha256:nativeBoundaryMemberDigest(review),oldOriginalRecord:old,oldRetainedRecord:retained,newAppliedRecord:replacement,appliedBefore:applied.length,appliedAfter:next.nativeBoundaryPatches!.patches.filter(p=>p.status==="applied").length,sourcePreservation:{onlyOldStatusAndNewRecordChanged:true,allOtherSourceReferencesUnchanged:true},physical:{currentAllPatchContacts:true,currentHistoricalBinding:true,nativeFloorIds:support.map(f=>f.elementId),doorFootprintIntersections:0,reviewedApertureIntersections:0,exclusionIntersections:0,firstMaterial,currentPhysicalMaterialSha256:nativeBoundaryMemberDigest(physical),currentDoorsSha256:nativeBoundaryMemberDigest(doors),sourceFloorGeometrySha256:nativeBoundaryMemberDigest(support),materialGeometrySha256:rooms.nativeMaterialSections.geometrySha256,...derived.supplement?{supplementGeometrySha256:derived.supplement.geometrySha256}:{}}};
 return{rooms:next,receipt};
}
