import assert from "node:assert/strict";
import test from "node:test";
import {
  loadBuildingOverview,
  saveBuildingOverview,
} from "../../app/indoor-project/building-overview";

const legacyKey = "openindoormaps.keep-building-overview.v1";
const revealKey = "openindoormaps.reveal-rooms-on-zoom.v2";

test("zoom reveal replaces the legacy saved lock and preserves a new explicit fixed-overview choice", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map([[legacyKey, "true"]]);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    assert.equal(
      loadBuildingOverview(),
      false,
      "legacy fixed overview does not disable automatic zoom reveal",
    );
    saveBuildingOverview(false);
    assert.equal(values.get(revealKey), "true");
    assert.equal(loadBuildingOverview(), false);
    assert.equal(
      values.get(legacyKey),
      "true",
      "old preference is left intact",
    );

    saveBuildingOverview(true);
    assert.equal(values.get(revealKey), "false");
    assert.equal(loadBuildingOverview(), true, "new explicit opt-out survives");
    saveBuildingOverview(false);
    assert.equal(
      loadBuildingOverview(),
      false,
      "automatic reveal can be restored",
    );

    for (const invalid of ["", "0", "TRUE", "unknown"]) {
      values.set(revealKey, invalid);
      assert.equal(loadBuildingOverview(), false);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("blocked browser storage keeps automatic reveal available without interrupting preference changes", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage is blocked");
    },
  });
  try {
    assert.equal(loadBuildingOverview(), false);
    assert.doesNotThrow(() => saveBuildingOverview(true));
    assert.doesNotThrow(() => saveBuildingOverview(false));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
