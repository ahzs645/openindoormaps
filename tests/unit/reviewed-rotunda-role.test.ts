import test from "node:test";
import assert from "node:assert/strict";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  reviewedRotundaPassage,
  pathwayCirculationOwner,
} from "../../app/indoor-project/reviewed-rotunda-role";
import { isHorizontalCirculationAnnotation } from "../../app/indoor-project/horizontal-circulation-annotations";
const source = {
  modelSha256:
    "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  roomsSha256:
    "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9",
} as IndoorDataset["source"];
const roles = [
  ["rm-311-2054e6ddb852", "04-124", 311, 3.2808398950131235],
  ["rm-694-07de695d7751", "04-259", 694, 14.435695538057743],
  ["rm-400176-0f6e59c1a3f5", "04-329", 400176, 24.278215223097114],
] as const;
test("the three walked UNBC rotundas are passage annotations while native records retain their original identity", () => {
  for (const [key, number, levelId, elevationFeet] of roles) {
    const r = {
      key,
      number,
      levelId,
      elevationFeet,
      name: "Rotunda",
      building: "04",
      walkable: true,
      circulation: false,
      access: "unknown",
      stair: false,
    } as IndoorRecord;
    assert.ok(pathwayCirculationOwner({ source }, r));
    assert.ok(isHorizontalCirculationAnnotation({ source }, r));
    for (const changed of [
      { walkable: false },
      { access: "staff" as const },
      { stair: true },
      { name: "Office" },
      { number: "04-256" },
      { key: "04-445" },
      { levelId: 0 },
      { elevationFeet: elevationFeet + 0.5 },
    ]) {
      assert.equal(
        reviewedRotundaPassage({ source }, { ...r, ...changed }),
        false,
      );
    }
    for (const changed of [{ roomsSha256: "other" }, { modelSha256: "other" }])
      assert.equal(
        reviewedRotundaPassage({ source: { ...source, ...changed } }, r),
        false,
      );
  }
});
