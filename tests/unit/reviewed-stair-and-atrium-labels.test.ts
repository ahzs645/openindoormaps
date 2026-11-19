import assert from "node:assert/strict";
import test from "node:test";
import { isHorizontalCirculationAnnotation } from "../../app/indoor-project/horizontal-circulation-annotations";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";

const source = {
  modelSha256:
    "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  roomsSha256:
    "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
} as IndoorDataset["source"];

const records = [
  ["rm-694-64239d17d7d8", "05-201", "Corridor", 694, true],
  ["rm-694-0cb418ab63c6", "06-201", "Vestibule", 694, true],
  ["rm-311-0850e3c8e4ce", "07-203", "Unnamed area", 311, false],
  ["rm-311-935a520f9690", "07-203", "Plaza Street", 311, false],
] as const;

test("reviewed horizontal labels can share a stair record or room number", () => {
  for (const [key, number, name, levelId, stair] of records) {
    const r = {
      key,
      number,
      name,
      levelId,
      stair,
      building: number.slice(0, 2),
      elevationFeet: levelId === 311 ? 0 : 14.435_695_538_057_743,
      access: "unknown",
      circulation: true,
      walkable: true,
    } satisfies Parameters<typeof isHorizontalCirculationAnnotation>[1];
    assert.equal(isHorizontalCirculationAnnotation({ source }, r), true);
    for (const changes of [
      { key: "unrelated" },
      { name: "Stair" },
      { number: "different" },
      { levelId: 111 },
      { access: "staff" as IndoorRecord["access"] },
      { walkable: false },
      { circulation: false },
    ])
      assert.equal(
        isHorizontalCirculationAnnotation({ source }, { ...r, ...changes }),
        false,
      );
    for (const changes of [{ roomsSha256: "other" }, { modelSha256: "other" }])
      assert.equal(
        isHorizontalCirculationAnnotation(
          { source: { ...source, ...changes } },
          r,
        ),
        false,
      );
  }
});
