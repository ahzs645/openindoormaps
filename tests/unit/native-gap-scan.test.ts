import assert from "node:assert/strict";
import test from "node:test";
import { gapProject } from "../fixtures/native-area-project";
import { scanNativeGaps, compactGapScan, gapScanPreview } from "../../app/indoor-project/native-gap-scan";
import { pointInNativeArea } from "../../app/indoor-project/native-area-review";
import { saveReviewCompanion } from "../../app/indoor-project/review-companion-save";
import { exportIndoorProject, readIndoorProject } from "../../app/indoor-project/package";
import { reviewFileBytes } from "../../app/indoor-project/review-bundle";
const options = { minWidthFeet: .02, maxWidthFeet: 6, minAreaSquareFeet: 40 };
const rect = (x:number,y:number,w:number,h:number):[number,number][] => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
test("width filter detects a connection and measures both areas without modifying source", async () => {
 const p = await gapProject(), before = JSON.stringify(p);
 const small = await scanNativeGaps(p.dataset,1,{...options,maxWidthFeet:5});
 assert.equal(small.findings.length,0);
 const result = await scanNativeGaps(p.dataset,1,options);
 assert.ok(result.findings.some(f => Math.abs(f.widthFeet-5.5)<1e-6 && f.kind==='wall-gap' && f.separation==='single-cut'));
 const finding = result.findings.find(f => f.kind==='wall-gap')!;
 assert.ok(finding.sides.every(s => s.areaSquareFeet>250));
 assert.deepEqual(finding.sides.flatMap(s => s.roomKeys).sort(),['0','1']);
 assert.ok(!gapScanPreview(result,finding).parts.some(r => pointInNativeArea([4,15],r)), "native floor hole remains excluded");
 assert.equal(JSON.stringify(p),before);
});
test("two openings require a joint experiment rather than a false single-gap fix", async () => {
 const p = await gapProject();
 p.dataset.walls = [
 {kind:'wall',nativeElementId:200,levelId:1,ringsFeet:[rect(14.8,0,.4,7)]},
 {kind:'wall',nativeElementId:201,levelId:1,ringsFeet:[rect(14.8,8,.4,4)]},
 {kind:'wall',nativeElementId:202,levelId:1,ringsFeet:[rect(14.8,13,.4,7)]}];
 const result = await scanNativeGaps(p.dataset,1,{...options,maxWidthFeet:1.1});
 assert.ok(result.findings.length>=2);
 assert.ok(result.findings.every(f=>f.separation==='combined-cuts'));
 const preview=gapScanPreview(result,result.findings[0]);
 assert.ok(preview.cuts.length>=2);
 assert.ok(preview.parts.length>=2);
});
test("measured door is distinguished; closed portals are not missing-wall findings", async () => {
 const p=await gapProject();
 p.dataset.doors=[{id:'door',nativeElementId:300,levelId:1,pointFeet:[15,10],normalFeet:[1,0],footprintFeet:rect(14.8,7.25,.4,5.5),roomKeys:['0','1'],state:'connected'}];
 const result=await scanNativeGaps(p.dataset,1,options);
 assert.equal(result.findings.length,0);
 assert.equal(result.measuredDoors[0].widthFeet,5.5);
 assert.equal(result.measuredDoors[0].status,'separated');
});
test("real floor choke is a passage candidate, not a fabricated native wall", async () => {
 const p=await gapProject();p.dataset.walls=[];
 p.dataset.walkingSupport!.floors[0].ringsFeet=[[[0,0],[10,0],[10,9],[20,9],[20,0],[30,0],[30,20],[20,20],[20,11],[10,11],[10,20],[0,20]]];
 const result=await scanNativeGaps(p.dataset,1,{...options,maxWidthFeet:2.1});
 assert.ok(result.findings.length>0);
 assert.ok(result.findings.every(f=>f.kind==='narrow-passage'));
});
test("rejects invalid size and stale native support; compact scan survives authoring export only",async()=>{
 const p=await gapProject();
 await assert.rejects(scanNativeGaps(p.dataset,1,{...options,maxWidthFeet:0}),/widths/);
 const result=await scanNativeGaps(p.dataset,1,options);
 const compact=compactGapScan(result);
 assert.ok(!('ringsFeet' in compact.findings[0].sides[0]));
 const saved=await saveReviewCompanion(p,'connection-scans/level-1.json',compact);
 const reopened=await readIndoorProject(await exportIndoorProject(saved));
 const file=reopened.rooms.reviewBundle!.files.find(f=>f.path==='connection-scans/level-1.json')!;
 assert.deepEqual(JSON.parse(new TextDecoder().decode(reviewFileBytes(file))),compact);
 assert.equal(JSON.stringify(saved.dataset),JSON.stringify(p.dataset));
 p.dataset.walkingSupport!.sourceModelSha256='c'.repeat(64);
 await assert.rejects(scanNativeGaps(p.dataset,1,options),/model-bound/);
});
