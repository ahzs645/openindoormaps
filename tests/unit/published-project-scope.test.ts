import test from "node:test";
import assert from "node:assert/strict";
import { publishedScopeFor } from "../../app/indoor-project/published-project-scope";
import type { ProgressiveManifest } from "../../app/indoor-project/progressive-delivery";
import type { IndoorDataset } from "../../app/indoor-project/contract";
function fixture() {
  const source = {
    modelFileName: "test.rvt",
    modelSha256: "1".repeat(64),
    roomsSha256: "2".repeat(64),
  };
  const options = {
    relativeHeights: true,
    showPillars: true,
    showPassThroughPlaces: false,
    showVestibuleDoors: false,
    showStructures: false,
    showDoorwayRecesses: false,
    review: false,
    simplifyGeometry: false,
  };
  const manifest = {
    provenance: { source },
    scopes: [
      {
        id: "main",
        building: "all",
        levelIds: [10, 20],
        display: {
          descriptor: { binding: { options, windowMode: "simplified" } },
        },
      },
    ],
  } as unknown as ProgressiveManifest;
  const data = {
    source,
    nativeIndoorEnvelopes: {},
    nativeMaterialSections: {},
    windowDisplay: { mode: "simplified" },
  } as unknown as IndoorDataset;
  const props = {
    ...options,
    relativeHeights: false,
    data,
    levelIds: [20, 10],
    building: "all",
  };
  return { manifest, props };
}
test("combined native levels reuse the bound physical floor even in flat view", () => {
  const f = fixture();
  assert.equal(publishedScopeFor(f.manifest, f.props)?.id, "main");
});
test("different levels, buildings, sources or drawing options retain ordinary preparation", () => {
  const f = fixture();
  for (const change of [
    { levelIds: [10] },
    { levelIds: [10, 30] },
    { building: "other" },
    { review: true },
    { simplifyGeometry: true },
    { showPillars: false },
    { showDoorwayRecesses: true },
  ])
    assert.equal(
      publishedScopeFor(f.manifest, { ...f.props, ...change }),
      undefined,
    );
  const other = {
    ...f.props.data,
    source: { ...f.props.data.source, roomsSha256: "0".repeat(64) },
  };
  assert.equal(
    publishedScopeFor(f.manifest, { ...f.props, data: other }),
    undefined,
  );
});
