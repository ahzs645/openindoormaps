import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterIndoorMapData } from "../app/utils/indoor-floor-view";
import type { IndoorMapGeoJSON } from "../app/types/geojson";

const read = (name: string): IndoorMapGeoJSON =>
  JSON.parse(readFileSync(`app/data/bc-hospital/${name}.geojson`, "utf8"));
const raw = read("indoor-map");
const context = read("floor-context");
const unchanged = JSON.stringify(raw);
for (const floor of [-100, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7]) {
  for (const view of ["2d", "3d"] as const) {
    const rendered = filterIndoorMapData(raw, floor, true, view, context);
    const underlay = rendered.features.filter(
      (f) =>
        f.properties.view_context && f.properties.feature_type !== "room_edge",
    );
    assert.equal(
      underlay.length,
      context.features.filter(
        (f) => f.properties.context_for_level_id === floor,
      ).length,
    );
    assert.ok(
      rendered.features.every((f) =>
        f.properties.view_context
          ? f.properties.level_id! < floor
          : f.properties.level_id === floor || f.properties.level_id === null,
      ),
    );
    if (view === "2d") {
      const firstRoom = rendered.features.findIndex(
        (f) => f.properties.feature_type === "unit",
      );
      assert.ok(
        firstRoom === -1 ||
          rendered.features
            .slice(firstRoom)
            .every((f) => f.properties.feature_type === "unit"),
      );
      assert.ok(
        rendered.features.every((f) => f.properties.extrusion_height === 0),
      );
    } else {
      for (const feature of underlay) {
        const original = context.features.find((f) => f.id === feature.id)!;
        assert.equal(
          feature.properties.extrusion_height,
          (Number(original.properties.extrusion_height) * 0.35) /
            Number(original.properties.context_depth),
        );
        assert.deepEqual(feature.geometry, original.geometry);
      }
    }
  }
}
assert.equal(JSON.stringify(raw), unchanged);
console.log(
  "PASS: all 11 floor views retain only the active floor and its clipped lower context in 2D/3D; raw source geometry stays unchanged.",
);
