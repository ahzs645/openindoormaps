import test from "node:test";
import assert from "node:assert/strict";
import {rational} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import {exactOccurrenceMaterialKey,indexExactOccurrenceMaterialRefinements,type OriginalOccurrenceMaterialRefinement} from "../../scripts/indoor/proposals/stepped-stair-v2-occurrence-material.ts";
const source={sourceModelSha256:"a".repeat(64),sourceSchemaSha256:"b".repeat(64),sourceCensusSha256:"c".repeat(64)};
const rows=[{nativeElementId:1,sourceFrameSha256:"d".repeat(64),categoryId:-2000171},{nativeElementId:1,sourceFrameSha256:"e".repeat(64),categoryId:-2000171}];
const refinement=():OriginalOccurrenceMaterialRefinement=>({...source,nativeElementId:1,sourceFrameSha256:rows[0]!.sourceFrameSha256,originalCategoryId:-2000171,
  cells:[{id:"exact-original:1:d",nativeOwnerId:1,geometryKind:"complete-source-envelope",originalFaceTokens:[],minimumElevationFeet:rational(0),maximumElevationFeet:rational(1),partsFeet:[],closedSegmentsFeet:[[[rational(0),rational(0)]]]}]});
test("only the exact original occurrence is replaced; a second same-owner unknown stays unresolved",()=>{
  const ref=refinement(),before=JSON.stringify(rows),found=indexExactOccurrenceMaterialRefinements(rows,[ref],source);
  assert.equal(found.get(exactOccurrenceMaterialKey(1,rows[0]!.sourceFrameSha256)),ref);
  assert.equal(found.has(exactOccurrenceMaterialKey(1,rows[1]!.sourceFrameSha256)),false);assert.equal(JSON.stringify(rows),before);
});
test("foreign model/schema/census, category and occurrence cannot borrow a source enclosure",()=>{
  for(const key of ["sourceModelSha256","sourceSchemaSha256","sourceCensusSha256","sourceFrameSha256"] as const){const ref=refinement();ref[key]="f".repeat(64);assert.throws(()=>indexExactOccurrenceMaterialRefinements(rows,[ref],source));}
  const wrong=refinement();wrong.originalCategoryId=-2000170;assert.throws(()=>indexExactOccurrenceMaterialRefinements(rows,[wrong],source));
});
test("duplicated source occurrences/certificates, empty and borrowed cells refuse",()=>{
  assert.throws(()=>indexExactOccurrenceMaterialRefinements([...rows,rows[0]!],[refinement()],source));
  assert.throws(()=>indexExactOccurrenceMaterialRefinements(rows,[refinement(),refinement()],source));
  const empty=refinement();empty.cells=[];assert.throws(()=>indexExactOccurrenceMaterialRefinements(rows,[empty],source));
  const borrowed=refinement();borrowed.cells[0]!.nativeOwnerId=2;assert.throws(()=>indexExactOccurrenceMaterialRefinements(rows,[borrowed],source));
  const repeat=refinement();repeat.cells.push(repeat.cells[0]!);assert.throws(()=>indexExactOccurrenceMaterialRefinements(rows,[repeat],source));
});
