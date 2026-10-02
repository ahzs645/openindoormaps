/** Audit the UNBC checkpoint archives and publish a lossless canonical pair.
 * Run: node --import tsx scripts/indoor/consolidate-unbc.ts downloads output-directory
 * Originals are read-only. Earlier routing graphs are never blindly unioned.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, readdir, mkdir, access } from "node:fs/promises";
import path from "node:path";
const { resolve, join } = path;
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";

const source = resolve(process.argv[2] ?? "/Users/ahmadjalil/Downloads");
const output = resolve(process.argv[3] ?? join(source, "UNBC.consolidated"));
const floorEvidencePath = process.argv[4];
const selected = process.argv[5] ?? "UNBC.indoor.wheelchair-ramp.reviter.zip";
const selectedPath = process.argv[5]
  ? resolve(selected)
  : join(source, selected);
const physical = "UNBC.indoor.physical-floor-routing.reviter.zip";
const hasPhysical = await access(join(source, physical)).then(
  () => true,
  () => false,
);
const baseline =
  process.argv[5] && hasPhysical
    ? physical
    : "UNBC.indoor.campus-floor-3-with-lifts.reviter.zip";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const originals = (await readdir(source))
  .filter((n) => n.startsWith("UNBC") && n.endsWith(".zip"))
  .sort();
const selectedBytes = new Uint8Array(await readFile(selectedPath));
const master = await readIndoorProject(selectedBytes);
if (master.manifest.format !== "reviter-project")
  throw new Error("Selected master must contain native model assets");
const base = await readIndoorProject(
  new Uint8Array(await readFile(join(source, baseline))),
);
const modelHash = master.dataset.source.modelSha256;
const fieldsAdded = ["reviewPins", "indoorReviews", "indoorRamps"];
const inherited = structuredClone(master.rooms) as Record<string, unknown>;
const baseReviews = structuredClone(base.rooms) as Record<string, unknown>;
for (const f of fieldsAdded) {
  delete inherited[f];
  delete baseReviews[f];
}
assert.deepEqual(
  inherited,
  baseReviews,
  "Ramp master must inherit every latest source review",
);
for (const field of [
  "floors",
  "nativeLevels",
  "connectors",
  "stairDisplay",
  "presentation",
  "walls",
  "doors",
] as const)
  assert.deepEqual(
    master.dataset[field],
    base.dataset[field],
    `Latest ${field} retained`,
  );
const edges = new Map(master.dataset.edges.map((e) => [e.id, e]));
const nodes = new Map(master.dataset.nodes.map((n) => [n.id, n]));
for (const e of base.dataset.edges)
  assert.deepEqual(edges.get(e.id), e, `Prior edge ${e.id}`);
for (const n of base.dataset.nodes)
  assert.deepEqual(nodes.get(n.id), n, `Prior node ${n.id}`);
const records = new Map(master.dataset.records.map((r) => [r.key, r]));
for (const r of base.dataset.records) {
  const current = structuredClone(records.get(r.key)!);
  if (r.key === "landing:local:07:311:08:1487816:1620957:1") {
    assert.equal(
      current.arrivalNodeId,
      "local:local:07:311:08:1487816:1620957:1",
    );
    assert.ok(current.arrivalNodeId);
    assert.ok(nodes.has(current.arrivalNodeId));
    current.name = r.name;
    if (!r.arrivalNodeId) delete current.arrivalNodeId;
  }
  assert.deepEqual(current, r, `Prior room ${r.key}`);
}
const inventory = [];
for (const name of originals) {
  const bytes = new Uint8Array(await readFile(join(source, name)));
  const p = await readIndoorProject(bytes);
  assert.equal(
    p.dataset.source.modelSha256,
    modelHash,
    `Different model in ${name}`,
  );
  const files = unzipSync(bytes),
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
  if (manifest.model.path)
    assert.equal(sha(files[manifest.model.path]), modelHash);
  for (const item of [
    manifest.floors,
    manifest.indoor,
    manifest.georeference,
    manifest.scene,
  ].filter(Boolean))
    assert.equal(
      sha(files[item.path]),
      item.sha256,
      `Manifest binding ${name}/${item.path}`,
    );
  const graphSame =
    JSON.stringify(p.dataset) === JSON.stringify(master.dataset);
  inventory.push({
    file: name,
    zipSha256: sha(bytes),
    bytes: bytes.length,
    kind: manifest.format,
    disposition:
      name === selected
        ? "most-complete-master"
        : graphSame
          ? "equivalent-complete-checkpoint"
          : "superseded-checkpoint-or-viewer",
    sourceKeys: Object.keys(p.rooms).sort(),
    records: p.dataset.records.length,
    arrivals: p.dataset.records.filter((r) => r.arrivalNodeId).length,
    nodes: p.dataset.nodes.length,
    edges: p.dataset.edges.length,
    presentedRooms: p.dataset.presentation?.rooms.length ?? 0,
    stairFlights: p.dataset.stairDisplay?.flights.length ?? 0,
    liftStops:
      p.dataset.connectors?.reduce((n, c) => n + c.entrances.length, 0) ?? 0,
    ramps: p.dataset.rampDisplay?.ramps.length ?? 0,
    floors: p.dataset.floors.map((f) => ({
      name: f.name,
      levelIds: f.levelIds,
    })),
  });
  console.log(`Validated ${name}`);
}
const sidecars = [];
for (const name of (await readdir(source))
  .filter(
    (n) => n.startsWith("UNBC") && n.includes(".zip.") && n.endsWith(".json"),
  )
  .sort()) {
  const bytes = await readFile(join(source, name));
  const data = JSON.parse(bytes.toString());
  sidecars.push({
    file: name,
    bytes: bytes.length,
    sha256: sha(bytes),
    keys: Object.keys(data),
    disposition: "diagnostic-report-retained-with-original",
  });
}
if (floorEvidencePath) {
  const evidence = JSON.parse(await readFile(floorEvidencePath, "utf8"));
  assert.equal(evidence.format, "openindoormaps-native-stair-occlusion");
  assert.equal(evidence.version, 1);
  assert.equal(evidence.sourceModelSha256, modelHash);
  assert.equal(
    evidence.flights.length,
    master.dataset.stairDisplay!.flights.length,
  );
  for (const flight of master.dataset.stairDisplay!.flights) {
    const item = evidence.flights.find(
      (f: { roomKey: string; stairElementId: number }) =>
        f.roomKey === flight.roomKey &&
        f.stairElementId === flight.stairElementId,
    );
    assert.ok(item);
    assert.equal(item.sourceGeometryKey, flight.sourceGeometryKey);
    flight.floorOccluders = item.floorOccluders;
  }
}
const journeys = [];
for (const c of master.dataset.connectors!)
  for (const a of c.entrances)
    for (const b of c.entrances) {
      if (a === b) continue;
      const route = findProjectRoute(master.dataset, a.roomKey, b.roomKey);
      assert.ok(route);
      assert.ok(route.edges.some((e) => e.connectorId === c.id));
      const steps = projectNavigationSteps(
        master.dataset,
        route,
        "Departure",
        "Destination",
      ).filter((s) => s.networkType === "elevator");
      assert.equal(steps.length, 1);
      assert.equal(steps[0].toLevel, b.levelId);
      assert.deepEqual(
        steps[0].pointsFeet.at(-1),
        nodes.get(b.nodeId)!.pointFeet,
      );
      journeys.push({
        connector: c.id,
        from: a.levelId,
        to: b.levelId,
        exitFeet: nodes.get(b.nodeId)!.pointFeet,
      });
    }
assert.equal(journeys.length, 18);
const start = "rm-311-86e02816d8fe",
  end = "landing:local:07:311:08:1487816:1620957:1";
for (const [a, b] of [
  [start, end],
  [end, start],
]) {
  const route = findProjectRoute(master.dataset, a, b, "accessible");
  assert.ok(route);
  assert.deepEqual(
    route.edges.map((e) => e.kind),
    ["walk", "ramp", "walk"],
  );
  assert.equal(route.unknownAccessibilityEdges, 0);
}
const roundtrip = await readIndoorProject(await exportIndoorProject(master));
assert.deepEqual(roundtrip.rooms, master.rooms);
assert.deepEqual(roundtrip.dataset, master.dataset);
const viewerBytes = await exportCampusViewer(master),
  viewer = await readIndoorProject(viewerBytes);
assert.deepEqual(viewer.dataset, master.dataset);
for (const c of viewer.dataset.connectors!)
  for (const a of c.entrances)
    for (const b of c.entrances)
      if (a !== b)
        assert.deepEqual(
          findProjectRoute(viewer.dataset, a.roomKey, b.roomKey),
          findProjectRoute(master.dataset, a.roomKey, b.roomKey),
        );
assert.deepEqual(
  findProjectRoute(viewer.dataset, start, end, "accessible"),
  findProjectRoute(master.dataset, start, end, "accessible"),
);
const selectedFiles = unzipSync(selectedBytes),
  roundtripFiles = roundtrip.files;
for (const name of [
  master.manifest.model.path!,
  "gis/reference-points.json",
  "model/scene.glb",
])
  assert.deepEqual(roundtripFiles[name], selectedFiles[name]);
const equivalentGroups = new Map<string, string[]>();
for (const row of inventory) {
  const names = equivalentGroups.get(row.zipSha256) ?? [];
  names.push(row.file);
  equivalentGroups.set(row.zipSha256, names);
}
const masterBytes = floorEvidencePath
  ? await exportIndoorProject(master)
  : selectedBytes;
const audit = {
  sourceDirectory: source,
  selectedSource: selected,
  baseSource: baseline,
  modelSha256: modelHash,
  archivesAudited: inventory.length,
  sidecarsAudited: sidecars.length,
  inventory,
  sidecars,
  byteIdenticalGroups: [...equivalentGroups.values()].filter(
    (g) => g.length > 1,
  ),
  mostCompleteExtendsLatestMaster: true,
  priorEdgesPreserved: base.dataset.edges.length,
  priorNodesPreserved: base.dataset.nodes.length,
  priorRoomsPreserved: base.dataset.records.length,
  masterRoundtripLossless: true,
  modelSceneAndGISPreserved: true,
  viewerGeometryAndNavigationIdentical: true,
  rampBidirectionalStepFreeRoutePassed: true,
  elevatorJourneys: journeys,
  master: {
    file: "UNBC.master.reviter.zip",
    bytes: masterBytes.length,
    sha256: sha(masterBytes),
  },
  ...(floorEvidencePath
    ? { stairFloorEvidence: resolve(floorEvidencePath) }
    : {}),
  viewer: {
    file: "UNBC.campus-viewer.zip",
    bytes: viewerBytes.length,
    sha256: sha(viewerBytes),
  },
  limitations: {
    unmatchedDoors: master.dataset.report.unmatchedDoors,
    liftAccessibility: "unknown",
    sharedStair: "Native flight display only; no new landing route approval",
    rampRegeneration:
      "Reviter currently preserves indoorRamps metadata but does not reconstruct prepared ramp graph. Reapply scripts/indoor/prepare-unbc-ramp.ts to regenerated master using the same-model native cache.",
  },
};
await mkdir(output, { recursive: true });
// Preserve the graph; optional native evidence changes display only.
await writeFile(join(output, "UNBC.master.reviter.zip"), masterBytes, {
  flag: "wx",
});
await writeFile(join(output, "UNBC.campus-viewer.zip"), viewerBytes, {
  flag: "wx",
});
await writeFile(
  join(output, "audit.json"),
  JSON.stringify(audit, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  join(output, "README.txt"),
  [
    "UNBC consolidated package — 2026-10-02",
    "",
    "UNBC.master.reviter.zip — editable full master, with original RVT and native GLB scene.",
    "UNBC.campus-viewer.zip — lightweight browsing package; identical 2D/3D geometry and routing, without RVT, scene or authoring controls.",
    "",
    `Audited ${inventory.length} archives and ${sidecars.length} diagnostic JSON files. Most complete source: ${selected}.`,
    "Includes native room presentation, source boundaries and provenance, door-axis and connectivity repairs, native stair heights, shared-corridor stair display, Campus Floors 1 and 3, both lifts/seven stops with individual exits, and the separate native Agora wheelchair ramp.",
    "All prior latest-master nodes and edges retained. 18 directional lift journeys, both ramp directions and master/viewer round-trips verified. audit.json records every input and checksum.",
    "Earlier viewer exports and checkpoint ZIPs are superseded. All originals and their diagnostic reports remain in Downloads.",
    "",
    `Remaining review: ${master.dataset.report.unmatchedDoors} unmatched doors; lift accessibility remains unknown; shared stair landing routes still need review. The ramp retains its specific user accessibility review.`,
    "Regeneration: keep this full master. Reviter alone currently drops the prepared ramp graph even though indoorRamps metadata survives. After regenerating, reapply the native ramp preparation script before using the new master.",
    "  node --import tsx scripts/indoor/prepare-unbc-ramp.ts regenerated.reviter.zip /Users/ahmadjalil/github/reviter/work/unbc-folder-preview/navigation-model.json restored-ramp.reviter.zip",
    "Run that command from /Users/ahmadjalil/github/openindoormaps and keep input/output distinct.",
    "",
  ].join("\n"),
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    {
      output,
      archives: inventory.length,
      sidecars: sidecars.length,
      masterBytes: masterBytes.length,
      viewerBytes: viewerBytes.length,
      elevatorJourneys: journeys.length,
      ramp: "both directions passed",
    },
    null,
    2,
  ),
);
