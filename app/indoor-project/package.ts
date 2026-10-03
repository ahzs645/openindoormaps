import { validatePreparedRouting } from "./prepared-routing";
import { throughNavigationGeometryKey } from "./through-navigation";
import { validateSharedStairBinding } from "./stair-display";
import {
  unzip,
  unzipSync,
  zip,
  strFromU8,
  strToU8,
  type Unzipped,
  type AsyncZippable,
} from "fflate";
import type { IndoorDataset } from "./contract";
import { validateIndoorDataset } from "./routing";
import {
  validateVisitorMetadata,
  type VisitorPlace,
  type VisitorMetadata,
} from "./visitor-metadata";
import { validateSourceConnectorReview } from "./connector-review";
import { validateConnectorBinding } from "./connector-binding";
import { validateMapEdits, type MapEdits } from "./map-edits";
import { validateReviewPins, type ReviewPins } from "./review-pins";
import type { CampusStoreyReview } from "./campus-floors";

type Entry = { path: string; bytes: number; sha256: string };
type ArchiveManifest = {
  format: "reviter-project";
  version: 2;
  createdAt: string;
  model: Entry & { fileName: string; lastModified: number };
  floors: Entry;
  georeference: Entry;
  indoor: Entry;
  scene?: Entry;
};
/** Viewer assets are derived from a master; model identity is retained without model bytes. */
type ViewerManifest = {
  format: "openindoormaps-viewer";
  version: 1;
  createdAt: string;
  model: { fileName: string; sha256: string };
  sourceRoomsSha256: string;
  views: ["2d", "3d"];
  floors: Entry;
  georeference: Entry;
  indoor: Entry;
};
type Manifest = ArchiveManifest | ViewerManifest;
export const isViewerProject = (project: IndoorProject) =>
  project.manifest.format === "openindoormaps-viewer";
export type ProjectRooms = {
  format: string;
  version: number;
  model: { fileName: string };
  annotations: {
    key: string;
    name?: string;
    walkability?: string;
    access?: unknown;
    routePointFeet?: [number, number];
    [key: string]: unknown;
  }[];
  georeference: unknown;
  visitorMetadata?: VisitorMetadata;
  mapEdits?: MapEdits;
  reviewPins?: ReviewPins;
  campusStoreys?: CampusStoreyReview[];
  indoorReviews?: {
    version: 1;
    records: Record<
      string,
      {
        name?: string;
        notes?: string;
        access?: "public" | "staff" | "unknown";
        walkable?: boolean;
        throughNavigation?: boolean;
        throughNavigationGeometryKey?: string;
      }
    >;
    edges: Record<
      string,
      {
        enabled?: boolean;
        geometryKey?: string;
        accessible?: "yes" | "no" | "unknown";
        notes?: string;
      }
    >;
  };
  [key: string]: unknown;
};
export type IndoorProject = {
  manifest: Manifest;
  files: Unzipped;
  rooms: ProjectRooms;
  dataset: IndoorDataset;
  scene?: Uint8Array;
};
const MB = 1024 * 1024,
  MAX = 900 * MB,
  limits: Record<string, number> = {
    "manifest.json": 65_536,
    "floors/rooms.json": 64 * MB,
    "gis/reference-points.json": MB,
    "viewer/indoor.json": 128 * MB,
    "viewer/metadata.json": 16 * MB,
    "model/scene.glb": 256 * MB,
  };
// Reject control characters in archive paths before accepting model entries.
const modelPath = (p: string) =>
  // eslint-disable-next-line no-control-regex
  /^model\/[^/\\\u0000-\u001F]+\.(rvt|rfa|rte|rft)$/i.test(p);
