import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { gzipSync } from "fflate";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import type { IndoorDataset } from "./contract";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import {
  decodePreparedDisplayAsset,
  validatePreparedDisplayAssetDescriptor,
  type PreparedDisplayAssetBinding,
  type PreparedDisplayAssetDescriptor,
  type PreparedDisplayPayload,
} from "./prepared-display-assets";

export type ProgressiveAsset = {
  id: string;
  kind:
    | "shell"
    | "overview"
    | "prepared-chunk"
    | "routing"
    | "presentation-context";
  logicalSha256: string;
  logicalBytes: number;
  mediaType: "application/json" | "application/octet-stream";
  /** Version 1 uses explicit manifest roots/scope bindings; implicit dependency downloads are prohibited. */
  dependencies: string[];
  representations: {
    encoding: "identity" | "gzip" | "br";
    path: string;
    sha256: string;
    bytes: number;
    /** Transport pieces of one unchanged compressed routing representation.
     * The complete stream still has its original SHA and byte count. */
    parts?: { path: string; sha256: string; bytes: number }[];
  }[];
};
export type ProgressiveScope = {
  id: string;
  label: string;
  levelIds: number[];
  building: string;
  overviewAssetId: string;
  contextAssetId: string;
  display: {
    descriptor: PreparedDisplayAssetDescriptor;
    chunkAssetIds: string[];
  };
};
export type ProgressiveManifest = {
  version: 1;
  format: "openindoormaps-progressive-v1";
  revisionSha256: string;
  provenance: {
    packageSha256: string;
    authoringPackageSha256?: string;
    datasetSha256: string;
    source: IndoorDataset["source"];
    enginePreparationSha256: string;
    publication: "visitor" | "authoring-derived-candidate";
  };
  shellAssetId: string;
  routeAssetId: string;
  defaultScopeId: string;
  scopes: ProgressiveScope[];
  unavailableScopes: number[][];
  assets: Record<string, ProgressiveAsset>;
};
/** Labels and original arrival coordinates only. This is never route authority. */
export type ProgressiveShell = {
  version: 1;
  format: "openindoormaps-visitor-shell-v1";
  source: IndoorDataset["source"];
  alignment: IndoorDataset["alignment"];
  report: IndoorDataset["report"];
  floors: IndoorDataset["floors"];
  nativeLevels: IndoorDataset["nativeLevels"];
  buildings: string[];
  display: {
    nativeIndoorEnvelopes: boolean;
    nativeMaterialSections: boolean;
    windowMode: "native" | "simplified" | null;
  };
  records: {
    key: string;
    number: string;
    name: string;
    building: string;
    levelId: number;
    elevationFeet: number;
    circulation: boolean;
    stair: boolean;
    access: "public" | "staff" | "unknown";
    walkable: boolean;
    arrivalNodeId?: string;
    geographic?: [number, number];
  }[];
};
/** Existing worker overview composition, including physical window/wall paint
 * and prepared apertures. These drawings confer no walking permission. */
export type ProgressiveOverview = {
  version: 1;
  format: "openindoormaps-visitor-overview-v1";
  binding: PreparedDisplayAssetBinding;
  geometry: FeatureCollection;
  floor: FeatureCollection<MultiPolygon>;
  ground: FeatureCollection<MultiPolygon>;
  labels: FeatureCollection;
};
export type ProgressivePresentationContext = {
  version: 1;
  format: "openindoormaps-visitor-presentation-context-v1";
  binding: PreparedDisplayAssetBinding;
  connectorMarkers: FeatureCollection<Point>;
  relativeConnectorMarkers: FeatureCollection<Point>;
  visitorLabels: FeatureCollection<Point>;
  extrusionWalls: FeatureCollection<MultiPolygon>;
  rampDisplay?: IndoorDataset["rampDisplay"];
  rampEdges: IndoorDataset["edges"];
  rampNodes: IndoorDataset["nodes"];
  floorDatumFeet: number;
  portals: FeatureCollection<Point>;
  stairSelectionKeys: Record<string, string[]>;
};
export const PROGRESSIVE_LIMITS = Object.freeze({
  manifestBytes: 2 * 1024 * 1024,
  assets: 4096,
  scopes: 32,
  storedAssetBytes: 256 * 1024 * 1024,
  storedPartBytes: 16 * 1024 * 1024,
  representationParts: 64,
  logicalAssetBytes: 256 * 1024 * 1024,
  aggregateLogicalBytes: 2 * 1024 * 1024 * 1024,
});
const hashPattern = /^[a-f0-9]{64}$/;
export const progressiveSha256 = (bytes: Uint8Array) =>
  bytesToHex(sha256(bytes));
