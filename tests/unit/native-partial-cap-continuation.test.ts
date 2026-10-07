import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNativeBoundaryPatches,reviewedBoundaryWalls,type NativeBoundaryPatch} from '../../app/indoor-project/native-boundary-patches';
import {validateNativeBoundaryPatches as compilerValidate,reviewedBoundaryWalls as compilerWalls} from '../../../reviter/lib/reviter/native-boundary-patches';
import {deriveExactBoundaryPatchGroupPreview} from '../../app/indoor-project/enclosure-proposals';
import {gapProject} from '../fixtures/native-area-project';

async function setup(){
 const {dataset:data}=await gapProject();
 data.walls=[{levelId:1,nativeElementId:200,kind:'wall',ringsFeet:[[[14.8,0],[15.2,0],[15.2,5],[14.8,5]]]},{levelId:1,nativeElementId:201,kind:'wall',ringsFeet:[[[14.8,5],[15.2,5.01],[15.2,20],[14.8,20]]]}];
 const patch:NativeBoundaryPatch={id:'partial-original-cap',levelId:1,sourceModelSha256:data.source.modelSha256,status:'proposed',widthFeet:.01,ringsFeet:[[[14.8,4.9998],[15.2,4.9998],[15.2,5.0102],[14.8,5.0002]]],wallEvidence:data.walls.map(w=>({nativeElementId:w.nativeElementId,ringsFeet:w.ringsFeet})),nativeDoorIds:[],notes:'Exact full-width original cap: one corner touches; the other has a measured 0.01 ft gap.',continuationProof:{sourceWallId:200,sourceCapFeet:[[14.8,5],[15.2,5]],targetContactFeet:[[14.8,5],[15.2,5.01]],evidenceSha256:'b'.repeat(64)}};
 return {data,patch};
}
for(const[name,validate]of[['runtime',validateNativeBoundaryPatches],['compiler',compilerValidate]]as const){
 test(name+' accepts an exact already-touching corner only with a positive remaining full-cap run',async()=>{
  const {data,patch}=await setup();validate({version:1,patches:[patch]},data.source.modelSha256);
  const touching=structuredClone(patch);touching.widthFeet=1e-8;touching.continuationProof!.targetContactFeet=[[14.8,5],[15.2,5]];
  assert.throws(()=>validate({version:1,patches:[touching]},data.source.modelSha256));
  const behind=structuredClone(patch);behind.continuationProof!.targetContactFeet[0][1]-=.001;
  assert.throws(()=>validate({version:1,patches:[behind]},data.source.modelSha256));
  const wider=structuredClone(patch);wider.ringsFeet[0][1][0]+=.01;
  assert.throws(()=>validate({version:1,patches:[wider]},data.source.modelSha256));
  const rotated=structuredClone(patch);rotated.continuationProof!.sourceCapFeet=[[14.8,0],[14.8,5]];
  assert.throws(()=>validate({version:1,patches:[rotated]},data.source.modelSha256));
 });
}
test('partial-cap application preserves source bytes and compiler parity; physical guards still reject doors, holes and foreign columns',async()=>{
 const {data,patch}=await setup(),snapshot=JSON.stringify(data.walls),applied={version:1 as const,patches:[{...patch,status:'applied' as const}]};
 assert.deepEqual(reviewedBoundaryWalls(data.walls,applied,data.source.modelSha256),compilerWalls(data.walls,applied,data.source.modelSha256));
 const preview=await deriveExactBoundaryPatchGroupPreview(data,1,[patch],{mode:'connected',previewGapIds:[patch.id]});
 assert.equal(preview.regions.length,2);assert.equal(JSON.stringify(data.walls),snapshot);
 const stale=structuredClone(data.walls);stale[0].ringsFeet[0][0][0]+=.01;
 assert.throws(()=>reviewedBoundaryWalls(stale,applied,data.source.modelSha256),/stale/);
 const obstacle:[[number,number],[number,number],[number,number],[number,number]]=[[15.05,5.002],[15.15,5.002],[15.15,5.004],[15.05,5.004]];
 for(const kind of['door','opening','column']as const){
  const blocked=structuredClone(data);
  if(kind==='door')blocked.doors=[{id:'door:1:90',levelId:1,nativeElementId:90,pointFeet:[15.1,5.003],roomKeys:[],state:'unmatched',footprintFeet:obstacle}];
  if(kind==='opening')blocked.records[0].properties.floorOpeningsFeet=[obstacle];
  if(kind==='column')blocked.walls.push({levelId:1,nativeElementId:90,kind:'column',ringsFeet:[obstacle]});
  await assert.rejects(()=>deriveExactBoundaryPatchGroupPreview(blocked,1,[patch],{mode:'connected',previewGapIds:[patch.id]}),/protected|unsupported/);
 }
});