const limit = (p: string) => (modelPath(p) ? 512 * MB : limits[p]);
const hash = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new Uint8Array(bytes).buffer as ArrayBuffer,
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export async function readIndoorProject(
  bytes: Uint8Array,
): Promise<IndoorProject> {
  if (bytes.length === 0 || bytes.length > MAX)
    throw new Error("Project ZIP exceeds the 900 MB limit.");
  const seen = new Set<string>();
  let size = 0;
  unzipSync(bytes, {
    filter: (e) => {
      const cap = limit(e.name);
      if (
        !cap ||
        seen.has(e.name) ||
        e.originalSize > cap ||
        !Number.isSafeInteger(e.originalSize)
      )
        throw new Error("Unexpected, duplicate or oversized ZIP entry.");
      seen.add(e.name);
      size += e.originalSize;
      if (size > MAX) throw new Error("Expanded ZIP exceeds the limit.");
      return false;
    },
  });
  const files = await new Promise<Unzipped>((resolve, reject) =>
    unzip(bytes, (err, f) => (err ? reject(err) : resolve(f))),
  );
  if (!files["manifest.json"]) throw new Error("Missing Reviter manifest.");
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as Manifest;
  if (manifest.format === "openindoormaps-viewer")
    return readViewerFiles(manifest, files);
  if (
    manifest.format === "reviter-project" &&
    (manifest as { version: number }).version === 1
  )
    throw new Error(
      "This is an archive-only project. Open it in Reviter and choose Prepare OpenIndoorMaps project, or run indoor:prepare.",
    );
  if (
    manifest.format !== "reviter-project" ||
    manifest.version !== 2 ||
    !manifest.model ||
    !manifest.floors ||
    !manifest.georeference ||
    !manifest.indoor ||
    !modelPath(manifest.model.path) ||
    manifest.model.path !== `model/${manifest.model.fileName}`
  )
    throw new Error("Choose a prepared version 2 Reviter project.");
  const entries = [
      manifest.model,
      manifest.floors,
      manifest.georeference,
      manifest.indoor,
      ...(manifest.scene ? [manifest.scene] : []),
    ],
    paths = [
      manifest.model.path,
      "floors/rooms.json",
      "gis/reference-points.json",
      "viewer/indoor.json",
      ...(manifest.scene ? ["model/scene.glb"] : []),
    ];
  if (
    Object.keys(files).some((p) => p !== "manifest.json" && !paths.includes(p))
  )
    throw new Error("Unlisted project entry.");
  for (const [i, e] of entries.entries()) {
    const b = files[paths[i]];
    if (
      e.path !== paths[i] ||
      !b ||
      b.length !== e.bytes ||
      !/^[a-f0-9]{64}$/.test(e.sha256) ||
      (await hash(b)) !== e.sha256
    )
      throw new Error(`Damaged project entry: ${paths[i]}`);
  }
  const rooms = JSON.parse(
      strFromU8(files["floors/rooms.json"]),
    ) as ProjectRooms,
    dataset: unknown = JSON.parse(strFromU8(files["viewer/indoor.json"]));
  validateIndoorDataset(dataset);
  validatePreparedRouting(dataset);
  if (rooms.reviewPins !== undefined)
    validateReviewPins(rooms.reviewPins, dataset);
  if (rooms.mapEdits !== undefined) validateMapEdits(rooms.mapEdits, dataset);
  if (rooms.indoorConnectors !== undefined)
    validateSourceConnectorReview(
      rooms.indoorConnectors,
      dataset.source.modelSha256,
    );
  validateSharedStairBinding(dataset, rooms.annotations);
  validateConnectorBinding(
    dataset,
    rooms.indoorConnectors,
    rooms.indoorReviews,
  );
  if (
    dataset.source.modelSha256 !== manifest.model.sha256 ||
    dataset.source.roomsSha256 !== manifest.floors.sha256 ||
    dataset.source.modelFileName !== manifest.model.fileName ||
    rooms.format !== "reviter-room-annotations" ||
    rooms.version !== 1 ||
    !Array.isArray(rooms.annotations) ||
    JSON.stringify(rooms.visitorMetadata) !== JSON.stringify(dataset.visitor) ||
    JSON.stringify(rooms.georeference) !==
      JSON.stringify(JSON.parse(strFromU8(files["gis/reference-points.json"])))
  )
    throw new Error(
      "Model, reviews and prepared graph do not share the same source identity.",
    );
  const scene = files["model/scene.glb"];
  if (scene) {
    const header = new DataView(
      scene.buffer,
      scene.byteOffset,
      scene.byteLength,
    );
    if (
      scene.length < 20 ||
      header.getUint32(0, true) !== 0x46_54_6c_67 ||
      header.getUint32(4, true) !== 2 ||
      header.getUint32(8, true) !== scene.length ||
      header.getUint32(16, true) !== 0x4e_4f_53_4a ||
      header.getUint32(12, true) > 16 * MB ||
      header.getUint32(12, true) > scene.length - 20
    )
      throw new Error("Invalid prepared GLB scene.");
    const document = JSON.parse(
      strFromU8(scene.subarray(20, 20 + header.getUint32(12, true))),
    ) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
    if (
      document.buffers?.some((b) => b.uri != null) ||
      document.images?.some((i) => i.uri != null)
    )
      throw new Error(
        "Prepared GLB must embed every resource; external model resources are unsupported.",
      );
  }
  return { manifest, rooms, dataset, files, scene };
}
export async function exportIndoorProject(
  project: IndoorProject,
): Promise<Uint8Array> {
  if (isViewerProject(project))
    throw new Error(
      "A campus viewer package cannot regenerate a source project. Use the full reviewed master ZIP.",
    );
  if (project.rooms.reviewPins !== undefined)
    validateReviewPins(project.rooms.reviewPins, project.dataset);
  if (project.rooms.mapEdits !== undefined)
    validateMapEdits(project.rooms.mapEdits, project.dataset);
  const rooms = strToU8(JSON.stringify(project.rooms)),
    manifest = structuredClone(project.manifest) as ArchiveManifest,
    dataset = structuredClone(project.dataset),
    files: AsyncZippable = {};
  manifest.createdAt = new Date().toISOString();
  manifest.floors = {
    path: "floors/rooms.json",
    bytes: rooms.length,
    sha256: await hash(rooms),
  };
  dataset.source.roomsSha256 = manifest.floors.sha256;
  const indoor = strToU8(JSON.stringify(dataset));
  manifest.indoor = {
    path: "viewer/indoor.json",
    bytes: indoor.length,
    sha256: await hash(indoor),
  };
  for (const [name, bytes] of Object.entries(project.files))
    if (name !== "manifest.json")
      files[name] = [bytes, { level: modelPath(name) ? 0 : 6 }];
  files["floors/rooms.json"] = rooms;
  files["viewer/indoor.json"] = indoor;
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return new Promise((resolve, reject) =>
    zip(files, { level: 6 }, (err, bytes) =>
      err ? reject(err) : resolve(bytes),
    ),
  );
}

