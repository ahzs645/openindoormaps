import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validNativeContinuation} from '/workspace/reviter/lib/reviter/native-boundary-patches.ts';
import {nativeRationalOverlay} from '/workspace/reviter/lib/reviter/native-rational-overlay.ts';
import {nativeRationalPointInParts} from '/workspace/reviter/lib/reviter/native-exact-planar-topology.ts';

const dir='/workspace/scratch/unbc-pathway-repair-20261015/door2178100-native-source/';
const paths={
  inventory:dir+'10-1003-native-section-and-threshold-inventory.json',
  proposals:dir+'10-1003-new-native-cap-feasibility.json',
  reviews:dir+'2178100-original-review-and-join-recipes.json',
  records:'/workspace/scratch/unbc-four-door-review-20261015/field-records.json',
  labels:'/workspace/scratch/unbc-pathway-repair-20261015/ordinary-owner-boundaries/all-original-same-level-labels.json',
  floors:'/workspace/scratch/unbc-four-door-review-20261015/field-walkingSupport.json',
  envelopes:'/workspace/scratch/unbc-four-door-review-20261015/field-nativeIndoorEnvelopes.json',
  productionGuard:'/workspace/reviter/lib/reviter/native-boundary-patches.ts',
};
const digest=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const inputs=Object.fromEntries(Object.entries(paths).map(([k,path])=>{
  const raw=fs.readFileSync(path); return [k,{path,sha256:digest(raw),value:k==='productionGuard'?null:JSON.parse(raw.toString())}];
}));
const inventory=inputs.inventory.value, proposal=inputs.proposals.value;
assert.equal(inventory.parts.length,37);
assert.equal(inventory.parts.filter((p:any)=>!p.intersectsQuery).length,9);
assert.equal(inventory.originalThresholds.length,4);
assert.equal(inputs.reviews.value.originalReferencedSealRecipes.length,4);

// Real exported production guard; no copied or weakened validation.
const wallAccepted=validNativeContinuation(proposal.firstSeamProposedPatchForExistingGuard);
assert.equal(wallAccepted,false);
const control:any={id:'diagnostic-positive-control',levelId:1,sourceModelSha256:'a'.repeat(64),
  status:'proposed',widthFeet:.01,ringsFeet:[[[0,0],[0,1],[.0102,1],[.0102,0]]],
  wallEvidence:[{nativeElementId:1,kind:'wall',ringsFeet:[[[-1,0],[0,0],[0,1],[-1,1]]]},{nativeElementId:2,kind:'wall',ringsFeet:[[[.01,-1],[1,-1],[1,2],[.01,2]]]}],
  nativeDoorIds:[],notes:'Synthetic guard control only',continuationProof:{sourceWallId:1,sourceCapFeet:[[0,0],[0,1]],targetContactFeet:[[.01,0],[.01,1]],evidenceSha256:'b'.repeat(64)}};
assert.equal(validNativeContinuation(control),true);
const tiny=structuredClone(control); tiny.widthFeet=1e-14;tiny.continuationProof.targetContactFeet=[[1e-14,0],[1e-14,1]];
assert.equal(validNativeContinuation(tiny),false);
const side=structuredClone(control);side.continuationProof.sourceCapFeet=[[-1,0],[0,0]];
assert.equal(validNativeContinuation(side),false);

const record=inputs.records.value.find((r:any)=>r.number==='10-1003');
assert.equal(record.key,'rm-1487816-603968192edb');
const label=inputs.labels.value.find((r:any)=>r.key===record.key).labelPointFeet;
const rows=[];
for(const thresholds of [false,true]){
  const start=Date.now();
  const barriers=[...inventory.parts.map((p:any)=>p.ringsFeet),...(thresholds?inventory.originalThresholds.map((d:any)=>[d.footprintFeet]):[])];
  const material=nativeRationalOverlay('union',barriers);
  const bounded=material.flatMap((p:any)=>p.slice(1).map((r:any)=>[r]));
  const boundedUnion=bounded.length?nativeRationalOverlay('union',bounded):[];
  const free=boundedUnion.length?nativeRationalOverlay('difference',boundedUnion,material):[];
  const containing=free.filter((p:any)=>nativeRationalPointInParts(label,[p]));
  rows.push({mode:thresholds?'all-37-original-source-parts-plus-4-original-thresholds':'all-37-original-source-parts',
    completeSourcePartCount:37,remoteSameOwnerPartsRetained:9,thresholdCount:thresholds?4:0,
    exactBoundedFreeCellCount:free.length,cellsContainingOriginalLabel:containing.length,
    containingOriginalRoomLabels:containing.map((p:any)=>inputs.labels.value.filter((l:any)=>l.levelId===record.levelId&&nativeRationalPointInParts(l.labelPointFeet,[p])).map((l:any)=>({key:l.key,number:l.number}))),
    elapsedMs:Date.now()-start});
  console.log(JSON.stringify(rows.at(-1)));
}
const floorRows=inputs.floors.value.floors.filter((f:any)=>f.elevationFeet===inventory.sourcePhysicalPlaneFeet);
const envelopeRows=inputs.envelopes.value.levels.filter((e:any)=>e.elevationFeet===inventory.sourcePhysicalPlaneFeet);
const floorHoleCount=floorRows.reduce((n:number,f:any)=>n+Math.max(0,f.ringsFeet.length-1),0);
const envelopeHoleCount=envelopeRows.reduce((n:number,e:any)=>n+e.partsFeet.reduce((s:number,p:any)=>s+Math.max(0,p.length-1),0),0);
assert(rows.every(r=>r.cellsContainingOriginalLabel===0));
assert(Object.values(inputs).every((i:any)=>digest(fs.readFileSync(i.path))===i.sha256));
const result={authority:'Read-only call of unchanged production native-cap guard plus exact planar closure replay. All 37 complete same-owner source cuts (9 remote), and all four saved doorway thresholds are retained. Thresholds are disclosed existing graph geometry, not newly certified apertures. Door2178100 conservative source envelopes are obstruction-only and are not inserted as positive room-enclosure material.',
  sourceModelSha256:inventory.sourceModelSha256,freshCacheSha256:inventory.freshCacheSha256,
  recordKey:record.key,originalLabelPointFeet:label,
  existingGuardResults:{actualWallCapAccepted:wallAccepted,syntheticOrdinaryGapAccepted:true,syntheticTinyGapRefused:true,syntheticLongSideRefused:true,
    actualColumnSeamModeRefusal:proposal.secondSeam.refusal,completeExactColumnProfileAuthorityAvailable:false},
  originalSupportPreserved:{floorRows:floorRows.length,originalFloorHoleCount:floorHoleCount,envelopeRows:envelopeRows.length,originalEnvelopeHoleCount:envelopeHoleCount,
    note:'No new recipe qualified, so floor/headroom/foreign approval is not issued. No floor or envelope ring, hole, source section or room polygon was inserted, filled, rounded or removed. A source/floor restriction cannot create a new architecturally closed room cell where the complete source barriers do not bound the original label.'},
  rows,sourceInputBindings:Object.fromEntries(Object.entries(inputs).map(([k,i]:any)=>[k,{path:i.path,sha256:i.sha256}])),
  originalProvisionalSealsPreserved:4,newRecipesApplied:0,sourceInputsUnchanged:true,
  sourceWalkingApproved:false,roomOwnershipRequirementWaived:false,accessibilityChanged:false,routeApproved:false};
fs.writeFileSync(dir+'10-1003-existing-cap-guards-and-complete-enclosure.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({existingGuardResults:result.existingGuardResults,support:result.originalSupportPreserved,newRecipesApplied:0}));
