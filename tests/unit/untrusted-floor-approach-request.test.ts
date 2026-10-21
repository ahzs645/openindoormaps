import test from "node:test";
import assert from "node:assert/strict";
import { proposeUntrustedFloorDetour } from "../../scripts/indoor/proposals/untrusted-floor-approach-request.mjs";
import {
  Rational,
  rational,
  type NativeRationalParts,
} from "../../../reviter/lib/reviter/native-rational-overlay.ts";
import { inspectOriginalFloorCapBoundaryDemand } from "../../../reviter/lib/reviter/native-source-floor-cap-demand.ts";
import { originalStairTerminalWalkingFootprint } from "../../../reviter/lib/reviter/native-source-stair-scoped-floor-attachment.ts";
import type { OriginalLocalFloorCapEnvelope } from "../../../reviter/lib/reviter/native-source-floor-local-support.ts";
type Point = [number, number];
const outer: Point[] = [
    [-2, -6],
    [12, -6],
    [12, 6],
    [-2, 6],
  ],
  hole: Point[] = [
    [3, -1],
    [7, -1],
    [7, 1],
    [3, 1],
  ];
const closed = (rings: Point[][]) =>
  rings.flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!]));
const input = () => ({
  referenceRings: [outer, hole],
  boundaryParts: [],
  closedSegments: closed([outer, hole]),
  from: [0, 0],
  to: [10, 0],
  lateralDirection: [0, 1],
  marginFeet: 8,
  gridFeet: 0.5,
  maxNodes: 5000,
});
const exactCap = () =>
  ({
    nativeFloorElementId: 1,
    originalFaceToken: 5,
    originalPhysicalTopElevationFeet: rational(0),
    originalCapLoopTokens: [1, 2],
    originalCapEdgeTokens: [1, 2, 3, 4, 5, 6, 7, 8],
    originalChainEnvelopeLoops: [],
    originalReferenceWindingPartsFeet: [
      [outer.map((p) => p.map(rational)), hole.map((p) => p.map(rational))],
    ] as NativeRationalParts,
    retainedPositiveBoundaryUncertaintyPartsFeet: [],
    retainedZeroAreaBoundarySegmentsFeet: closed([outer, hole]).map((r) =>
      r.map((p) => p.map(rational)),
    ),
  }) as unknown as OriginalLocalFloorCapEnvelope;
test("bounded numeric requests detour around a retained native hole, then independently pass exact whole-footprint mathematics", () => {
  const request = input(),
    before = structuredClone(request),
    result = proposeUntrustedFloorDetour(request);
  assert.equal(result.found, true);
  assert.deepEqual(request, before);
  assert.equal(result.sourceAuthorityGranted, false);
  assert.equal(result.physicalBodyOrRouteApproved, false);
  assert(result.path && result.path.length > 2);
  assert.deepEqual(result.path[0], request.from);
  assert.deepEqual(result.path.at(-1), request.to);
  const cap = exactCap(),
    straight = originalStairTerminalWalkingFootprint(
      [request.from as Point, request.to as Point],
      { lateralDirectionFeet: [0, 1] },
    );
  assert.equal(
    inspectOriginalFloorCapBoundaryDemand(cap, straight)
      .completeConnectedDemandSupported,
    false,
  );
  const demand = originalStairTerminalWalkingFootprint(result.path as Point[], {
    lateralDirectionFeet: [0, 1],
  });
  assert.equal(
    inspectOriginalFloorCapBoundaryDemand(cap, demand)
      .completeConnectedDemandSupported,
    true,
  );
  // Altering the proposed geometry never bypasses the exact consumer.
  const changed = structuredClone(result.path) as Point[];
  changed.splice(1, changed.length - 2);
  assert.equal(
    inspectOriginalFloorCapBoundaryDemand(
      cap,
      originalStairTerminalWalkingFootprint(changed, {
        lateralDirectionFeet: [0, 1],
      }),
    ).completeConnectedDemandSupported,
    false,
  );
  assert(cap.originalPhysicalTopElevationFeet instanceof Rational);
});
test("unsafe original start, bounded search limits and narrow source gaps never imply support or move original endpoints", () => {
  const bad = input();
  bad.from = [5, 0];
  const result = proposeUntrustedFloorDetour(bad);
  assert.equal(result.found, false);
  assert.equal(result.sourceAuthorityGranted, false);
  assert.deepEqual(bad.from, [5, 0]);
  const limited = input();
  limited.maxNodes = 1;
  assert.equal(proposeUntrustedFloorDetour(limited).found, false);
  const narrow = input();
  narrow.referenceRings = [
    outer,
    [
      [3, -5.5],
      [7, -5.5],
      [7, 5.5],
      [3, 5.5],
    ],
  ];
  narrow.closedSegments = closed(narrow.referenceRings as Point[][]);
  assert.equal(proposeUntrustedFloorDetour(narrow).found, false);
});
