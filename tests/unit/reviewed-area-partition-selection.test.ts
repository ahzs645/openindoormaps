import test from "node:test";
import assert from "node:assert/strict";
import { gapProject, coupledGapProject } from "../fixtures/native-area-project";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import {
  reviewedAreaPartitionGeometrySha256,
  saveReviewedAreaPartition,
  applyReviewedAreaPartition,
  restoreReviewedAreaPartition,
  type ReviewedAreaPartition,
} from "../../app/indoor-project/reviewed-area-partitions";

async function proposed(p:Awaited<ReturnType<typeof gapProject>>,points:ReviewedAreaPartition["pointsFeet"]=[[15,7.25],[15,12.75]]) {
  const entry:ReviewedAreaPartition={id:"shutter-front",levelId:1,elevationFeet:0,
    geometrySha256:await reviewedAreaPartitionGeometrySha256(p.dataset,1),kind:"shutter",pointsFeet:points,
    closed:false,status:"proposed",label:"Bookstore shutter",notes:"Confirmed open front; outline separately from physical construction.",
    evidence:{kind:"reviewed-assumption",nativeElementIds:[],reason:"Human identifies the shutter across existing returns."},selection:"closed",navigation:"unchanged"};
  return saveReviewedAreaPartition(p,entry);
}
test("one shutter preview splits selection, not the physical room/navigation; apply, comparison and restore are independent",async()=>{
  const baseline=await gapProject(),saved=await proposed(baseline);
  const original=await deriveNativeAreas(saved.dataset,1);
  assert.equal(original.regions.length,1);
  const preview=await deriveNativeAreas(saved.dataset,1,{previewPartitionIds:["shutter-front"]});
  assert.equal(preview.regions.length,2);
  assert.deepEqual(preview.logicalPartitionIds,["shutter-front"]);
  assert.equal(saved.rooms.reviewedAreaPartitions!.partitions[0].status,"proposed");
  const applied=applyReviewedAreaPartition(saved,"shutter-front",await reviewedAreaPartitionGeometrySha256(saved.dataset,1));
  assert.equal((await deriveNativeAreas(applied.dataset,1)).regions.length,2);
  assert.equal((await deriveNativeAreas(applied.dataset,1,{ignoreAppliedPartitions:true})).regions.length,1);
  for(const field of ["records","walls","doors","nodes","edges","presentation"] as const)
    assert.deepEqual(applied.dataset[field],baseline.dataset[field]);
  assert.deepEqual(applied.files,baseline.files);
  assert.equal((await deriveNativeAreas(restoreReviewedAreaPartition(applied,"shutter-front").dataset,1)).regions.length,1);
});
test("a second real bypass remains open despite a virtual closure; no claim that two labels are enclosed",async()=>{
  const p=await proposed(await coupledGapProject(),[[15,5],[15,6]]);
  const result=await deriveNativeAreas(p.dataset,1,{previewPartitionIds:["shutter-front"]});
  assert.equal(result.regions.length,1);
  assert.deepEqual(result.regions[0].roomKeys,["0","1"]);
});
test("changed physical evidence omits a stale applied line and rejects its explicit preview or foreign model",async()=>{
  let p=await proposed(await gapProject());
  p=applyReviewedAreaPartition(p,"shutter-front",await reviewedAreaPartitionGeometrySha256(p.dataset,1));
  p.dataset.walls[0].ringsFeet[0][2][1]-=0.25;
  const result=await deriveNativeAreas(p.dataset,1);
  assert.equal(result.regions.length,1);
  assert.ok(result.warnings.some(w=>w.includes("omitted from selection")));
  assert.equal(result.logicalPartitionIds,undefined);
  await assert.rejects(deriveNativeAreas(p.dataset,1,{previewPartitionIds:["shutter-front"]}),/needs review/);
  p.dataset.reviewedAreaPartitions!.sourceModelSha256="f".repeat(64);
  await assert.rejects(deriveNativeAreas(p.dataset,1),/source identity/);
});