/** Replace only derived routing data; retain the exact authoring/source bytes. */
export async function exportPreparedRoutingProject(
  project: IndoorProject,
  dataset: IndoorDataset,
): Promise<Uint8Array> {
  const sourceOnly = (value: IndoorDataset) => {
    const copy = { ...value } as IndoorDataset & { preparedRouting?: unknown };
    delete copy.preparedRouting;
    return JSON.stringify(copy);
  };
  if (sourceOnly(dataset) !== sourceOnly(project.dataset))
    throw new Error(
      "Routing preparation cannot modify source data or reviews.",
    );
  validatePreparedRouting(dataset);
  const indoor = strToU8(JSON.stringify(dataset));
  if (indoor.length > limits["viewer/indoor.json"])
    throw new Error("Prepared indoor dataset exceeds the package size limit.");
  const manifest = structuredClone(project.manifest);
  manifest.indoor = {
    path: "viewer/indoor.json",
    bytes: indoor.length,
    sha256: await hash(indoor),
  };
  const files: AsyncZippable = {};
  for (const [name, bytes] of Object.entries(project.files))
    files[name] = [bytes, { level: modelPath(name) ? 0 : 6 }];
  files["viewer/indoor.json"] = indoor;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  return new Promise((resolve, reject) =>
    zip(files, { level: 6 }, (err, bytes) =>
      err ? reject(err) : resolve(bytes),
    ),
  );
}