const fail = (message: string): never => {
  throw new Error(`Progressive map: ${message}`);
};
const bytes = (n: unknown, maximum: number) =>
  typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= maximum;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function progressiveManifestRevision(
  manifest: Omit<ProgressiveManifest, "revisionSha256"> | ProgressiveManifest,
) {
  const { revisionSha256: _, ...body } = manifest as ProgressiveManifest;
  return progressiveSha256(
    new TextEncoder().encode(JSON.stringify(canonical(body))),
  );
}
export function validateProgressiveManifest(
  value: unknown,
  expectedEngineSha256 = PREPARED_DISPLAY_ENGINE_SHA256,
): asserts value is ProgressiveManifest {
  const m = value as ProgressiveManifest;
  if (
    !m ||
    m.version !== 1 ||
    m.format !== "openindoormaps-progressive-v1" ||
    !hashPattern.test(m.revisionSha256) ||
    !m.provenance ||
    !hashPattern.test(m.provenance.packageSha256) ||
    (m.provenance.authoringPackageSha256 !== undefined &&
      !hashPattern.test(m.provenance.authoringPackageSha256)) ||
    !hashPattern.test(m.provenance.datasetSha256) ||
    !hashPattern.test(m.provenance.enginePreparationSha256) ||
    !hashPattern.test(m.provenance.source?.modelSha256) ||
    !hashPattern.test(m.provenance.source?.roomsSha256) ||
    typeof m.provenance.source.modelFileName !== "string" ||
    !["visitor", "authoring-derived-candidate"].includes(
      m.provenance.publication,
    ) ||
    !m.assets ||
    Array.isArray(m.assets) ||
    typeof m.assets !== "object" ||
    !Array.isArray(m.scopes) ||
    m.scopes.length === 0 ||
    m.scopes.length > PROGRESSIVE_LIMITS.scopes ||
    !Array.isArray(m.unavailableScopes)
  )
    fail("invalid manifest header");
  const entries = Object.entries(m.assets);
  if (entries.length === 0 || entries.length > PROGRESSIVE_LIMITS.assets)
    fail("asset inventory limit");
  let total = 0;
  for (const [id, a] of entries) {
    if (
      !a ||
      a.id !== id ||
      ![
        "shell",
        "overview",
        "prepared-chunk",
        "routing",
        "presentation-context",
      ].includes(a.kind) ||
      !hashPattern.test(a.logicalSha256) ||
      id !== `${a.kind}:${a.logicalSha256}` ||
      !bytes(a.logicalBytes, PROGRESSIVE_LIMITS.logicalAssetBytes) ||
      !["application/json", "application/octet-stream"].includes(a.mediaType) ||
      !Array.isArray(a.dependencies) ||
      a.dependencies.length > 0 ||
      !Array.isArray(a.representations) ||
      a.representations.length < 1 ||
      a.representations.length > 3
    )
      fail("invalid asset descriptor");
    const encodings = new Set<string>();
    for (const r of a.representations) {
      const extension =
        r.encoding === "identity"
          ? a.mediaType === "application/json"
            ? "json"
            : "bin"
          : r.encoding;
      if (
        !r ||
        !["identity", "gzip", "br"].includes(r.encoding) ||
        encodings.has(r.encoding) ||
        !hashPattern.test(r.sha256) ||
        !bytes(r.bytes, PROGRESSIVE_LIMITS.storedAssetBytes) ||
        r.path !==
          `assets/${r.sha256}.${extension === "gzip" ? "gz" : extension}` ||
        (r.encoding === "identity" &&
          (r.sha256 !== a.logicalSha256 || r.bytes !== a.logicalBytes))
      )
        fail("invalid content-addressed representation");
      if (r.parts !== undefined) {
        if (
          a.kind !== "routing" ||
          r.encoding === "identity" ||
          !Array.isArray(r.parts) ||
          r.parts.length < 2 ||
          r.parts.length > PROGRESSIVE_LIMITS.representationParts ||
          r.parts.some(
            (part) =>
              !part ||
              !hashPattern.test(part.sha256) ||
              part.path !== `assets/${part.sha256}.part` ||
              !bytes(part.bytes, PROGRESSIVE_LIMITS.storedPartBytes),
          ) ||
          r.parts.reduce((total, part) => total + part.bytes, 0) !== r.bytes
        )
          fail("invalid compressed routing parts");
      }
      encodings.add(r.encoding);
    }
    if (!encodings.has("gzip")) fail("a gzip representation is required");
    total += a.logicalBytes;
    if (total > PROGRESSIVE_LIMITS.aggregateLogicalBytes)
      fail("aggregate asset limit");
  }
  const roots = new Set<string>();
  const requireAsset = (id: string, kind: ProgressiveAsset["kind"]) => {
    if (!Object.hasOwn(m.assets, id) || m.assets[id].kind !== kind)
      fail("missing or wrong-kind asset");
    roots.add(id);
    return m.assets[id];
  };
  requireAsset(m.shellAssetId, "shell");
  requireAsset(m.routeAssetId, "routing");
  const scopeIds = new Set<string>();
  const bindings = new Set<string>();
  for (const scope of m.scopes) {
    if (
      !scope ||
      typeof scope.id !== "string" ||
      scope.id.length > 256 ||
      scopeIds.has(scope.id) ||
      typeof scope.label !== "string" ||
      scope.label.length > 512 ||
      typeof scope.building !== "string" ||
      !scope.display ||
      !Array.isArray(scope.display.chunkAssetIds)
    )
      fail("invalid scope");
    scopeIds.add(scope.id);
    const d = scope.display.descriptor;
    validatePreparedDisplayAssetDescriptor(d);
    if (
      bindings.has(d.bindingSha256) ||
      d.binding.datasetSha256 !== m.provenance.datasetSha256 ||
      d.binding.enginePreparationSha256 !==
        m.provenance.enginePreparationSha256 ||
      !same(d.binding.levelIds, scope.levelIds) ||
      d.binding.building !== scope.building ||
      d.chunks.length !== scope.display.chunkAssetIds.length
    )
      fail("scope/source/engine binding mismatch");
    bindings.add(d.bindingSha256);
    requireAsset(scope.overviewAssetId, "overview");
    requireAsset(scope.contextAssetId, "presentation-context");
    d.chunks.forEach((c, i) => {
      const a = requireAsset(scope.display.chunkAssetIds[i], "prepared-chunk");
      const gzip = a.representations.find((r) => r.encoding === "gzip")!;
      if (
        a.logicalSha256 !== c.expandedSha256 ||
        a.logicalBytes !== c.expandedBytes ||
        gzip.sha256 !== c.sha256 ||
        gzip.bytes !== c.storedBytes
      )
        fail("prepared chunk binding mismatch");
    });
  }
  if (
    !scopeIds.has(m.defaultScopeId) ||
    m.unavailableScopes.some(
      (s) =>
        !Array.isArray(s) ||
        s.length === 0 ||
        s.some((n) => !Number.isSafeInteger(n)),
    )
  )
    fail("invalid scope inventory");
  const active = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (!Object.hasOwn(m.assets, id)) fail("unlisted dependency");
    if (active.has(id)) fail("dependency cycle");
    if (visited.has(id)) return;
    active.add(id);
    for (const dep of m.assets[id].dependencies) visit(dep);
    active.delete(id);
    visited.add(id);
  };
  for (const id of roots) visit(id);
  if (visited.size !== entries.length) fail("unreachable/unlisted root asset");
  if (m.provenance.enginePreparationSha256 !== expectedEngineSha256)
    fail("unsupported preparation engine");
  if (progressiveManifestRevision(m) !== m.revisionSha256)
    fail("manifest revision mismatch");
}
export function verifyProgressiveAssetBytes(
  asset: ProgressiveAsset,
  value: Uint8Array,
): void {
  if (
    value.length !== asset.logicalBytes ||
    progressiveSha256(value) !== asset.logicalSha256
  )
    fail("logical asset checksum/length mismatch");
}
/** Keep the established pooled graph validator. Reconstruct its deterministic
 * gzip carrier from exact network-decoded pooled bytes; no source dataset or
 * geometric recomputation is needed in the visitor UI. */
export async function decodeProgressiveFloor(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  read: (assetId: string) => Promise<Uint8Array>,
): Promise<PreparedDisplayPayload> {
  const current = manifest.scopes.find((s) => s.id === scope.id);
  if (!current || !same(current, scope))
    fail("floor is outside current manifest");
  const hashes = new Map(
    scope.display.descriptor.chunks.map((c, i) => [
      c.sha256,
      scope.display.chunkAssetIds[i],
    ]),
  );
  return decodePreparedDisplayAsset(
    scope.display.descriptor,
    scope.display.descriptor.binding,
    async (hash) => {
      const id = hashes.get(hash);
      if (!id) return fail("unlisted prepared chunk request");
      const asset = manifest.assets[id],
        logical = await read(id);
      verifyProgressiveAssetBytes(asset, logical);
      const compressed = gzipSync(logical, { level: 6, mtime: 0 });
      if (progressiveSha256(compressed) !== hash)
        fail("prepared carrier checksum mismatch");
      return compressed;
    },
  );
}
