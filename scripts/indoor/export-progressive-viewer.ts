import { overviewConnectorSurfaces } from "./overview-connector-surfaces";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { preparedDisplayEngineBinding } from "./prepared-display-engine-binding";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { gunzipSync, gzipSync, Zip, ZipPassThrough } from "fflate";
import { readProgressiveRoutingParts } from "../../app/indoor-project/progressive-routing-parts";
import {
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { deriveNativeExplore } from "../../app/indoor-project/native-explore";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { floorWorkerPreparationOptions } from "../../app/indoor-project/prepared-floor-cache";
import { prepareOverviewGround } from "../../app/indoor-project/overview-ground";
import { nativeExploreLabels } from "../../app/indoor-project/native-explore-labels";
import {
  projectConnectorMarkers,
  sourceModelConnectorMarkers,
} from "../../app/indoor-project/connector-markers";
import { singleExtrusionWalls } from "../../app/indoor-project/native-wall-level-owner";
import { stableWallGeometry } from "../../app/indoor-project/stable-wall-geometry";
import { floorHeightDatum } from "../../app/indoor-project/relative-heights";
import { nativePhysicalDisplayPlanes } from "../../app/indoor-project/native-display-planes";
import { prepareOverviewFloor } from "../../app/indoor-project/overview-floor";
import { loadPreparedDisplayAsset } from "../../app/indoor-project/prepared-display-loader";
import {
  encodePreparedDisplayAsset,
  preparedDisplayDatasetSha256,
  preparedDisplayBindingSha256,
  type PreparedDisplayPayload,
  type PreparedDisplayAssetDescriptor,
} from "../../app/indoor-project/prepared-display-assets";
import {
  preparedDisplayScopes,
  visitorDisplayDefaultOptions,
} from "../../app/indoor-project/prepared-display-preparation";
import { preparedDisplayOptions } from "../../app/indoor-project/prepared-display-registry";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "../../app/indoor-project/prepared-display-engine-binding";
import {
  progressiveSha256,
  progressiveManifestRevision,
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
  type ProgressiveManifest,
  type ProgressiveAsset,
  type ProgressiveShell,
  type ProgressiveOverview,
  type ProgressivePresentationContext,
  type ProgressiveScope,
  PROGRESSIVE_LIMITS,
} from "../../app/indoor-project/progressive-delivery";

const encoder = new TextEncoder();
const jsonBytes = (value: unknown) => encoder.encode(JSON.stringify(value));
/** A precompressed representation is an explicit file. Static hosts need no
 * Content-Encoding configuration; the browser verifies and decodes its bytes. */
export function progressiveRepresentations(
  raw: Uint8Array,
  mediaType: ProgressiveAsset["mediaType"],
  includeIdentity = false,
  includeBrotli = true,
) {
  return [
    ...(includeIdentity
      ? [
          {
            encoding: "identity" as const,
            bytes: raw,
            extension: mediaType === "application/json" ? "json" : "bin",
          },
        ]
      : []),
    {
      encoding: "gzip" as const,
      bytes: gzipSync(raw, { level: 6, mtime: 0 }),
      extension: "gz",
    },
    ...(includeBrotli
      ? [
          {
            encoding: "br" as const,
            bytes: new Uint8Array(
              brotliCompressSync(raw, {
                params: {
                  [constants.BROTLI_PARAM_QUALITY]: 5,
                  [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
                },
              }),
            ),
            extension: "br",
          },
        ]
      : []),
  ];
}

/** Transport-only subdivision preserves the complete compressed stream. */
export async function writeProgressiveRepresentation(
  directory: string,
  kind: ProgressiveAsset["kind"],
  representation: ReturnType<typeof progressiveRepresentations>[number],
): Promise<ProgressiveAsset["representations"][number]> {
  const sha256 = progressiveSha256(representation.bytes),
    file = `assets/${sha256}.${representation.extension}`;
  const store = async (name: string, bytes: Uint8Array) => {
    await writeFile(path.join(directory, name), bytes, { flag: "wx" }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      },
    );
  };
  const result: ProgressiveAsset["representations"][number] = {
    encoding: representation.encoding,
    path: file,
    sha256,
    bytes: representation.bytes.length,
  };
  if (
    kind === "routing" &&
    representation.encoding !== "identity" &&
    representation.bytes.length > PROGRESSIVE_LIMITS.storedPartBytes
  ) {
    result.parts = [];
    for (
      let offset = 0;
      offset < representation.bytes.length;
      offset += PROGRESSIVE_LIMITS.storedPartBytes
    ) {
      const bytes = representation.bytes.subarray(
          offset,
          offset + PROGRESSIVE_LIMITS.storedPartBytes,
        ),
        sha256 = progressiveSha256(bytes),
        file = `assets/${sha256}.part`;
      await store(file, bytes);
      result.parts.push({ path: file, sha256, bytes: bytes.length });
    }
  } else await store(file, representation.bytes);
  return result;
}
/** Source-exact display carriers used outside the pooled prepared floor. */
export function progressiveRampContext(
  data: IndoorDataset,
  levelIds: number[],
): Pick<
  ProgressivePresentationContext,
  "floorDatumFeet" | "rampDisplay" | "rampEdges" | "rampNodes"
> {
  const ramps = data.rampDisplay?.ramps.filter((ramp) =>
    ramp.levelIds.some((id) => levelIds.includes(id)),
  );
  const rampEdges = data.edges.filter((edge) =>
    ramps?.some((ramp) => ramp.edgeId === edge.id),
  );
  const nodeIds = new Set(rampEdges.flatMap((edge) => [edge.from, edge.to]));
  return {
    floorDatumFeet: floorHeightDatum(data, levelIds),
    rampDisplay: data.rampDisplay && { ...data.rampDisplay, ramps: ramps! },
    rampEdges,
    rampNodes: data.nodes.filter((node) => nodeIds.has(node.id)),
  };
}
/** Exact portal and selection projections of the existing visitor map. */
export function progressiveSelectionContext(
  data: IndoorDataset,
  payload: PreparedDisplayPayload,
  levelIds: number[],
): Pick<ProgressivePresentationContext, "portals" | "stairSelectionKeys"> {
  const display = payload.preparedFloor.presentation.display;
  const keys = new Set(display.records.map((record) => record.key));
  const edges = data.edges.filter(
    (edge) =>
      edge.roomKeys.some((key) => keys.has(key)) &&
      (["stairs", "local-steps", "ramp", "elevator", "escalator"].includes(
        edge.kind,
      ) ||
        edge.pointsFeet.every((point) =>
          levelIds.some((id) =>
            data.nativeLevels.some(
              (level) =>
                level.id === id && Math.abs(level.elevationFeet - point[2]) < 5,
            ),
          ),
        )),
  );
  const portals: ProgressivePresentationContext["portals"] = {
    type: "FeatureCollection",
    features: [
      ...display.doorMarkers.features,
      ...edges
        .filter(
          (edge) =>
            edge.kind !== "walk" && !(data.doors && edge.kind === "door"),
        )
        .map((edge) => ({
          type: "Feature" as const,
          properties: { id: edge.id, kind: edge.kind, enabled: edge.enabled },
          geometry: {
            type: "Point" as const,
            coordinates: geographicPoint(
              data,
              edge.pointsFeet[Math.floor(edge.pointsFeet.length / 2)],
            ),
          },
        })),
    ],
  };
  const stairSelectionKeys: Record<string, string[]> = {};
  if (data.stairDisplay?.sourceModelSha256 === data.source.modelSha256)
    for (const flight of data.stairDisplay.flights)
      if (
        data.records.some(
          (record) =>
            record.key === flight.roomKey &&
            flight.sourceGeometryKey ===
              JSON.stringify([
                record.levelId,
                record.elevationFeet,
                record.ringsFeet,
              ]),
        )
      )
        (stairSelectionKeys[flight.roomKey] ??= []).push(
          `source-stair:${flight.stairElementId}`,
        );
  return { portals, stairSelectionKeys };
}
/** Read back every written representation before exposing a completed export.
 * The manifest bounds stored and expanded bytes independently. */
export async function verifyProgressiveDeliveryDirectory(
  directory: string,
  manifest: ProgressiveManifest,
) {
  validateProgressiveManifest(manifest);
  let representations = 0,
    storedBytes = 0;
  for (const asset of Object.values(manifest.assets)) {
    for (const representation of asset.representations) {
      const stored = representation.parts
        ? await readProgressiveRoutingParts(representation, async (part) => {
            const file = path.join(directory, part.path);
            if ((await stat(file)).size !== part.bytes)
              throw new Error("Written routing part byte count mismatch.");
            return new Uint8Array(await readFile(file));
          })
        : new Uint8Array(
            await readFile(path.join(directory, representation.path)),
          );
      if (stored.length !== representation.bytes)
        throw new Error(
          "Written progressive representation byte count mismatch.",
        );
      if (progressiveSha256(stored) !== representation.sha256)
        throw new Error(
          "Written progressive representation checksum mismatch.",
        );
      const logical =
        representation.encoding === "identity"
          ? stored
          : representation.encoding === "gzip"
            ? gunzipSync(stored)
            : new Uint8Array(
                brotliDecompressSync(stored, {
                  maxOutputLength: asset.logicalBytes,
                }),
              );
      verifyProgressiveAssetBytes(asset, logical);
      representations++;
      storedBytes += stored.length;
    }
  }
  return {
    assets: Object.keys(manifest.assets).length,
    representations,
    storedBytes,
    exactCodecRoundTrips: true,
  };
}
export async function writeProgressiveOfflineArchive(
  directory: string,
  manifest: ProgressiveManifest,
) {
  const paths = [
    "manifest.json",
    "offline-inventory.json",
    ...new Set(
      Object.values(manifest.assets).flatMap((a) => {
        const gzip = a.representations.find((r) => r.encoding === "gzip")!;
        return gzip.parts ? gzip.parts.map((part) => part.path) : [gzip.path];
      }),
    ),
  ];
  await writeFile(
    path.join(directory, "offline-inventory.json"),
    JSON.stringify(
      {
        version: 1,
        format: "openindoormaps-progressive-offline-v1",
        revisionSha256: manifest.revisionSha256,
        representation: "gzip",
        assets: Object.values(manifest.assets).map((a) => ({
          id: a.id,
          logicalSha256: a.logicalSha256,
          logicalBytes: a.logicalBytes,
          ...a.representations.find((r) => r.encoding === "gzip")!,
        })),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  const output = createWriteStream(
    path.join(directory, "complete-map.offline.zip"),
    { flags: "wx" },
  );
  const done = new Promise<void>((resolve, reject) => {
    output.on("finish", resolve);
    output.on("error", reject);
  });
  const zip = new Zip((error, chunk, final) => {
    if (error) output.destroy(error);
    else {
      output.write(chunk);
      if (final) output.end();
    }
  });
  for (const name of paths) {
    const entry = new ZipPassThrough(name);
    entry.mtime = new Date("1980-01-01T00:00:00Z");
    zip.add(entry);
    for await (const chunk of createReadStream(path.join(directory, name)))
      entry.push(chunk, false);
    entry.push(new Uint8Array(), true);
  }
  zip.end();
  await done;
}
export async function exportProgressiveViewer(
  input: string,
  directory: string,
  options: {
    visitor?: boolean;
    prepareMissing?: boolean;
    offline?: boolean;
    checkpoints?: boolean;
    sourceReceipt?: string;
    identity?: boolean;
    brotli?: boolean;
    priorityScopes?: number[][];
  } = {},
) {
  await mkdir(path.dirname(path.resolve(directory)), { recursive: true });
  try {
    await stat(directory);
    throw new Error("Progressive export requires a new output directory.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const engineSnapshot = preparedDisplayEngineBinding(projectRoot);
  if (engineSnapshot.sha256 !== PREPARED_DISPLAY_ENGINE_SHA256)
    throw new Error(
      "Preparation engine binding is stale. Freeze source edits and regenerate the engine binding before export.",
    );
  const inputBytes = new Uint8Array(await readFile(input));
  const inputSha256 = progressiveSha256(inputBytes);
  console.log(JSON.stringify({ stage: "read-source", inputSha256 }));
  let project = await readIndoorProject(inputBytes, (event) =>
    console.log(JSON.stringify({ phase: "source-import", ...event })),
  );
  let independentVisitor: Uint8Array | undefined;
  let authoringPackageSha256 =
    project.manifest.format === "reviter-project" ? inputSha256 : undefined;
  if (options.visitor && project.manifest.format !== "openindoormaps-viewer") {
    console.log(JSON.stringify({ stage: "export-independent-visitor" }));
    // The independent checkpoint carries source data only. The progressive
    // exporter prepares each supported scope below under its frozen engine.
    independentVisitor = await exportCampusViewer(project, {
      preparedDisplay: false,
    });
    // All source entries were independently verified. Release the large
    // authoring graph before validating its separate visitor projection.
    project = undefined!;
    (globalThis as { gc?: () => void }).gc?.();
    project = await readIndoorProject(independentVisitor, (event) =>
      console.log(JSON.stringify({ phase: "visitor-import", ...event })),
    );
  }
  const data = editorVisitorDataset(project);
  const datasetSha256 = preparedDisplayDatasetSha256(data);
  const inputSource = { ...data.source };
  if (options.sourceReceipt) {
    const receipt = JSON.parse(await readFile(options.sourceReceipt, "utf8"));
    if (
      receipt.version !== 1 ||
      receipt.normalSourceImportVerified !== true ||
      receipt.normalIndependentVisitorImportVerified !== true ||
      receipt.visitorSha256 !== inputSha256 ||
      receipt.datasetSha256 !== datasetSha256 ||
      JSON.stringify(receipt.source) !== JSON.stringify(data.source) ||
      typeof receipt.authoringInputPath !== "string" ||
      !/^[a-f0-9]{64}$/.test(receipt.authoringPackageSha256) ||
      progressiveSha256(
        new Uint8Array(await readFile(receipt.authoringInputPath)),
      ) !== receipt.authoringPackageSha256
    )
      throw new Error(
        "Independent visitor source receipt does not match its exact source bytes and dataset.",
      );
    authoringPackageSha256 = receipt.authoringPackageSha256;
  }
  let independentVisitorCheckpoint: string | undefined;
  if (independentVisitor) {
    const visitorSha256 = progressiveSha256(independentVisitor);
    independentVisitorCheckpoint = `${directory}.independent-${visitorSha256.slice(0, 16)}.campus-viewer.zip`;
    await writeFile(independentVisitorCheckpoint, independentVisitor, {
      flag: "wx",
    });
    const receipt = {
      version: 1,
      authoringInputPath: path.resolve(input),
      authoringPackageSha256: inputSha256,
      visitorSha256,
      datasetSha256,
      source: data.source,
      enginePreparationSha256: engineSnapshot.sha256,
      normalSourceImportVerified: true,
      normalIndependentVisitorImportVerified: true,
    };
    await writeFile(
      independentVisitorCheckpoint + ".source.json",
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    independentVisitor = undefined;
    console.log(
      JSON.stringify({
        stage: "independent-visitor-checkpoint",
        path: independentVisitorCheckpoint,
        ...receipt,
      }),
    );
  }

  const publication =
    project.manifest.format === "openindoormaps-viewer"
      ? ("visitor" as const)
      : ("authoring-derived-candidate" as const);
  await mkdir(directory, { recursive: false });
  await mkdir(path.join(directory, "assets"));
  const assets: Record<string, ProgressiveAsset> = {};
  const add = async (
    kind: ProgressiveAsset["kind"],
    raw: Uint8Array,
    mediaType: ProgressiveAsset["mediaType"],
  ) => {
    const logicalSha256 = progressiveSha256(raw),
      id = `${kind}:${logicalSha256}`;
    if (assets[id]) return assets[id];
    const representations: ProgressiveAsset["representations"] = [];
    for (const representation of progressiveRepresentations(
      raw,
      mediaType,
      options.identity ?? false,
      options.brotli ?? true,
    )) {
      representations.push(
        await writeProgressiveRepresentation(directory, kind, representation),
      );
    }
    return (assets[id] = {
      id,
      kind,
      logicalSha256,
      logicalBytes: raw.length,
      mediaType,
      dependencies: [],
      representations,
    });
  };
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const shell: ProgressiveShell = {
    version: 1,
    format: "openindoormaps-visitor-shell-v1",
    source: data.source,
    alignment: data.alignment,
    report: data.report,
    floors: data.floors,
    nativeLevels: data.nativeLevels,
    buildings: [...new Set(data.records.map((r) => r.building))].sort(),
    display: {
      nativeIndoorEnvelopes: !!data.nativeIndoorEnvelopes,
      nativeMaterialSections: !!data.nativeMaterialSections,
      windowMode: data.windowDisplay?.mode ?? null,
    },
    records: data.records.map((r) => ({
      key: r.key,
      number: r.number,
      name: data.visitor?.places[r.key]?.displayName ?? r.name,
      building: r.building,
      levelId: r.levelId,
      elevationFeet: r.elevationFeet,
      circulation: r.circulation,
      stair: r.stair,
      access: r.access,
      walkable: r.walkable,
      arrivalNodeId: r.arrivalNodeId,
      geographic: r.arrivalNodeId
        ? nodes.get(r.arrivalNodeId)?.geographic
        : undefined,
    })),
  };
  const shellAsset = await add("shell", jsonBytes(shell), "application/json");
  console.log(JSON.stringify({ stage: "shell", asset: shellAsset }));
  const route = routeWorkerDataset(data);
  const routeAsset = await add("routing", jsonBytes(route), "application/json");
  const expectedRouteSha256 = preparedDisplayDatasetSha256(route);
  if (expectedRouteSha256 !== routeAsset.logicalSha256)
    throw new Error("Routing projection bytes changed during serialization.");
  console.log(JSON.stringify({ stage: "routing", asset: routeAsset }));
  const inventory = preparedDisplayScopes(data);
  const scopeKeys = new Set(inventory.scopes.map((ids) => JSON.stringify(ids)));
  const priorityKeys = (options.priorityScopes ?? []).map((ids) =>
    JSON.stringify(ids),
  );
  if (
    new Set(priorityKeys).size !== priorityKeys.length ||
    priorityKeys.some((key) => !scopeKeys.has(key))
  )
    throw new Error("Priority scopes must be unique supported exact scopes.");
  const orderedScopes = [
    ...priorityKeys.map(
      (key) => inventory.scopes.find((ids) => JSON.stringify(ids) === key)!,
    ),
    ...inventory.scopes.filter(
      (ids) => !priorityKeys.includes(JSON.stringify(ids)),
    ),
  ];
  const scopes: ProgressiveScope[] = [],
    unavailableScopes = [...inventory.unavailableScopes];
  const makeManifest = (missing: number[][]): ProgressiveManifest => {
    const body: Omit<ProgressiveManifest, "revisionSha256"> = {
      version: 1,
      format: "openindoormaps-progressive-v1",
      provenance: {
        packageSha256: inputSha256,
        authoringPackageSha256,
        datasetSha256,
        source: data.source,
        enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
        publication,
      },
      shellAssetId: shellAsset.id,
      routeAssetId: routeAsset.id,
      defaultScopeId: scopes[0].id,
      scopes,
      unavailableScopes: missing,
      assets,
    };
    return {
      ...body,
      revisionSha256: progressiveManifestRevision(body),
    };
  };
  const timings: unknown[] = [];
  for (const levelIds of orderedScopes) {
    const started = performance.now();
    console.log(JSON.stringify({ stage: "scope-start", levelIds }));
    let descriptor = project.preparedDisplay?.descriptors.find(
      (d) =>
        d.binding.datasetSha256 === datasetSha256 &&
        d.binding.enginePreparationSha256 === PREPARED_DISPLAY_ENGINE_SHA256 &&
        JSON.stringify(d.binding.levelIds) === JSON.stringify(levelIds),
    );
    let blobs = project.preparedDisplay?.blobs;
    let payload: PreparedDisplayPayload | undefined;
    if (descriptor && blobs)
      payload = await loadPreparedDisplayAsset(
        data,
        levelIds,
        "all",
        { descriptor, blobs },
        visitorDisplayDefaultOptions,
      );
    if (!payload && options.prepareMissing) {
      const nativeFaces = await deriveNativeExplore(data, levelIds, "all");
      const preparedFloor = prepareFloor(data, levelIds, "all", {
        ...floorWorkerPreparationOptions(data, visitorDisplayDefaultOptions),
        nativeFaces,
      });
      payload = { nativeFaces, preparedFloor };
      const encoded = encodePreparedDisplayAsset(payload, {
        version: 1,
        datasetSha256,
        enginePreparationSha256: PREPARED_DISPLAY_ENGINE_SHA256,
        levelIds,
        building: "all",
        windowMode: data.windowDisplay?.mode ?? "none",
        options: preparedDisplayOptions(data, visitorDisplayDefaultOptions),
      });
      descriptor = encoded.descriptor;
      blobs = Object.fromEntries(encoded.blobs);
      const replay = await loadPreparedDisplayAsset(
        data,
        levelIds,
        "all",
        { descriptor, blobs },
        visitorDisplayDefaultOptions,
      );
      if (
        !replay ||
        preparedDisplayDatasetSha256(payload) !==
          preparedDisplayDatasetSha256(replay)
      )
        throw new Error(
          "Fresh display preparation failed exact independent replay.",
        );
    }
    if (!payload || !descriptor || !blobs) {
      unavailableScopes.push(levelIds);
      continue;
    }
    // The existing descriptor's gzip timestamp is incidental. Canonicalize only
    // its transport carrier; every pooled/logical byte and scope binding stays exact.
    const updated: PreparedDisplayAssetDescriptor = {
      ...descriptor,
      chunks: [],
    };
    const chunkAssetIds: string[] = [];
    for (const chunk of descriptor.chunks) {
      const stored = blobs[chunk.sha256];
      if (!stored || progressiveSha256(stored) !== chunk.sha256)
        throw new Error("Prepared source chunk checksum mismatch.");
      const raw = gunzipSync(stored),
        asset = await add("prepared-chunk", raw, "application/octet-stream");
      if (
        asset.logicalSha256 !== chunk.expandedSha256 ||
        raw.length !== chunk.expandedBytes
      )
        throw new Error("Prepared pooled bytes changed.");
      const gzip = asset.representations.find((r) => r.encoding === "gzip")!;
      updated.chunks.push({
        ...chunk,
        sha256: gzip.sha256,
        storedBytes: gzip.bytes,
      });
      chunkAssetIds.push(asset.id);
    }
    if (
      preparedDisplayBindingSha256(updated.binding) !== descriptor.bindingSha256
    )
      throw new Error("Prepared source binding changed.");
    const overview: ProgressiveOverview = {
      version: 1,
      format: "openindoormaps-visitor-overview-v1",
      binding: updated.binding,
      geometry: {
        ...payload.preparedFloor.presentation.overviewGeometry,
        features: [
          ...payload.preparedFloor.presentation.overviewGeometry.features,
          ...overviewConnectorSurfaces(data, payload, levelIds, "all").features,
        ],
      },
      floor: prepareOverviewFloor(data, payload.preparedFloor),
      ground: prepareOverviewGround(
        data,
        payload.preparedFloor,
        payload.nativeFaces.walls,
      ),
      labels: payload.preparedFloor.presentation.overviewLabels,
    };
    const context: ProgressivePresentationContext = {
      version: 1,
      format: "openindoormaps-visitor-presentation-context-v1",
      ...progressiveRampContext(data, levelIds),
      ...progressiveSelectionContext(data, payload, levelIds),
      binding: updated.binding,
      connectorMarkers: projectConnectorMarkers(
        data,
        levelIds,
        "all",
        undefined,
        false,
        true,
      ),
      relativeConnectorMarkers: sourceModelConnectorMarkers(
        data,
        projectConnectorMarkers(data, levelIds, "all", undefined, true, true),
        levelIds,
      ),
      visitorLabels: nativeExploreLabels(
        data,
        payload.preparedFloor.presentation.display.labels,
        levelIds,
      ),
      extrusionWalls: stableWallGeometry(
        singleExtrusionWalls(
          data,
          levelIds,
          payload.preparedFloor.presentation.visitorWalls,
        ),
      ),
    };
    const contextAsset = await add(
      "presentation-context",
      jsonBytes(context),
      "application/json",
    );
    const overviewAsset = await add(
      "overview",
      jsonBytes(overview),
      "application/json",
    );
    const exactScope = (ids: number[]) =>
      JSON.stringify(ids) === JSON.stringify(levelIds);
    const floor = data.floors.find((entry) => exactScope(entry.levelIds));
    const plane = data.floors.flatMap((entry) =>
      nativePhysicalDisplayPlanes(data, entry.id)
        .filter((candidate) => exactScope(candidate.levelIds))
        .map((candidate) => ({ floor: entry.name, label: candidate.label })),
    )[0];
    const label =
      floor?.name ??
      (plane
        ? `${plane.floor} · ${plane.label}`
        : data.nativeLevels
            .filter((level) => levelIds.includes(level.id))
            .map((level) => level.name)
            .join(" / "));
    const id = `scope-${updated.bindingSha256}`;
    scopes.push({
      id,
      label,
      levelIds,
      building: "all",
      overviewAssetId: overviewAsset.id,
      contextAssetId: contextAsset.id,
      display: { descriptor: updated, chunkAssetIds },
    });
    const timing = {
      levelIds,
      elapsedMs: performance.now() - started,
      overviewAsset,
      chunks: chunkAssetIds.length,
    };
    timings.push(timing);
    console.log(JSON.stringify({ stage: "scope-complete", ...timing }));
    if (options.checkpoints && scopes.length <= 2) {
      const missing = [
        ...inventory.unavailableScopes,
        ...inventory.scopes.filter(
          (ids) =>
            !scopes.some(
              (scope) => JSON.stringify(scope.levelIds) === JSON.stringify(ids),
            ),
        ),
      ];
      const checkpoint = makeManifest(missing);
      validateProgressiveManifest(checkpoint);
      if (
        preparedDisplayEngineBinding(projectRoot).sha256 !==
          engineSnapshot.sha256 ||
        preparedDisplayDatasetSha256(data) !== datasetSha256 ||
        progressiveSha256(new Uint8Array(await readFile(input))) !== inputSha256
      )
        throw new Error("Source changed before a scope preview.");
      await verifyProgressiveDeliveryDirectory(directory, checkpoint);
      await writeFile(
        path.join(directory, `preview-${scopes.length}-manifest.json`),
        JSON.stringify(checkpoint, null, 2) + "\n",
        { flag: "wx" },
      );
      console.log(
        JSON.stringify({
          stage: "scope-preview",
          path: path.join(directory, `preview-${scopes.length}-manifest.json`),
          complete: false,
          unavailableScopes: missing,
        }),
      );
    }

    payload = undefined;
    (globalThis as { gc?: () => void }).gc?.();
  }
  if (scopes.length === 0)
    throw new Error(
      "No independently verified display scopes. Use --prepare to generate them.",
    );
  const manifest = makeManifest(unavailableScopes);
  validateProgressiveManifest(manifest);
  if (
    preparedDisplayEngineBinding(projectRoot).sha256 !==
      engineSnapshot.sha256 ||
    preparedDisplayDatasetSha256(data) !== datasetSha256 ||
    JSON.stringify(data.source) !== JSON.stringify(inputSource) ||
    progressiveSha256(new Uint8Array(await readFile(input))) !== inputSha256
  )
    throw new Error("Export changed its source dataset or package.");
  const verification = await verifyProgressiveDeliveryDirectory(
    directory,
    manifest,
  );
  const manifestFileBytes = encoder.encode(
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(path.join(directory, "manifest.json"), manifestFileBytes, {
    flag: "wx",
  });
  if (options.offline !== false)
    await writeProgressiveOfflineArchive(directory, manifest);
  const representationBytes = (ids: string[], encoding: "gzip" | "br") => {
    const representations = [...new Set(ids)].map((id) =>
      assets[id].representations.find((r) => r.encoding === encoding),
    );
    return representations.some((r) => !r)
      ? null
      : representations.reduce((sum, r) => sum + r!.bytes, 0);
  };
  const totals = (encoding: "gzip" | "br") => {
    const bytes = representationBytes(Object.keys(assets), encoding);
    return bytes === null ? null : manifestFileBytes.length + bytes;
  };
  const firstScope = scopes[0];
  const firstView = [shellAsset, assets[firstScope.overviewAssetId]];
  const transferBytes = representationBytes;
  const report = {
    enginePreparationSha256: engineSnapshot.sha256,
    engineModuleCount: engineSnapshot.modules.length,
    engineSourceUnchanged: true,
    input: path.resolve(input),
    output: path.resolve(directory),
    sourcePackageUnchanged: true,
    independentVisitorCheckpoint,
    authoringPackageSha256,
    sourceDatasetUnchanged: true,
    verification,
    exactRoutingProjectionSha256: routeAsset.logicalSha256,
    publication,
    complete: unavailableScopes.length === 0,
    scopes: scopes.length,
    unavailableScopes,
    manifestRevisionSha256: manifest.revisionSha256,
    manifestBytes: manifestFileBytes.length,
    allRepresentationsStorageBytes:
      manifestFileBytes.length + verification.storedBytes,
    exporterPeakRssBytes: process.resourceUsage().maxRSS * 1024,
    offlineZipBytes:
      options.offline === false
        ? null
        : (await stat(path.join(directory, "complete-map.offline.zip"))).size,
    includesIdentity: options.identity ?? false,
    includesBrotli: options.brotli ?? true,
    totalLogicalBytes: Object.values(assets).reduce(
      (total, asset) => total + asset.logicalBytes,
      0,
    ),
    totalGzipBytes: totals("gzip"),
    totalBrotliBytes: totals("br"),
    shellGzipBytes: transferBytes([shellAsset.id], "gzip"),
    shellBrotliBytes: transferBytes([shellAsset.id], "br"),
    routingGzipBytes: transferBytes([routeAsset.id], "gzip"),
    routingBrotliBytes: transferBytes([routeAsset.id], "br"),
    perScope: scopes.map((scope) => ({
      id: scope.id,
      label: scope.label,
      levelIds: scope.levelIds,
      overviewGzipBytes: transferBytes([scope.overviewAssetId], "gzip"),
      overviewBrotliBytes: transferBytes([scope.overviewAssetId], "br"),
      detailsGzipBytes: transferBytes(
        [scope.contextAssetId, ...scope.display.chunkAssetIds],
        "gzip",
      ),
      detailsBrotliBytes: transferBytes(
        [scope.contextAssetId, ...scope.display.chunkAssetIds],
        "br",
      ),
    })),
    firstViewGzipBytes:
      manifestFileBytes.length +
      transferBytes(
        firstView.map((a) => a.id),
        "gzip",
      )!,
    firstViewBrotliBytes:
      options.brotli === false
        ? null
        : manifestFileBytes.length +
          transferBytes(
            firstView.map((a) => a.id),
            "br",
          )!,
    timings,
  };
  await writeFile(
    path.join(directory, "export-report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify({ stage: "complete", ...report }));
  return { manifest, report };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const [input, directory, ...flags] = process.argv.slice(2);
  if (
    !input ||
    !directory ||
    flags.some(
      (f) =>
        ![
          "--visitor",
          "--prepare",
          "--no-offline",
          "--checkpoints",
          "--identity",
          "--gzip-only",
        ].includes(f) &&
        !f.startsWith("--source-receipt=") &&
        !/^--priority-scope=\d+(?:,\d+)*$/.test(f),
    )
  )
    throw new Error(
      "Usage: node --max-old-space-size=8192 --expose-gc --import tsx scripts/indoor/export-progressive-viewer.ts source.zip NEW_DIRECTORY [--visitor] [--prepare] [--no-offline] [--checkpoints] [--source-receipt=/absolute/path/receipt.json] [--identity] [--gzip-only] [--priority-scope=LEVEL_ID,...]",
    );
  await initializeNativeExactGeosOverlay();
  await exportProgressiveViewer(input, directory, {
    visitor: flags.includes("--visitor"),
    prepareMissing: flags.includes("--prepare"),
    offline: !flags.includes("--no-offline"),
    checkpoints: flags.includes("--checkpoints"),
    identity: flags.includes("--identity"),
    brotli: !flags.includes("--gzip-only"),
    sourceReceipt: flags
      .find((flag) => flag.startsWith("--source-receipt="))
      ?.slice("--source-receipt=".length),
    priorityScopes: flags
      .filter((flag) => flag.startsWith("--priority-scope="))
      .map((flag) =>
        flag.slice("--priority-scope=".length).split(",").map(Number),
      ),
  });
}