async function readViewerFiles(
  manifest: ViewerManifest,
  files: Unzipped,
): Promise<IndoorProject> {
  const paths = [
    "viewer/metadata.json",
    "gis/reference-points.json",
    "viewer/indoor.json",
  ];
  if (
    manifest.version !== 1 ||
    JSON.stringify(manifest.views) !== JSON.stringify(["2d", "3d"]) ||
    !manifest.model ||
    typeof manifest.model.fileName !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.model.sha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.sourceRoomsSha256) ||
    Object.keys(files).some((p) => p !== "manifest.json" && !paths.includes(p))
  )
    throw new Error(
      "Invalid campus viewer manifest or unexpected source assets.",
    );
  for (const [i, entry] of [
    manifest.floors,
    manifest.georeference,
    manifest.indoor,
  ].entries()) {
    const bytes = files[paths[i]];
    if (
      !entry ||
      entry.path !== paths[i] ||
      !bytes ||
      bytes.length !== entry.bytes ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      (await hash(bytes)) !== entry.sha256
    )
      throw new Error(`Damaged viewer entry: ${paths[i]}`);
  }
  const dataset: unknown = JSON.parse(strFromU8(files["viewer/indoor.json"]));
  validateIndoorDataset(dataset);
  validatePreparedRouting(dataset);
  const rooms = JSON.parse(
    strFromU8(files["viewer/metadata.json"]),
  ) as ProjectRooms;
  if (
    !rooms ||
    rooms.format !== "openindoormaps-viewer-metadata" ||
    rooms.version !== 1 ||
    rooms.model?.fileName !== manifest.model.fileName ||
    !Array.isArray(rooms.annotations) ||
    dataset.source.modelSha256 !== manifest.model.sha256 ||
    dataset.source.modelFileName !== manifest.model.fileName ||
    dataset.source.roomsSha256 !== manifest.sourceRoomsSha256 ||
    JSON.stringify(rooms.visitorMetadata) !== JSON.stringify(dataset.visitor) ||
    JSON.stringify(rooms.georeference) !==
      JSON.stringify(JSON.parse(strFromU8(files["gis/reference-points.json"])))
  )
    throw new Error(
      "Viewer geometry, metadata and source identity do not match.",
    );
  validateSharedStairBinding(dataset, rooms.annotations);
  if (rooms.mapEdits !== undefined) validateMapEdits(rooms.mapEdits, dataset);
  if (rooms.indoorConnectors !== undefined)
    validateSourceConnectorReview(
      rooms.indoorConnectors,
      dataset.source.modelSha256,
    );
  validateConnectorBinding(
    dataset,
    rooms.indoorConnectors,
    rooms.indoorReviews,
  );
  return { manifest, rooms, dataset, files };
}

/** Lossless display/routing data with only the metadata required by the visitor.
 * Source room geometry and safety bindings are preserved, never regenerated or rounded. */
