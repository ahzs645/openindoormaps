import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  progressiveInstructionPreview,
  progressivePlaceContext,
  progressivePlaceLabel,
  progressivePlaceScope,
} from "../../app/pages/progressive-instruction-preview";
import type { ProjectStep } from "../../app/indoor-project/navigation-steps";

const main = { id: "combined-main", building: "all", levelIds: [1, 2] };
const narrow = { id: "building-05", building: "05", levelIds: [2] };
const step: ProjectStep = {
  type: "floor-change",
  message: "Take the elevator up to Floor 2",
  distanceMeters: 3,
  fromLevel: 1,
  toLevel: 2,
  levelId: 2,
  building: "05",
  position: [-122.8, 53.8],
  arrivalPosition: [-122.7, 53.9],
  pointsFeet: [
    [0, 0, 0],
    [1, 1, 10],
  ],
};

test("instruction preview retains the compatible loaded Main scope and focuses the connector's arrival anchor", () => {
  const before = JSON.stringify(step);
  const result = progressiveInstructionPreview([narrow, main], main.id, step);
  assert.equal(result?.scope, main);
  assert.deepEqual(result?.position, step.arrivalPosition);
  assert.notDeepEqual(result?.position, step.position);
  assert.equal(JSON.stringify(step), before);
});

test("preserved duplicate circulation labels use original building/native-floor context without inventing a distinction", () => {
  const source = JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/progressive-duplicate-endpoint-labels.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    datasetSha256: string;
    names: {
      nativeLevels: { id: number; name: string }[];
      floors: { name: string; levelIds: number[] }[];
    };
    records: {
      key: string;
      name: string;
      number: string;
      building: string;
      levelId: number;
      sourceNativeFloorName: string;
      circulation: boolean;
    }[];
  };
  assert.equal(
    source.datasetSha256,
    "87194bb96ce4564699f5fb431ef00917fae93181f5730fe3e5f7056c1ca6ca1b",
  );
  assert.equal(source.records.length, 11);
  const before = JSON.stringify(source);
  for (const place of source.records) {
    assert.equal(place.circulation, true);
    assert.equal(
      progressivePlaceContext(place, source.names),
      `Building ${place.building} · ${place.sourceNativeFloorName}`,
    );
    const label = progressivePlaceLabel(place, source.names);
    assert.equal(
      label,
      `${place.name} · Building ${place.building} · ${place.sourceNativeFloorName}`,
    );
    assert(!label.includes(place.key));
  }
  const lower = source.records.find(
    (place) => place.key === "landing:ramp:1643796:lower",
  )!;
  assert.equal(
    progressivePlaceContext(lower, source.names),
    "Building 09 · Floor 0.5",
  );
  const upper = source.records.find(
    (place) => place.key === "landing:ramp:1622190:upper",
  )!;
  assert.equal(
    progressivePlaceContext(upper, source.names),
    "Building 08 · Floor 1.25",
  );
  const sameFloor = source.records.filter(
    (place) => place.name === "Atrium crosswalk" && place.levelId === 400_176,
  );
  assert.equal(sameFloor.length, 2);
  assert.equal(
    progressivePlaceLabel(sameFloor[0], source.names),
    progressivePlaceLabel(sameFloor[1], source.names),
    "Map comparison, not an invented descriptor, distinguishes these original places",
  );
  assert.equal(JSON.stringify(source), before);
});

test("walking keeps its own anchor; an absent connector arrival uses only the supplied start anchor", () => {
  assert.deepEqual(
    progressiveInstructionPreview([main], main.id, {
      ...step,
      type: "straight",
    })?.position,
    step.position,
  );
  assert.deepEqual(
    progressiveInstructionPreview([main], main.id, {
      ...step,
      arrivalPosition: undefined,
    })?.position,
    step.position,
  );
  assert.equal(
    progressiveInstructionPreview([main], main.id, {
      ...step,
      position: undefined,
      arrivalPosition: undefined,
    })?.position,
    undefined,
  );
});

test("an unavailable floor/building has no camera focus; compatible all-building fallback precedes a narrower new scope", () => {
  const wrongBuilding = { id: "other-building", building: "07", levelIds: [2] };
  assert.equal(
    progressiveInstructionPreview([wrongBuilding], wrongBuilding.id, step),
    undefined,
  );
  assert.equal(
    progressiveInstructionPreview([main], main.id, { ...step, levelId: 3 }),
    undefined,
  );
  assert.equal(
    progressivePlaceScope([narrow, main], "unloaded", 2, "05"),
    main,
  );
});
