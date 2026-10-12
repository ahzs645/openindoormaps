import assert from "node:assert/strict";
import test from "node:test";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  reviewedPlaceKey,
  reviewedPlaceSearchText,
  reviewedSeparatePlaceKeys,
  validateReviewedPlaceLabels,
  type ReviewedPlaceLabels,
} from "../../app/indoor-project/reviewed-place-labels";
import * as compiler from "../../../reviter/lib/reviter/reviewed-place-labels";
import { nativeMixedHallwayIssues } from "../../app/indoor-project/native-mixed-hallway-review";
import {
  filterNativeExplorePlaces,
  nativeExplorePlaces,
  type NativeExploreResult,
} from "../../app/indoor-project/native-explore";

const model = "a".repeat(64);
const record = (
  key: string,
  number: string,
  name: string,
  over: Partial<IndoorRecord> = {},
): IndoorRecord =>
  ({
    key,
    number,
    name,
    building: "08",
    levelId: 1,
    elevationFeet: 0,
    elevationEvidence: "test",
    surfaceId: "08:1:0.000",
    circulation: false,
    stair: false,
    access: "public",
    walkable: true,
    confidence: 1,
    ringsFeet: [],
    properties: {},
    ...over,
  }) as unknown as IndoorRecord;
const records = [
  record("r318", "08-318", "Prep Room"),
  record("r319", "08-319", "Prep Room"),
  record("r342", "08-342", "Office"),
  record("r340", "08-340", "Corridor", { circulation: true }),
  record("r900", "08-900", "Lab", { levelId: 2 }),
];
const labels: ReviewedPlaceLabels = {
  version: 1,
  sourceModelSha256: model,
  labels: [
    {
      id: "place-label:r319",
      roomKey: "r319",
      number: "08-319",
      action: "alias",
      placeRoomKey: "r318",
      decisionId: "2026-10-09-round2#f34-2",
      evidence: "user-reported",
      reason: "One prep room with two numbers.",
    },
    {
      id: "place-label:r342",
      roomKey: "r342",
      number: "08-342",
      action: "retire",
      placeRoomKey: "r340",
      decisionId: "2026-10-09-round2#f34-3",
      evidence: "user-reported",
      reason: "Open office bay of the corridor.",
    },
  ],
};
const data = (l: ReviewedPlaceLabels | null = labels) =>
  ({
    source: { modelSha256: model },
    records,
    ...(l ? { reviewedPlaceLabels: l } : {}),
  }) as unknown as IndoorDataset;

for (const [name, validate] of [
  ["runtime", validateReviewedPlaceLabels],
  ["compiler", compiler.validateReviewedPlaceLabels],
] as const) {
  test(`${name}: place-label reviews bind their room key, number and same-level place`, () => {
    validate(labels, records, model);
    validate(undefined, records, model);
    const bad = (change: (l: ReviewedPlaceLabels) => void, why: RegExp) => {
      const copy = structuredClone(labels);
      change(copy);
      assert.throws(() => validate(copy, records, model), why);
    };
    bad((l) => (l.labels[0]!.number = "08-320"), /no longer matches/);
    bad((l) => (l.labels[0]!.placeRoomKey = "r900"), /another level/);
    bad(
      (l) => (l.labels[0]!.placeRoomKey = "r319"),
      /Invalid reviewed place label/,
    );
    bad((l) => (l.labels[1]!.placeRoomKey = "r319"), /itself an alias/);
    bad((l) => (l.labels[1]!.roomKey = "r319"), /Invalid reviewed place label/);
    bad(
      (l) => ((l.labels[0] as { evidence: string }).evidence = "inferred"),
      /Invalid/,
    );
    bad(
      (l) => ((l.labels[0] as Record<string, unknown>).boundary = []),
      /Invalid/,
    );
    bad((l) => (l.sourceModelSha256 = "b".repeat(64)), /version, model/);
  });
}

test("an alias or retired label folds into its place only where that place shares the area", () => {
  const d = data();
  assert.deepEqual(
    reviewedSeparatePlaceKeys(d, ["r318", "r319", "r342", "r340"]),
    ["r318", "r340"],
  );
  // Without its place in the area, the label keeps its own identity there.
  assert.deepEqual(reviewedSeparatePlaceKeys(d, ["r319", "r342"]), [
    "r319",
    "r342",
  ]);
  assert.equal(reviewedPlaceKey(d, "r319"), "r318");
  assert.equal(reviewedPlaceKey(d, "r318"), "r318");
  assert.equal(reviewedPlaceSearchText(d, { key: "r318" }), "08-319 Prep Room");
  assert.equal(reviewedPlaceSearchText(d, { key: "r340" }), "08-342");
  // Unreviewed data is unchanged.
  assert.deepEqual(reviewedSeparatePlaceKeys(data(null), ["r318", "r319"]), [
    "r318",
    "r319",
  ]);
});

test("explore lists and searches one place per reviewed alias, and the review no longer flags it", () => {
  const d = data();
  const region = {
    id: "native-region:1:1",
    levelId: 1,
    roomKeys: ["r318", "r319", "r342", "r340"],
  } as NativeExploreResult["regions"][number];
  const places = nativeExplorePlaces(d, region);
  assert.deepEqual(
    places.map((r) => r.key),
    ["r318", "r340"],
  );
  // Either number finds the one place.
  assert.deepEqual(
    filterNativeExplorePlaces(places, "08-319", d).map((r) => r.key),
    ["r318"],
  );
  assert.deepEqual(
    filterNativeExplorePlaces(places, "08-342", d).map((r) => r.key),
    ["r340"],
  );
  const result = {
    regions: [region],
    overview: {
      type: "FeatureCollection",
      features: [{ properties: { nativeRegionId: region.id } }],
    },
  } as unknown as NativeExploreResult;
  // Unreviewed: the corridor shares its area with the office and both prep rooms.
  const before = nativeMixedHallwayIssues(data(null), result);
  assert.deepEqual(
    before[0]!.otherPlaces.map((r) => r.key),
    ["r318", "r319", "r342"],
  );
  const after = nativeMixedHallwayIssues(d, result);
  assert.deepEqual(
    after[0]!.otherPlaces.map((r) => r.key),
    ["r318"],
  );
});
