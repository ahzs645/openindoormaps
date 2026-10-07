import test from "node:test";
import assert from "node:assert/strict";
import {
  basemapSymbolImage,
  registerBasemapSymbolImages,
} from "../../app/utils/basemap-symbol-images";

test("missing semantic symbols have distinct visible ink and transparent surrounds", () => {
  const images = ["sports_centre", "gate", "recycling"].map(
    (id) => basemapSymbolImage(id)!,
  );
  for (const image of images) {
    assert.equal(image.width, 42);
    assert.equal(image.height, 42);
    assert.equal(image.data.length, 42 * 42 * 4);
    const ink = Array.from(
      { length: 42 * 42 },
      (_, i) => image.data[i * 4] < 120 && image.data[i * 4 + 3] > 200,
    ).filter(Boolean).length;
    assert.ok(
      ink > 100,
      "must draw a meaningful symbol, not an empty warning placeholder",
    );
    assert.equal(image.data[3], 0);
  }
  assert.notDeepEqual(images[0].data, images[1].data);
  assert.notDeepEqual(images[1].data, images[2].data);
  assert.equal(basemapSymbolImage("unrecognised_basemap_poi"), undefined);
});

test("registration preserves existing sprites, restores replaced styles, and cleans up", () => {
  let handler: ((event: { id: string }) => void) | undefined;
  const images = new Set<string>(["gate"]),
    added: string[] = [];
  const map = {
    on: (type: string, cb: typeof handler) => {
      assert.equal(type, "styleimagemissing");
      handler = cb;
    },
    off: (type: string, cb: typeof handler) => {
      assert.equal(type, "styleimagemissing");
      assert.equal(cb, handler);
      handler = undefined;
    },
    hasImage: (id: string) => images.has(id),
    addImage: (
      id: string,
      image: ReturnType<typeof basemapSymbolImage>,
      options: { pixelRatio: number },
    ) => {
      assert.ok(image && image.data.some((v, i) => i % 4 === 3 && v > 0));
      assert.equal(options.pixelRatio, 2);
      images.add(id);
      added.push(id);
    },
  };
  const cleanup = registerBasemapSymbolImages(
    map as unknown as Parameters<typeof registerBasemapSymbolImages>[0],
  );
  handler!({ id: "gate" });
  handler!({ id: "sports_centre" });
  handler!({ id: "sports_centre" });
  handler!({ id: "unknown-icon" });
  assert.deepEqual(added, ["sports_centre"]);
  images.clear(); // MapLibre removes runtime images when a new style is loaded.
  handler!({ id: "sports_centre" });
  handler!({ id: "gate" });
  handler!({ id: "recycling" });
  assert.deepEqual(added, [
    "sports_centre",
    "sports_centre",
    "gate",
    "recycling",
  ]);
  cleanup();
  assert.equal(handler, undefined);
});
