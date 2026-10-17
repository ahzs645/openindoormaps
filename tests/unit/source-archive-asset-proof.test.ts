import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { preservedSourceEntryInventory, assertPreservedSourceEntryInventories } from "../../scripts/indoor/source-archive-asset-proof";

test("independent source entry proof permits only separately checked wrapper/room/viewer changes and different ZIP encoding", () => {
  const source = { "manifest.json": strToU8("old wrapper"), "floors/rooms.json": strToU8("old reviewed rooms"),
    "viewer/indoor.json": strToU8("old display"), "model/original.rvt": new Uint8Array([0, 1, 2]),
    "model/scene.glb": new Uint8Array([3, 4]), "gis/reference-points.json": strToU8("original GIS"),
    "review/companions.bin": new Uint8Array([5, 0, 6]),
  };
  const before = preservedSourceEntryInventory(zipSync(source, { level: 0 }));
  const after = preservedSourceEntryInventory(zipSync({ ...source, "manifest.json": strToU8("new wrapper"),
    "floors/rooms.json": strToU8("independently checked review"), "viewer/indoor.json": strToU8("fresh compiled display"),
    "viewer/prepared/new-chunk.bin": new Uint8Array([9]),
  }, { level: 9 }));
  const result = assertPreservedSourceEntryInventories(before, after);
  assert.equal(result.originalSourceAssetsPreservedByteForByte, true);
  assert.equal(result.entries.length, 4);
});

test("source/scene/GIS/companion mutations, missing originals and undeclared extra source assets refuse", () => {
  const original = { "model/original.rvt": new Uint8Array([0, 1]), "model/scene.glb": new Uint8Array([2, 3]),
    "gis/reference-points.json": strToU8("original GIS"), "review/companions.bin": new Uint8Array([4, 5]),
  };
  const before = preservedSourceEntryInventory(zipSync(original));
  for (const path of Object.keys(original) as (keyof typeof original)[]) {
    const changed = { ...original, [path]: new Uint8Array([9]) };
    assert.throws(() => assertPreservedSourceEntryInventories(before, preservedSourceEntryInventory(zipSync(changed))));
    const missing = { ...original }; delete (missing as Partial<typeof original>)[path];
    assert.throws(() => assertPreservedSourceEntryInventories(before, preservedSourceEntryInventory(zipSync(missing))));
  }
  assert.throws(() => assertPreservedSourceEntryInventories(before,
    preservedSourceEntryInventory(zipSync({ ...original, "review/extra.bin": new Uint8Array([9]) }))));
  assert.throws(() => assertPreservedSourceEntryInventories([], []));
});
