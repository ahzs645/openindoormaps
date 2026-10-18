/** Read every complete already admitted floor through the production decoder,
 * project its EXACT active 2D drawing, and emit inert content-addressed assets.
 * No source, manifest or compiled allowlist is edited. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "fflate";
import { decodePublishedProgressiveFloor } from "../../app/indoor-project/published-floor-decoder";
import { ProgressiveVisitorClient } from "../../app/indoor-project/progressive-visitor-client";
import { MemoryVisitorDeliveryCache } from "../../app/indoor-project/visitor-delivery-cache";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
  type ProgressiveAsset,
  type ProgressiveShell,
} from "../../app/indoor-project/progressive-delivery";
import { applyPublishedCirculationPaint } from "../../app/indoor-project/published-circulation-paint";
import { projectPublishedVisitorPlan } from "../../app/indoor-project/published-visitor-plan-projection";
import { mapDrawingFeatures } from "../../app/indoor-project/map-drawing-features";
import {
  mapSourceFeatures,
  NATIVE_EXPLORE_PROPERTIES,
} from "../../app/indoor-project/map-source-properties";
import { visitorRoomSurfaces } from "../../app/indoor-project/visitor-room-surfaces";
import { visitorRoomLabels } from "../../app/indoor-project/visitor-labels";
import { DEFAULT_LABEL_SETTINGS } from "../../app/indoor-project/label-settings";
import { PUBLISHED_PROJECT_RECEIPTS } from "../../app/indoor-project/published-project-receipts";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import { optimizePublishedVisitorPlanCarriers } from "./optimize-published-visitor-plan-carriers";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import type { FeatureCollection } from "geojson";
import type { PublishedVisitorPlan } from "../../app/indoor-project/published-visitor-plan-types";
const [input, expectedSha, output] = process.argv.slice(2);
if (!input || !/^[a-f0-9]{64}$/.test(expectedSha ?? "") || !output)
  throw new Error(
    "Usage: export-published-visitor-plans.ts VERIFIED-FLOOR-DIRECTORY EXPECTED-MANIFEST-SHA256 EMPTY-OUTPUT-DIRECTORY",
  );
const root = path.resolve(import.meta.dirname, "../.."),
  directory = path.resolve(input),
  out = path.resolve(output),
  sha = (v: Uint8Array | string) =>
    createHash("sha256").update(v).digest("hex"),
  jsonSha = (v: unknown) => sha(JSON.stringify(v));
await fs.mkdir(out, { recursive: true });
assert.equal((await fs.readdir(out)).length, 0);
const manifestBytes = await fs.readFile(path.join(directory, "manifest.json"));
assert.equal(sha(manifestBytes), expectedSha);
const manifest = JSON.parse(manifestBytes.toString()) as ProgressiveManifest;
validateProgressiveManifest(manifest);
assert(
  PUBLISHED_PROJECT_RECEIPTS.some(
    (r) =>
      r.validatorSha256 === PREPARED_DISPLAY_ENGINE_SHA256 &&
      r.progressiveRevisionSha256 === manifest.revisionSha256 &&
      r.datasetSha256 === manifest.provenance.datasetSha256 &&
      r.packageSha256 === manifest.provenance.packageSha256,
  ),
  "No compiled full-floor admission for this exact source/revision",
);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
);
const read = async (
  _asset: ProgressiveAsset,
  r: ProgressiveAsset["representations"][number],
) => {
  const target = path.resolve(directory, r.path);
  assert(target.startsWith(directory + path.sep));
  return new Uint8Array(await fs.readFile(target));
};
const client = ProgressiveVisitorClient.fromManifest(
  "https://plan-candidate.test/data/unbc/manifest.json",
  manifest,
  {
    cache: new MemoryVisitorDeliveryCache(),
    fetch: async (input) => {
      const url = new URL(String(input)),
        relative = url.pathname.replace(/^\/data\/unbc\//, "");
      const target = path.resolve(directory, relative);
      assert(target.startsWith(directory + path.sep));
      return new Response(await fs.readFile(target));
    },
  },
);
const shell = JSON.parse(
  new TextDecoder().decode(await client.readAsset(manifest.shellAssetId)),
) as ProgressiveShell;
const records = [],
  began = performance.now();
for (const scope of manifest.scopes) {
  const started = performance.now(),
    decoded = await decodePublishedProgressiveFloor(manifest, scope, read);
  assert(decoded, "Full normal published floor decoder must admit each scope");
  const display = applyPublishedCirculationPaint(decoded, manifest, scope),
    context = await client.readPresentationContext(scope),
    plan = projectPublishedVisitorPlan(
      manifest,
      scope,
      display,
      context,
      shell.display,
    ),
    p = display.preparedFloor,
    d = p.presentation.display;
  const excluded = new Set([...p.nativeStairKeys, ...p.stairSurroundKeys]);
  const expected: Record<
    keyof PublishedVisitorPlan["layers"],
    FeatureCollection
  > = {
    areas: visitorRoomSurfaces(p.physicalGround, false),
    rooms: {
      ...d.roomBlocks,
      features: [
        ...d.roomBlocks.features.filter(
          (f) => !excluded.has(String(f.properties?.key)),
        ),
        ...p.assumedRoomBlocks.features,
      ],
    },
    walls:
      (shell.display.windowMode === "native"
        ? p.presentation.nativeWindowPlanWalls?.visitor
        : undefined) ?? p.presentation.visitorWalls,
    doors: d.doorFootprints,
    stairs: p.nativeStairs,
    windows: {
      ...p.presentation.nativeWindows,
      features: p.presentation.nativeWindows.features.filter(
        (f) => f.properties?.atPlanCut === true,
      ),
    },
    // Independent active-view expectation, matching map-layers.tsx's neutral
    // (not selected, not overview-locked) visitor label composition.
    labels: {
      ...d.labels,
      features: [
        ...p.presentation.overviewLabels.features.map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            maxZoom: DEFAULT_LABEL_SETTINGS.roomZoom - 1,
          },
        })),
        ...visitorRoomLabels(
          context.visitorLabels,
          d.records,
          "",
          DEFAULT_LABEL_SETTINGS,
        ).features,
      ],
    },
    portals: context.portals,
    selection: p.selectionAreas,
  };
  const rawExpected = { ...expected };
  const rawCounts = Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [
      key,
      value.features.length,
    ]),
  );
  const nativeLevels =
    display.nativeFaces.regions.length > 0 ? scope.levelIds : [];
  const nativeKeys = new Set(
    d.records.filter((r) => nativeLevels.includes(r.levelId)).map((r) => r.key),
  );
  for (const name of ["areas", "rooms", "selection"] as const)
    expected[name] = {
      ...expected[name],
      features: expected[name].features.filter(
        (f) =>
          !nativeKeys.has(String(f.properties?.key)) &&
          !nativeLevels.includes(Number(f.properties?.levelId)),
      ),
    };
  if (nativeLevels.length > 0 && shell.display.nativeMaterialSections)
    expected.walls = { ...expected.walls, features: [] };
  const layers = Object.fromEntries(
    Object.entries(expected).map(([name, value]) => {
      const drawing = mapDrawingFeatures(value);
      assert.equal(
        jsonSha(plan.layers[name as keyof typeof plan.layers]),
        jsonSha(drawing),
        name,
      );
      return [
        name,
        {
          features: drawing.features.length,
          rawGeometrySha256: jsonSha(
            rawExpected[name as keyof typeof rawExpected].features.map(
              (f) => f.geometry,
            ),
          ),
          rawFeatures: rawCounts[name],
          omittedInvisibleFeatures: rawCounts[name] - drawing.features.length,
          omissionPredicate: ["areas", "rooms", "selection"].includes(name)
            ? "existing-nativeOpacity"
            : name === "walls" &&
                nativeLevels.length > 0 &&
                shell.display.nativeMaterialSections
              ? "existing-exposedWallsShown"
              : null,
          sha256: jsonSha(drawing),
          geometrySha256: jsonSha(drawing.features.map((f) => f.geometry)),
        },
      ];
    }),
  );
  const native = plan.native
    ? Object.fromEntries(
        (["fills", "overview", "outlines", "partitions", "walls"] as const).map(
          (name) => {
            const original = display.nativeFaces[name] ?? {
                type: "FeatureCollection" as const,
                features: [],
              },
              drawing = mapSourceFeatures(
                mapDrawingFeatures(original),
                NATIVE_EXPLORE_PROPERTIES,
              );
            assert.equal(jsonSha(plan.native![name]), jsonSha(drawing));
            assert.equal(
              jsonSha(plan.native![name].features.map((f) => f.geometry)),
              jsonSha(original.features.map((f) => f.geometry)),
            );
            return [
              name,
              {
                features: drawing.features.length,
                rawFeatures: original.features.length,
                omittedInvisibleFeatures: 0,
                rawGeometrySha256: jsonSha(
                  original.features.map((f) => f.geometry),
                ),
                sha256: jsonSha(drawing),
                geometrySha256: jsonSha(
                  original.features.map((f) => f.geometry),
                ),
              },
            ];
          },
        ),
      )
    : undefined;
  if (plan.native)
    assert.deepEqual(
      plan.native.regions,
      display.nativeFaces.regions.map(({ id, levelId, roomKeys }) => ({
        id,
        levelId,
        roomKeys,
      })),
    );
  const logical = new TextEncoder().encode(JSON.stringify(plan)),
    stored = gzipSync(logical, { level: 9, mtime: 0 }),
    digest = sha(stored),
    name = digest + ".json.gz";
  await fs.writeFile(path.join(out, name), stored, { flag: "wx" });
  const readback = JSON.parse(new TextDecoder().decode(logical));
  assert.deepEqual(readback, plan);
  const record = {
    id: "exact-native-2d-" + scope.id,
    revisionSha256: manifest.revisionSha256,
    engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
    datasetSha256: manifest.provenance.datasetSha256,
    scopeId: scope.id,
    bindingSha256: scope.display.descriptor.bindingSha256,
    pooledJsonSha256: scope.display.descriptor.pooledJsonSha256,
    logicalSha256: sha(logical),
    logicalBytes: logical.length,
    compressedSha256: digest,
    compressedBytes: stored.length,
    url: "/data/unbc-plans/" + name,
  };
  records.push({
    receipt: record,
    fullFloorPooledBytes: scope.display.descriptor.pooledJsonBytes,
    layers,
    native,
    nativeRegions: plan.native?.regions.length ?? 0,
    elapsedSeconds: (performance.now() - started) / 1000,
  });
  await fs.writeFile(
    path.join(out, "candidate-plans.json"),
    JSON.stringify(
      {
        format: "published-visitor-plan-candidates-v1",
        compiledTrustRootChanged: false,
        published: false,
        manifestFileSha256: expectedSha,
        revisionSha256: manifest.revisionSha256,
        engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
        allCompleteFloorScopes: manifest.scopes.length,
        completedScopes: records.length,
        records,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      scope: scope.id,
      logicalBytes: logical.length,
      compressedBytes: stored.length,
      elapsedSeconds: (performance.now() - started) / 1000,
    }),
  );
}
const transportSharing = await optimizePublishedVisitorPlanCarriers(
  out,
  records,
);
const description = JSON.parse(
  await fs.readFile(path.join(out, "candidate-plans.json"), "utf8"),
);
description.records = records;
description.transportSharing = transportSharing;
await fs.writeFile(
  path.join(out, "candidate-plans.json"),
  JSON.stringify(description, null, 2),
);
assert.equal(
  sha(await fs.readFile(path.join(directory, "manifest.json"))),
  expectedSha,
);
assert.equal(
  preparedDisplayEngineBinding(root).sha256,
  PREPARED_DISPLAY_ENGINE_SHA256,
);
await fs.writeFile(
  path.join(out, "proof.json"),
  JSON.stringify(
    {
      format: "published-visitor-plan-full-floor-projection-proof-v1",
      passed: true,
      allScopesVerified: records.length,
      sourceManifestFileSha256: expectedSha,
      revisionSha256: manifest.revisionSha256,
      engineSha256: PREPARED_DISPLAY_ENGINE_SHA256,
      datasetSha256: manifest.provenance.datasetSha256,
      sourcePackageSha256: manifest.provenance.packageSha256,
      logicalBytes: records.reduce((n, r) => n + r.receipt.logicalBytes, 0),
      compressedBytes: records.reduce(
        (n, r) => n + r.receipt.compressedBytes,
        0,
      ),
      elapsedSeconds: (performance.now() - began) / 1000,
      transportSharing,
      allLayerCoordinatesHolesAndOwnerPropertiesExact: true,
      compiledTrustRootChanged: false,
      runtimeAdmissionPending: true,
      published: false,
    },
    null,
    2,
  ),
);
client.close();
