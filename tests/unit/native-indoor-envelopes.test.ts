import assert from "node:assert/strict";
import test from "node:test";
import {nativeIndoorEnvelopeHash,verifyNativeIndoorEnvelopes,nativeIndoorEnvelopeParts} from "../../app/indoor-project/native-indoor-envelopes.ts";
import {nativeIndoorEnvelopeHash as compilerHash} from "../../../reviter/lib/reviter/native-indoor-envelopes.ts";
const source=()=>({version:1 as const,sourceModelSha256:"a".repeat(64),levels:[{levelId:1,elevationFeet:0,partsFeet:[[[[0,0],[10,0],[10,10],[0,10]]]] as [number,number][][][],sourceElementIds:[12],cutElevationsFeet:[4,8],evidenceSha256:"b".repeat(64)}]});
test("native indoor physical geometry, original source IDs and row evidence are checksum-bound across reader/compiler", async()=>{
 const raw=source(),checked={...raw,geometrySha256:await nativeIndoorEnvelopeHash(raw)};
 assert.equal(checked.geometrySha256,await compilerHash(raw));
 await verifyNativeIndoorEnvelopes(checked,raw.sourceModelSha256);
 assert.equal(nativeIndoorEnvelopeParts(checked,raw.sourceModelSha256,0).length,1);
 assert.equal(nativeIndoorEnvelopeParts(checked,raw.sourceModelSha256,10).length,0);
 await assert.rejects(verifyNativeIndoorEnvelopes(checked,"c".repeat(64)),/binding/);
 for(const edit of [(v:typeof checked)=>v.levels[0]!.partsFeet[0]![0]![0]![0]++, (v:typeof checked)=>v.levels[0]!.sourceElementIds.push(13), (v:typeof checked)=>v.levels[0]!.evidenceSha256="c".repeat(64)]) {
  const changed=structuredClone(checked);edit(changed);await assert.rejects(verifyNativeIndoorEnvelopes(changed),/checksum/);
 }
});
