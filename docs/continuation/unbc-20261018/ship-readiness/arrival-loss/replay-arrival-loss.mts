/** Immutable failed-state mathematical replay only; no route or source authority restored. */
import { readFile, writeFile } from "node:fs/promises";
import { deserialize } from "node:v8";
import { nativeRationalOverlay } from "../../../../../app/indoor-project/native-rational-overlay.ts";
import { nativeRationalIntersectionOperand } from "../../../../../app/indoor-project/native-rational-intersection-broadphase.ts";
import {
  createNativeExactTopologyIndex,
  nativeRationalMeasuredArea,
  nativeRationalAreaCompare,
  nativeRationalPointInParts,
} from "../../../../../app/indoor-project/native-exact-planar-topology.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const [originalPath, preparedPath, outputPath] = process.argv.slice(2);
assert(
  originalPath && preparedPath && outputPath,
  "Usage: replay-arrival-loss.mts ORIGINAL_INDOOR.json PREPARED.bin NEW_REPORT.json",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const originalBytes = await readFile(originalPath),
  preparedBytes = await readFile(preparedPath);
assert.equal(
  hash(originalBytes),
  "31b3bc2d226fe006c404cfb4914ddac723e984c2d2f42cc91d6bdc095b1f2a27",
  "Wrong original mathematical dataset",
);
assert.equal(
  hash(preparedBytes),
  "fd37be0d0a5a40b4772cdd5693106be0b3b1a85b0ea7eae2441543eb2db2e878",
  "Wrong failed prepared snapshot",
);
const before = JSON.parse(originalBytes.toString()),
  d = deserialize(preparedBytes);
const index = (data) =>
  createNativeExactTopologyIndex(data.circulationGeometry.exactTopology, {
    sourceModelSha256: data.source.modelSha256,
    sourceGeometryKey: data.circulationGeometry.sourceGeometryKey,
    kernelVersion: data.circulationGeometry.exactTopology.kernelVersion,
  });
const a = index(before),
  b = index(d),
  z = 14.435695538057743,
  treads = (data) =>
    (data.stairDisplay?.sourceFlights ?? []).flatMap((f) => f.treads),
  rows = [];
for (const [key, oldId, newId, run, siblingId] of [
  [
    "rm-694-0bed6b73a3bd",
    "native-face:14.435696:3166",
    "native-face:14.435696:3151",
    1638854,
    undefined,
  ],
  [
    "rm-694-504b25e5319a",
    "native-face:14.435696:2881",
    "native-face:14.435696:2868",
    2354663,
    "native-face:14.435696:3114",
  ],
]) {
  const old = a.parts(oldId),
    now = b.parts(newId),
    sibling = siblingId ? b.parts(siblingId) : [],
    retained = sibling.length
      ? nativeRationalOverlay("union", now, sibling)
      : now,
    removed = nativeRationalOverlay("difference", old, retained),
    masks = treads(d).filter(
      (t) =>
        t.runElementId === run &&
        t.elevationFeet > z + 0.05 &&
        t.elevationFeet < z + 6,
    ),
    near = nativeRationalIntersectionOperand(
      removed,
      masks.map((t) => [t.ringFeet]),
    ),
    covered = near.length
      ? nativeRationalOverlay("intersection", removed, near)
      : [],
    remainder = nativeRationalOverlay("difference", removed, covered),
    p = d.nodes.find((n) => n.id === `arrival:${key}`).pointFeet;
  const ownerBefore = before.records.find((r) => r.key === key),
    ownerAfter = d.records.find((r) => r.key === key);
  assert.equal(ownerBefore.arrivalNodeId, `arrival:${key}`);
  assert.equal(ownerAfter.arrivalNodeId, undefined);
  assert.deepEqual(ownerBefore.ringsFeet, ownerAfter.ringsFeet);
  assert.deepEqual(
    before.nodes.find((n) => n.id === `arrival:${key}`).pointFeet,
    p,
  );
  const sourceFloorsUnchanged = [503705, 400479, 490040].every((id) => {
    const floorHash = (data) =>
      hash(
        JSON.stringify(
          data.walkingSupport.floors.filter(
            (f) => f.nativeElementId === id && f.elevationFeet === z,
          ),
        ),
      );
    return floorHash(before) === floorHash(d);
  });
  assert(sourceFloorsUnchanged, "A named original slab changed");
  const currentFaces = d.circulationGeometry.exactTopology.faces
    .filter(
      (f) =>
        f.id.startsWith(`native-face:${z.toFixed(6)}:`) &&
        nativeRationalPointInParts(p, b.parts(f.id)),
    )
    .map((f) => ({
      id: f.id,
      cells: d.circulationGeometry.cells
        .filter((c) => c.exactFaceId === f.id)
        .map((c) => c.id),
    }));
  const identity = nativeRationalOverlay("union", [ownerAfter.ringsFeet]);
  const overlap = nativeRationalOverlay("intersection", identity, now);
  const sourceTreadInventoryUnchanged =
    hash(
      JSON.stringify(treads(before).filter((t) => t.runElementId === run)),
    ) === hash(JSON.stringify(treads(d).filter((t) => t.runElementId === run)));
  const door = d.nodes
    .filter((n) => n.roomKey === key && n.kind === "portal")
    .map((node) => ({
      id: node.id,
      point: node.pointFeet,
      onNamedSlab: d.walkingSupport.floors.some(
        (f) =>
          f.elevationFeet === z &&
          nativeRationalPointInParts(
            node.pointFeet,
            nativeRationalOverlay("union", f.partsFeet ?? [f.ringsFeet]),
          ),
      ),
      exactFaces: d.circulationGeometry.exactTopology.faces
        .filter(
          (f) =>
            f.id.startsWith(`native-face:${z.toFixed(6)}:`) &&
            nativeRationalPointInParts(node.pointFeet, b.parts(f.id)),
        )
        .map((f) => ({
          id: f.id,
          cells: d.circulationGeometry.cells
            .filter((c) => c.exactFaceId === f.id)
            .map((c) => c.id),
        })),
      sourceIncidentEdges: d.edges
        .filter((e) => e.enabled && (e.from === node.id || e.to === node.id))
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          enabled: e.enabled,
          nativeCellId: e.nativeCellId,
        })),
    }));
  rows.push({
    key,
    run,
    sourceFloorsUnchanged,
    sourceTreadInventoryUnchanged,
    originalOutlineAndSeedUnchanged: true,
    currentFaces,
    identityOverlapArea: nativeRationalMeasuredArea(overlap),
    memberByHalfIdentity: nativeRationalAreaCompare(overlap, identity, 2n) >= 0,
    memberByHalfFace: nativeRationalAreaCompare(overlap, now, 2n) >= 0,
    oldFace: oldId,
    newFace: newId,
    sourceMaskTreadCountBefore: treads(before).filter(
      (t) => t.runElementId === run,
    ).length,
    sourceMaskTreadCountAfter: treads(d).filter((t) => t.runElementId === run)
      .length,
    removedArea: nativeRationalMeasuredArea(removed),
    retainedSiblingArea: nativeRationalMeasuredArea(sibling),
    coveredArea: nativeRationalMeasuredArea(covered),
    unattributedArea: nativeRationalMeasuredArea(remainder),
    removedFullyAccountedByOwnRunTreads:
      nativeRationalAreaCompare(remainder, []) === 0,
    seedInsideOwnRunHeadroomMask: masks.some((t) =>
      nativeRationalPointInParts(
        p,
        nativeRationalOverlay("union", [[t.ringFeet]]),
      ),
    ),
    doorways: door,
  });
}
const [library, admin] = rows;
assert.equal(library.removedFullyAccountedByOwnRunTreads, true);
assert.equal(library.seedInsideOwnRunHeadroomMask, false);
assert.equal(library.sourceTreadInventoryUnchanged, true);
assert.equal(library.currentFaces.length, 1);
assert.deepEqual(library.currentFaces[0].cells, []);
assert.equal(library.memberByHalfIdentity, false);
assert.equal(library.memberByHalfFace, false);
assert.equal(admin.seedInsideOwnRunHeadroomMask, true);
assert.equal(admin.removedFullyAccountedByOwnRunTreads, true);
assert.equal(admin.sourceTreadInventoryUnchanged, false);
assert.deepEqual(admin.currentFaces, []);
assert.equal(admin.doorways[0].sourceIncidentEdges.length, 1);
assert.equal(admin.doorways[0].sourceIncidentEdges[0].kind, "door");
assert.equal(admin.doorways[0].onNamedSlab, true);
assert.deepEqual(admin.doorways[0].exactFaces[0].cells, [
  "native-cell:14.435696:623",
]);
assert.equal(
  hash(await readFile(originalPath)),
  hash(originalBytes),
  "Original input changed during replay",
);
assert.equal(
  hash(await readFile(preparedPath)),
  hash(preparedBytes),
  "Prepared input changed during replay",
);
const report = {
  mathematicalDiagnosticOnly: true,
  physicalApproval: false,
  masterAccepted: false,
  standingBandFeet: [0.05, 6],
  inputs: {
    originalSha256: hash(originalBytes),
    preparedSha256: hash(preparedBytes),
    node: process.version,
  },
  rows,
};
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", {
  flag: "wx",
});
console.log(
  JSON.stringify({
    assertions: "passed",
    outputPath,
    physicalApproval: false,
    rows,
  }),
);