export async function exportCampusViewer(
  project: IndoorProject,
): Promise<Uint8Array> {
  validateIndoorDataset(project.dataset);
  validateSharedStairBinding(project.dataset, project.rooms.annotations);
  if (project.rooms.mapEdits !== undefined)
    validateMapEdits(project.rooms.mapEdits, project.dataset);
  if (project.rooms.indoorConnectors !== undefined)
    validateSourceConnectorReview(
      project.rooms.indoorConnectors,
      project.dataset.source.modelSha256,
    );
  validateConnectorBinding(
    project.dataset,
    project.rooms.indoorConnectors,
    project.rooms.indoorReviews,
  );
  const metadata: ProjectRooms = {
    format: "openindoormaps-viewer-metadata",
    version: 1,
    model: { fileName: project.dataset.source.modelFileName },
    annotations: project.rooms.annotations
      .filter((a) => Array.isArray(a.stairDisplayOnlyFlightIds))
      .map((a) => ({
        key: a.key,
        stairDisplayOnlyFlightIds: a.stairDisplayOnlyFlightIds,
      })),
    georeference: project.rooms.georeference,
    visitorMetadata: project.dataset.visitor,
    mapEdits: project.rooms.mapEdits,
    campusStoreys: project.rooms.campusStoreys,
    indoorConnectors: project.rooms.indoorConnectors,
    // Accessibility overrides are bound to exact geometry. The dataset already
    // carries room access; authoring notes and review pins are not visitor assets.
    indoorReviews: project.rooms.indoorReviews
      ? {
          version: 1,
          records: {},
          edges: Object.fromEntries(
            Object.entries(project.rooms.indoorReviews.edges).map(([id, e]) => [
              id,
              {
                enabled: e.enabled,
                geometryKey: e.geometryKey,
                accessible: e.accessible,
              },
            ]),
          ),
        }
      : undefined,
  };
  const files: AsyncZippable = {
    "viewer/metadata.json": strToU8(JSON.stringify(metadata)),
    "gis/reference-points.json": strToU8(JSON.stringify(metadata.georeference)),
    "viewer/indoor.json": strToU8(JSON.stringify(project.dataset)),
  };
  const entry = async (path: string): Promise<Entry> => {
    const bytes = files[path] as Uint8Array;
    return { path, bytes: bytes.length, sha256: await hash(bytes) };
  };
  const manifest: ViewerManifest = {
    format: "openindoormaps-viewer",
    version: 1,
    createdAt: new Date().toISOString(),
    model: {
      fileName: project.dataset.source.modelFileName,
      sha256: project.dataset.source.modelSha256,
    },
    sourceRoomsSha256: project.dataset.source.roomsSha256,
    views: ["2d", "3d"],
    floors: await entry("viewer/metadata.json"),
    georeference: await entry("gis/reference-points.json"),
    indoor: await entry("viewer/indoor.json"),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  return new Promise((resolve, reject) =>
    zip(files, { level: 6 }, (error, bytes) =>
      error ? reject(error) : resolve(bytes),
    ),
  );
}
export function reviewArea(
  project: IndoorProject,
  key: string,
  patch: {
    name?: string;
    notes?: string;
    access?: "public" | "staff" | "unknown";
    walkable?: boolean;
    throughNavigation?: boolean;
  },
): IndoorProject {
  const next = {
    ...project,
    rooms: structuredClone(project.rooms),
    dataset: structuredClone(project.dataset),
  };
  const record = next.dataset.records.find((r) => r.key === key);
  if (!record) throw new Error("Unknown area.");
  if (patch.walkable === true && !record.walkable)
    throw new Error(
      "Restoring a blocked area needs a geometry rebuild in Reviter.",
    );
  if (
    patch.throughNavigation === true &&
    (!(patch.walkable ?? record.walkable) ||
      (patch.access ?? record.access) === "staff" ||
      !patch.notes?.trim())
  )
    throw new Error(
      "A through-navigation review needs a walkable, non-staff area and a note describing the confirmed passage.",
    );
  const { throughNavigation, ...recordPatch } = patch;
  Object.assign(record, recordPatch);
  if (throughNavigation === true)
    record.properties.throughNavigationReview = {
      geometryKey: throughNavigationGeometryKey(
        next.dataset.source.modelSha256,
        record,
      ),
      notes: patch.notes!.trim(),
    };
  else if (throughNavigation === false)
    delete record.properties.throughNavigationReview;
  if (patch.walkable === false && next.dataset.stairDisplay)
    next.dataset.stairDisplay.flights =
      next.dataset.stairDisplay.flights.filter(
        (flight) => flight.roomKey !== key,
      );
  if (patch.walkable === false && next.dataset.presentation) {
    const prepared = next.dataset.presentation;
    prepared.rooms = prepared.rooms.filter((room) => room.roomKey !== key);
    prepared.diagnostics = prepared.diagnostics.filter(
      (item) => item.roomKey !== key,
    );
    prepared.diagnostics.push({
      roomKey: key,
      levelId: record.levelId,
      code: "disabled-room-presentation",
      message: "Room display block removed after walkability review.",
    });
  }
  const source = next.rooms.annotations.find((r) => r.key === key);
  if (source) {
    if (patch.access)
      source.access =
        patch.access === "unknown"
          ? undefined
          : {
              kind: patch.access,
              evidence: "user-reported",
              notes: patch.notes,
            };
    if (patch.walkable != null)
      source.walkability = patch.walkable ? "walkable" : "void";
  }
  const reviews = next.rooms.indoorReviews ?? {
    version: 1,
    records: {},
    edges: {},
  };
  reviews.records[key] = { ...reviews.records[key], ...patch };
  if (throughNavigation != null)
    reviews.records[key].throughNavigationGeometryKey = throughNavigation
      ? throughNavigationGeometryKey(next.dataset.source.modelSha256, record)
      : undefined;
  next.rooms.indoorReviews = reviews;
  return next;
}
export function reviewEdge(
  project: IndoorProject,
  id: string,
  patch: {
    enabled?: boolean;
    accessible?: "yes" | "no" | "unknown";
    notes?: string;
  },
): IndoorProject {
  const next = {
    ...project,
    rooms: structuredClone(project.rooms),
    dataset: structuredClone(project.dataset),
  };
  const edge = next.dataset.edges.find((e) => e.id === id);
  if (!edge) throw new Error("Unknown connection.");
  if (
    patch.accessible === "yes" &&
    (edge.kind === "stairs" ||
      edge.kind === "local-steps" ||
      edge.kind === "escalator")
  )
    throw new Error(
      "Steps cannot be marked step-free. Add a verified ramp or elevator in Reviter.",
    );
  Object.assign(edge, patch);
  const reviews = next.rooms.indoorReviews ?? {
    version: 1,
    records: {},
    edges: {},
  };
  reviews.edges[id] = {
    ...reviews.edges[id],
    ...patch,
    geometryKey: JSON.stringify([
      project.dataset.source.modelSha256,
      edge.from,
      edge.to,
      edge.roomKeys,
      edge.pointsFeet,
    ]),
  };
  next.rooms.indoorReviews = reviews;
  return next;
}
/** Visitor editing is independent of geometry/access reviews and survives regeneration. */
export function reviewVisitorMetadata(
  project: IndoorProject,
  roomKey: string,
  place: VisitorPlace,
  building: { name: string; shortName?: string } | undefined,
): IndoorProject {
  const room = project.dataset.records.find((r) => r.key === roomKey);
  if (!room) throw new Error("Unknown visitor location.");
  const metadata: VisitorMetadata = structuredClone(
    project.dataset.visitor ?? { version: 1, buildings: {}, places: {} },
  );
  metadata.places[roomKey] = Object.fromEntries(
    Object.entries(place).filter(([, v]) => v != null && v !== ""),
  );
  if (building) metadata.buildings[room.building] = building;
  validateVisitorMetadata(metadata, project.dataset.records);
  const next = {
    ...project,
    dataset: structuredClone(project.dataset),
    rooms: structuredClone(project.rooms),
  };
  next.dataset.visitor = metadata;
  next.rooms.visitorMetadata = structuredClone(metadata);
  return next;
}
export async function persistProject(bytes: Uint8Array): Promise<void> {
  const db = await projectDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(
      new Blob([new Uint8Array(bytes).buffer as ArrayBuffer]),
      "last",
    );
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.addEventListener("abort", () => reject(tx.error));
  });
  db.close();
}
export async function restoreProject(): Promise<Uint8Array | null> {
  const db = await projectDB();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db
      .transaction("projects")
      .objectStore("projects")
      .get("last");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}
function projectDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("openindoormaps-projects", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
