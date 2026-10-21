import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  captureOriginalSteppedStairGraphDemand,
  inspectOriginalSteppedStairGraphDemand,
} from "../../scripts/indoor/proposals/original-stepped-stair-graph-demand.ts";
import { extractOriginalScopedSteppedTerminalCap } from "../../scripts/indoor/proposals/stepped-stair-v2-scoped-terminal.ts";

const bytes = readFileSync(
    new URL(
      "../fixtures/unbc-1696006-original-held-graph-demand.json",
      import.meta.url,
    ),
  ),
  data = JSON.parse(bytes.toString("utf8")),
  checksum = createHash("sha256").update(bytes).digest("hex");
const demand = () =>
  captureOriginalSteppedStairGraphDemand(
    bytes,
    checksum,
    data.source.modelSha256,
    data.edges[0].id,
  );
type Sources = Parameters<typeof extractOriginalScopedSteppedTerminalCap>[0];
const unissuedSources = () =>
  ({
    stair: { sourceModelSha256: data.source.modelSha256 },
    foreign: { sourceModelSha256: data.source.modelSha256 },
  }) as unknown as Sources;
function request(handle: ReturnType<typeof demand>) {
  const point =
    inspectOriginalSteppedStairGraphDemand(handle).terminals[0]!.node.pointFeet;
  return {
    supportScope: "connected-demand" as const,
    nativeFloorElementId: 402_395,
    originalCapFaceToken: 249,
    lateralAxis: "y" as const,
    approachXYFeet: [
      [point[0], point[1]],
      [point[0], point[1] + 2],
    ] as [number, number][],
  };
}

test("a connected-demand proposal cannot replace its checked original graph endpoint", () => {
  const handle = demand(),
    proposal = request(handle);
  proposal.approachXYFeet[0]![0] += 0.000_000_000_000_01;
  assert.throws(
    () =>
      extractOriginalScopedSteppedTerminalCap(
        unissuedSources(),
        handle,
        1_696_012,
        0,
        proposal,
      ),
    /changed its original graph endpoint/,
  );
  assert.deepEqual(
    inspectOriginalSteppedStairGraphDemand(handle).terminals[0]!.node.pointFeet,
    data.nodes.find((n: { id: string }) => n.id === data.edges[0].from)
      .pointFeet,
  );
});

test("an exact endpoint and source-looking snapshots cannot restore connected floor support authority", () => {
  const handle = demand(),
    proposal = request(handle);
  assert.throws(
    () =>
      extractOriginalScopedSteppedTerminalCap(
        unissuedSources(),
        handle,
        1_696_012,
        0,
        proposal,
      ),
    /original|source|context|handle/i,
  );
  assert.throws(
    () =>
      extractOriginalScopedSteppedTerminalCap(
        unissuedSources(),
        { ...handle },
        1_696_012,
        0,
        proposal,
      ),
    /checked-byte handle/,
  );
});
