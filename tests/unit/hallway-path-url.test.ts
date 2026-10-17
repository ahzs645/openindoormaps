import test from "node:test";
import assert from "node:assert/strict";
import { hallwayPathUrl } from "../../app/indoor-project/hallway-path-url";
import { routeSearch } from "../../app/utils/deep-link";

test("hallway inspection flag preserves package and floor queries in both route modes", () => {
  for (const base of [
    "https://example.test/openindoormaps/#/projects/indoor?package=%2Fproject.json&view=2d&floor=4",
    "https://example.test/projects/indoor?package=%2Fproject.json&view=2d&floor=4#details",
  ]) {
    const enabled = hallwayPathUrl(true, base);
    assert.equal(new URLSearchParams(routeSearch(enabled)).get("paths"), "1");
    assert.equal(hallwayPathUrl(true, enabled), enabled);
    assert.equal(hallwayPathUrl(false, enabled), base);
  }
  assert.equal(
    hallwayPathUrl(false, "https://example.test/#/projects/indoor?paths=1"),
    "https://example.test/#/projects/indoor",
  );
});
