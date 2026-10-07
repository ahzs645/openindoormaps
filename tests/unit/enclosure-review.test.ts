import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import {
  auditVolumeScope,
  volumeScopes,
  type VolumeAudit,
} from "../../app/indoor-project/volume-coverage";
import {
  enclosureItems,
  enclosureProposalItems,
  enclosureEvidenceText,
  currentEnclosureReview,
  saveEnclosureReview,
  validateEnclosureReviews,
} from "../../app/indoor-project/enclosure-review";
import {
  validateEnclosureProposals,
  saveEnclosureProposals,
  proposalIsCurrent,
  type EnclosureProposals,
} from "../../app/indoor-project/enclosure-proposals";
const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
function fixture(): IndoorDataset {
  return {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: {
      modelFileName: "review.rvt",
      modelSha256: "a".repeat(64),
      roomsSha256: "b".repeat(64),
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [{ id: "first", name: "Floor 1", levelIds: [1], elevationFeet: 0 }],
    nativeLevels: [{ id: 1, name: "Floor 1", elevationFeet: 0 }],
    presentation: {
      version: 1,
      generator: "reviter/native-room-presentation-2",
      sourceModelSha256: "a".repeat(64),
      junctionToleranceFeet: 0.04,
      rooms: [],
      diagnostics: [
        {
          roomKey: "0",
          levelId: 1,
          code: "no-native-enclosure",
          message: "Native walls do not enclose this room.",
        },
      ],
    },
    records: ["Office", "Corridor", "Staff", "Stair", "Void"].map(
      (name, i) => ({
        key: String(i),
        number: `01-${i}`,
        name,
        building: "01",
        levelId: 1,
        elevationFeet: 0,
        elevationEvidence: "Native floor",
        surfaceId: "first",
        circulation: name === "Corridor",
        stair: name === "Stair",
        access: name === "Staff" ? "staff" : "unknown",
        walkable: name !== "Void",
        confidence: 1,
        properties: {},
        ringsFeet: [
          [
            [i * 20, 0],
            [i * 20 + 10, 0],
            [i * 20 + 10, 10],
            [i * 20, 10],
          ],
        ],
      }),
    ),
    nodes: [],
    edges: [],
    walls: [],
    issues: [],
    report: {
      recordCount: 5,
      routableArrivals: 0,
      components: 0,
      largestComponentArrivals: 0,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
}
function audit(data: IndoorDataset): VolumeAudit {
  return {
    format: "openindoormaps-volume-coverage-audit",
    version: 1,
    source: data.source,
    datasetSha256: hash(JSON.stringify(data)),
    reviewEvidenceSha256: hash(enclosureEvidenceText(data)),
    views: volumeScopes(data).map((scope) => auditVolumeScope(data, scope)),
  };
}
async function project() {
  const data = fixture(),
    model = strToU8("model bytes must survive review"),
    rooms = {
      format: "reviter-room-annotations",
      version: 1,
      model: { fileName: "review.rvt" },
      annotations: data.records.map((r) => ({ key: r.key, name: r.name })),
      georeference: { points: [] },
    };
  const floorBytes = strToU8(JSON.stringify(rooms)),
    gis = strToU8(JSON.stringify(rooms.georeference));
  data.source.modelSha256 = hash(model);
  data.presentation!.sourceModelSha256 = data.source.modelSha256;
  data.source.roomsSha256 = hash(floorBytes);
  const indoor = strToU8(JSON.stringify(data));
  const entry = (path: string, bytes: Uint8Array) => ({
    path,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
  const manifest = {
    format: "reviter-project",
    version: 2,
    createdAt: "2026-10-03",
    model: {
      ...entry("model/review.rvt", model),
      fileName: "review.rvt",
      lastModified: 1,
    },
    floors: entry("floors/rooms.json", floorBytes),
    georeference: entry("gis/reference-points.json", gis),
    indoor: entry("viewer/indoor.json", indoor),
  };
  return readIndoorProject(
    zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "model/review.rvt": model,
      "floors/rooms.json": floorBytes,
      "gis/reference-points.json": gis,
      "viewer/indoor.json": indoor,
    }),
  );
}
test("actual geometry audit flags unsupported rooms, excludes intentional flat areas, and does not mutate the dataset", () => {
  const data = fixture(),
    before = JSON.stringify(data),
    report = audit(data),
    items = enclosureItems(report);
  assert.equal(
    items.length,
    5,
    "campus/native scopes must not double count rooms",
  );
  assert.equal(items[0].status, "unsupported-room-enclosure");
  assert.equal(
    items.find((i) => i.name === "Staff")?.intentionalReason,
    "restricted-flat-area",
  );
  assert.equal(
    items.find((i) => i.name === "Stair")?.intentionalReason,
    "native-stair-display",
  );
  assert.equal(items.filter((i) => i.status === "intentional-flat").length, 4);
  assert.equal(JSON.stringify(data), before);
});
test("a discrepancy in any scope remains in the evidence queue", () => {
  const report = audit(fixture());
  report.views[1].records[0].status = "mode-discrepancy";
  assert.equal(enclosureItems(report)[0].status, "mode-discrepancy");
  assert.equal(enclosureItems(report)[0].scopes.length, 2);
});
test("proposal browsing includes flat and raised places once, without admitting retired identities", () => {
  const report = audit(fixture());
  for (const view of report.views)
    view.records.find((record) => record.key === "0")!.status = "block-present";
  const items = enclosureItems(report);
  const proposed = enclosureProposalItems(
    items,
    new Set(["0", "3", "retired-room"]),
  );
  assert.deepEqual(
    proposed.map((item) => item.key),
    ["0", "3"],
  );
  assert.equal(proposed[0].status, "block-present");
  assert.equal(proposed[1].status, "intentional-flat");
  assert.equal(proposed[1].scopes.length, 2);
  assert.deepEqual(enclosureProposalItems(items, new Set()), []);
  assert.equal(
    items.length,
    5,
    "browsing proposals cannot alter the audit queue",
  );
});
test("review decisions preserve source geometry, access, graph and native assets", async () => {
  const original = await project(),
    report = audit(original.dataset);
  const next = saveEnclosureReview(
    original,
    report,
    "0",
    "reviewed",
    "Native wall face needs confirmation.",
  );
  assert.equal(next.dataset, original.dataset);
  assert.equal(next.files, original.files);
  assert.deepEqual(next.rooms.annotations, original.rooms.annotations);
  assert.equal(original.rooms.enclosureReviews, undefined);
  assert.equal(
    enclosureItems(report)[0].status,
    "unsupported-room-enclosure",
    "marking reviewed cannot repair a block",
  );
});
test("authoring notes survive ZIP roundtrip without being marked stale by their own source hash", async () => {
  const original = await project(),
    report = audit(original.dataset);
  const edited = saveEnclosureReview(
    original,
    report,
    "0",
    "needs-correction",
    "Inspect door aperture.",
  );
  const reopened = await readIndoorProject(await exportIndoorProject(edited));
  assert.notEqual(
    reopened.dataset.source.roomsSha256,
    original.dataset.source.roomsSha256,
  );
  assert.equal(
    currentEnclosureReview(reopened, audit(reopened.dataset), "0")?.notes,
    "Inspect door aperture.",
  );
  assert.deepEqual(
    reopened.files["model/review.rvt"],
    original.files["model/review.rvt"],
  );
  const viewer = await readIndoorProject(await exportCampusViewer(reopened));
  assert.equal(
    viewer.rooms.enclosureReviews,
    undefined,
    "authoring notes do not leak into visitor assets",
  );
});
test("changed geometry invalidates a previous decision while preserving its notes", async () => {
  const original = await project(),
    report = audit(original.dataset);
  const edited = saveEnclosureReview(
    original,
    report,
    "0",
    "reviewed",
    "Earlier geometry review.",
  );
  edited.dataset = structuredClone(edited.dataset);
  edited.dataset.records[0].ringsFeet[0][0][0] = 1;
  assert.equal(
    currentEnclosureReview(edited, audit(edited.dataset), "0"),
    undefined,
  );
  assert.equal(
    edited.rooms.enclosureReviews?.records["0"].notes,
    "Earlier geometry review.",
  );
});
test("malformed review metadata is rejected", () => {
  assert.throws(
    () =>
      validateEnclosureReviews({
        version: 1,
        records: { x: { evidenceSha256: "bad", decision: "fixed", notes: "" } },
      }),
    /invalid/,
  );
});

test("proposals roundtrip as authoring metadata without changing audited geometry or visitor assets", async () => {
  const original = await project(),
    report = audit(original.dataset);
  const proposals: EnclosureProposals = {
    format: "openindoormaps-enclosure-proposals",
    version: 1,
    title: "Measured review",
    modelSha256: original.dataset.source.modelSha256,
    evidenceSha256: report.reviewEvidenceSha256,
    records: [
      {
        key: "0",
        cause: "Unfinished native return",
        solution: "Verify the native join before extending the wall.",
        confidence: "medium",
        prerequisites: ["Preserve door threshold and native slab void."],
        relatedKeys: ["1"],
      },
    ],
  };
  const edited = saveEnclosureProposals(original, proposals);
  assert.equal(edited.dataset, original.dataset);
  assert.equal(edited.files, original.files);
  const reopened = await readIndoorProject(await exportIndoorProject(edited));
  assert.deepEqual(reopened.rooms.enclosureProposals, proposals);
  assert.ok(
    proposalIsCurrent(proposals, audit(reopened.dataset)),
    "notes-only ZIP export must not stale proposals",
  );
  reopened.dataset.records[0].ringsFeet[0][0][0] += 1;
  assert.equal(proposalIsCurrent(proposals, audit(reopened.dataset)), false);
  const viewer = await readIndoorProject(await exportCampusViewer(edited));
  assert.equal(viewer.rooms.enclosureProposals, undefined);
  assert.deepEqual(
    reopened.files["model/review.rvt"],
    original.files["model/review.rvt"],
  );
  assert.throws(
    () =>
      saveEnclosureProposals(original, {
        ...proposals,
        modelSha256: "0".repeat(64),
      }),
    /another source model/,
  );
  assert.throws(
    () =>
      saveEnclosureProposals(original, {
        ...proposals,
        records: [{ ...proposals.records[0], key: "missing" }],
      }),
    /missing/,
  );
  assert.throws(
    () =>
      validateEnclosureProposals({
        ...proposals,
        records: [proposals.records[0], proposals.records[0]],
      }),
    /Invalid/,
  );
});
