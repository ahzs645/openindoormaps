import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeRevit2027FramedGRepRoot } from "../../../reviter/lib/reviter/revit-2027-framed-grep-root.ts";
import { replayRevit2027GRepFifo } from "../../../reviter/lib/reviter/revit-2027-grep-replay.ts";
import { inspectFiniteStairCarrierPrimitives } from "../../scripts/indoor/proposals/finite-stair-carrier-primitives.ts";
import { encodeSteppedStairV2Operands, decodeSteppedStairV2Operands } from "../../scripts/indoor/proposals/stepped-stair-v2-kernel.ts";
const fixture = JSON.parse(readFileSync(new URL("../../../reviter/tests/fixtures/native-original-stair-carrier-1696012.json", import.meta.url), "utf8"));
function source() {
  const bytes = Uint8Array.from(Buffer.from(fixture.frameHex, "hex")),
    decoded = decodeRevit2027FramedGRepRoot(bytes, { offset: 0, elementId: 1696012, marker: 2246, objectLength: bytes.length - 20, typeCode: 0 }, 2027);
  assert.ok(decoded.ok);
  const replay = replayRevit2027GRepFifo(bytes, decoded.value);
  assert.ok(replay.ok); return replay.value;
}
test("actual source fixture retains all14 lines and2 points as finite closed obstacles, without new absence or thickness", () => {
  const result = inspectFiniteStairCarrierPrimitives(source(), 1696013);
  assert.equal(result.ok, true, result.issues.join("; "));
  assert.equal(result.cells.length, 16);
  assert.ok(result.cells.every((cell) => cell.partsFeet.length === 0 && cell.closedSegmentsFeet.length === 1));
  assert.equal(result.cells.filter((cell) => cell.closedSegmentsFeet[0]!.length === 1).length, 2);
  assert.equal(result.originalSourceAuthorityGranted, false);
  const transported = decodeSteppedStairV2Operands(encodeSteppedStairV2Operands(source())) as ReturnType<typeof source>;
  assert.equal(inspectFiniteStairCarrierPrimitives(transported, 1696013).ok, true);
});
test("an aliased source consumer, profile/body descendant or unsupported generator cannot be called finite graphics", () => {
  for (const change of ["alias", "body-parent", "generator"] as const) {
    let replay = source();
    const line = replay.spans.find((s) => s.readerId === "Revit2027GLine")!;
    if (change === "alias") replay = { ...replay, descriptors: [...replay.descriptors,
      { ...replay.descriptors.find((d) => d.token === line.propertyToken)!, state: "reference" as never }] };
    if (change === "body-parent") line.parentReplayIndex = replay.spans.find((s) => s.readerId === "Revit2027Geometry")!.replayIndex;
    if (change === "generator") line.readerId = "Revit2027Extrusion";
    assert.equal(inspectFiniteStairCarrierPrimitives(replay, 1696013).ok, false, change);
  }
});
