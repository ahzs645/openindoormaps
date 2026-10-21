import { FloorMemoryCache } from "./floor-memory-cache";
import {
  saveOfflineRouteCellCache,
  verifyOfflineRouteCellCache,
} from "./offline-route-cell-cache";
import { readProgressiveRoutingParts } from "./progressive-routing-parts";
import { parseVerifiedRoutingDataset } from "./verified-routing-dataset";
import {
  decodeProgressiveFloor,
  progressiveSha256,
  validateProgressiveManifest,
  verifyProgressiveAssetBytes,
} from "./progressive-delivery";
import type {
  ProgressiveAsset,
  ProgressiveManifest,
  ProgressiveOverview,
  ProgressivePresentationContext,
  ProgressiveScope,
  ProgressiveShell,
} from "./progressive-delivery";
import {
  preparedDisplayBindingSha256,
  type PreparedDisplayPayload,
} from "./prepared-display-assets";
import type { IndoorDataset } from "./contract";
import {
  IndexedDbVisitorDeliveryCache,
  type VisitorDeliveryCache,
} from "./visitor-delivery-cache";

const MANIFEST_LIMIT = 2 * 1024 * 1024;
const ASSET_LIMIT = 512 * 1024 * 1024;
const decoder = new TextDecoder("utf8", { fatal: true });
export class VisitorDeliveryError extends Error {
  constructor(
    readonly code:
      | "network"
      | "limit"
      | "checksum"
      | "format"
      | "offline"
      | "encoding",
    message: string,
  ) {
    super(message);
    this.name = "VisitorDeliveryError";
  }
}
export type VisitorOfflineProgress = {
  completedAssets: number;
  totalAssets: number;
  verifiedLogicalBytes: number;
  totalLogicalBytes: number;
  complete: boolean;
  directionsCache?: "saved" | "unavailable";
  directionsCacheBytes?: number;
};
export type VisitorScopeView = {
  scope: ProgressiveScope;
  overview: ProgressiveOverview;
  display?: PreparedDisplayPayload;
  context?: ProgressivePresentationContext;
};
export type ProgressiveFloorRequest = {
  manifestUrl: string;
  manifest: ProgressiveManifest;
  scopeId: string;
  preferHttpBrotli: boolean;
  offline: boolean;
};
export type ProgressiveFloorResponse =
  | { display: PreparedDisplayPayload; context: ProgressivePresentationContext }
  | { error: string };
export interface ProgressiveFloorWorker {
  onmessage: ((event: MessageEvent<ProgressiveFloorResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: ProgressiveFloorRequest): void;
  terminate(): void;
}
export type ProgressiveVisitorOptions = {
  fetch?: typeof fetch;
  /** Browser UI supplies a worker factory; never decode a full floor on its main thread. */
  floorWorkerFactory?: () => ProgressiveFloorWorker;
  cache?: VisitorDeliveryCache;
  /** Force a verified cached manifest. No network request is attempted. */
  offline?: boolean;
  signal?: AbortSignal;
  /** Undefined probes the small search resource with HEAD; raw static hosts use gzip.
   * Only enable for a host which sends .br with Content-Encoding: br.
   * Raw Brotli is never passed through as decoded JSON; gzip remains fallback. */
  preferHttpBrotli?: boolean;
  maximumRetainedFloors?: number;
  /** Conservative retained JSON estimate. Active UI/GPU/worker memory is separate. */
  maximumRetainedFloorBytes?: number;
  onStorageError?: (error: unknown) => void;
};
const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted)
    throw (
      signal.reason ??
      new DOMException("Map loading was cancelled.", "AbortError")
    );
};
const json = (bytes: Uint8Array): unknown => JSON.parse(decoder.decode(bytes));
const sameSource = (
  value: IndoorDataset["source"] | undefined,
  expected: IndoorDataset["source"],
) =>
  value?.modelFileName === expected.modelFileName &&
  value?.modelSha256 === expected.modelSha256 &&
  value?.roomsSha256 === expected.roomsSha256;

const finiteTuple = (value: unknown, length: number) =>
  Array.isArray(value) &&
  value.length === length &&
  value.every((part) => typeof part === "number" && Number.isFinite(part));
const featureCollection = (value: unknown) => {
  const collection = value as
    | { type?: unknown; features?: unknown }
    | undefined;
  return (
    collection?.type === "FeatureCollection" &&
    Array.isArray(collection.features)
  );
};
/** Validate the small renderer/search contract before React or MapLibre sees it.
 * This is a display schema, never a substitute for routing authority checks. */
function validShell(shell: ProgressiveShell): boolean {
  return (
    !!shell &&
    shell.version === 1 &&
    shell.format === "openindoormaps-visitor-shell-v1" &&
    !!shell.alignment &&
    finiteTuple(shell.alignment.originFeet, 3) &&
    finiteTuple(shell.alignment.originGeographic, 2) &&
    [
      shell.alignment.projectionLatitude,
      shell.alignment.rotationRadians,
      shell.alignment.horizontalMetresPerFoot,
      shell.alignment.verticalMetresPerFoot,
      shell.alignment.rmsMetres,
      shell.alignment.referenceCount,
    ].every(Number.isFinite) &&
    !!shell.report &&
    [
      shell.report.recordCount,
      shell.report.routableArrivals,
      shell.report.components,
      shell.report.largestComponentArrivals,
      shell.report.unmatchedDoors,
      shell.report.cellSizeFeet,
      shell.report.omittedSourceLabels,
    ].every(Number.isFinite) &&
    Array.isArray(shell.buildings) &&
    shell.buildings.every((v) => typeof v === "string") &&
    Array.isArray(shell.floors) &&
    shell.floors.every(
      (floor) =>
        !!floor &&
        typeof floor.id === "string" &&
        typeof floor.name === "string" &&
        Array.isArray(floor.levelIds) &&
        floor.levelIds.length > 0 &&
        floor.levelIds.every(Number.isFinite) &&
        Number.isFinite(floor.elevationFeet),
    ) &&
    Array.isArray(shell.nativeLevels) &&
    shell.nativeLevels.every(
      (level) =>
        !!level &&
        Number.isFinite(level.id) &&
        typeof level.name === "string" &&
        Number.isFinite(level.elevationFeet),
    ) &&
    Array.isArray(shell.records) &&
    shell.records.every(
      (record) =>
        !!record &&
        [record.key, record.number, record.name, record.building].every(
          (v) => typeof v === "string",
        ) &&
        Number.isFinite(record.levelId) &&
        Number.isFinite(record.elevationFeet) &&
        [record.circulation, record.stair, record.walkable].every(
          (v) => typeof v === "boolean",
        ) &&
        ["public", "staff", "unknown"].includes(record.access) &&
        (record.arrivalNodeId === undefined ||
          typeof record.arrivalNodeId === "string") &&
        (record.geographic === undefined || finiteTuple(record.geographic, 2)),
    ) &&
    !!shell.display &&
    typeof shell.display.nativeIndoorEnvelopes === "boolean" &&
    typeof shell.display.nativeMaterialSections === "boolean" &&
    [null, "native", "simplified"].includes(shell.display.windowMode)
  );
}

async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!stream)
    throw new VisitorDeliveryError("network", "The map response has no body.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel(signal?.reason).catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      aborted(signal);
      const next = await reader.read();
      aborted(signal);
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new VisitorDeliveryError(
          "limit",
          "The map response exceeds its declared byte limit.",
        );
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
function safeAssetUrl(path: string, base: string): string {
  const url = new URL(path, base);
  if (!/^https?:$/.test(url.protocol))
    throw new VisitorDeliveryError(
      "format",
      "Map assets require an HTTP or HTTPS URL.",
    );
  return url.href;
}

/** Visitor-only network delivery. This loader never treats prepared display
 * geometry as route authority: the routing projection is a separate lazy root. */
export class ProgressiveVisitorClient {
  readonly manifest: ProgressiveManifest;
  readonly manifestUrl: string;
  readonly fromCachedManifest: boolean;
  shell!: ProgressiveShell;
  initialOverview!: ProgressiveOverview;
  private readonly cache: VisitorDeliveryCache;
  private readonly request: typeof fetch;
  private readonly floors: FloorMemoryCache<string, PreparedDisplayPayload>;
  private activeScope?: AbortController;
  private generation = 0;
  private closed = false;
  readonly #retainedGzip = new WeakMap<
    Uint8Array,
    { sha256: string; logicalBytes: number; gzip: Uint8Array }
  >();
  private constructor(
    url: string,
    manifest: ProgressiveManifest,
    private readonly options: ProgressiveVisitorOptions,
    cached: boolean,
  ) {
    this.manifestUrl = url;
    this.manifest = manifest;
    this.fromCachedManifest = cached;
    this.cache = options.cache ?? new IndexedDbVisitorDeliveryCache();
    const request = options.fetch ?? fetch;
    // Native Window.fetch rejects a class instance as its receiver.
    this.request = (input, init) => request(input, init);
    this.floors = new FloorMemoryCache(
      options.maximumRetainedFloors ?? 2,
      options.maximumRetainedFloorBytes ?? 128 * 1024 * 1024,
    );
  }
  /** Worker entrypoint: validate the tiny immutable manifest without fetching
   * overview or search data into the exact calculator worker. */
  static fromManifest(
    url: string,
    manifest: unknown,
    options: ProgressiveVisitorOptions = {},
  ) {
    validateProgressiveManifest(manifest);
    return new ProgressiveVisitorClient(
      safeAssetUrl(
        url,
        typeof location === "undefined" ? "http://localhost/" : location.href,
      ),
      manifest,
      options,
      false,
    );
  }
  static async open(
    url: string,
    options: ProgressiveVisitorOptions = {},
  ): Promise<ProgressiveVisitorClient> {
    const manifestUrl = safeAssetUrl(
      url,
      typeof location === "undefined" ? "http://localhost/" : location.href,
    );
    const cache = options.cache ?? new IndexedDbVisitorDeliveryCache();
    const request = options.fetch ?? fetch;
    let bytes: Uint8Array | undefined;
    let cached = false;
    aborted(options.signal);
    if (options.offline) {
      bytes = await cache.getManifest(manifestUrl);
      cached = true;
    } else {
      let response: Response;
      try {
        response = await request(manifestUrl, {
          cache: "no-cache",
          signal: options.signal,
        });
      } catch (error) {
        aborted(options.signal);
        // A rejected fetch is a transport failure. HTTP errors or malformed
        // manifests below never silently substitute an older revision.
        bytes = await cache.getManifest(manifestUrl);
        if (!bytes) throw error;
        cached = true;
        response = undefined as never;
      }
      if (!cached) {
        if (!response!.ok)
          throw new VisitorDeliveryError(
            "network",
            `Map manifest request failed (${response!.status}).`,
          );
        bytes = await readBounded(
          response!.body,
          MANIFEST_LIMIT,
          options.signal,
        );
      }
    }
    if (!bytes)
      throw new VisitorDeliveryError(
        "offline",
        "No saved map manifest is available. Download this map before opening it offline.",
      );
    if (bytes.byteLength > MANIFEST_LIMIT)
      throw new VisitorDeliveryError(
        "limit",
        "The saved map manifest is too large.",
      );
    const manifest = json(bytes);
    validateProgressiveManifest(manifest);
    let preferHttpBrotli = options.preferHttpBrotli ?? false;
    const brotli = manifest.assets[manifest.shellAssetId].representations.find(
      (representation) => representation.encoding === "br",
    );
    if (
      options.preferHttpBrotli === undefined &&
      !options.offline &&
      brotli &&
      !brotli.parts
    ) {
      const probeController = new AbortController();
      const cancelProbe = () => probeController.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", cancelProbe, { once: true });
      const timer = setTimeout(() => probeController.abort(), 2000);
      try {
        aborted(options.signal);
        const probe = await request(safeAssetUrl(brotli.path, manifestUrl), {
          method: "HEAD",
          cache: "no-cache",
          signal: probeController.signal,
        });
        preferHttpBrotli =
          probe.ok &&
          /(?:^|,)\s*br\s*(?:,|$)/i.test(
            probe.headers.get("Content-Encoding") ?? "",
          );
        await probe.body?.cancel();
      } catch {
        aborted(options.signal);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancelProbe);
      }
    }
    const client = new ProgressiveVisitorClient(
      manifestUrl,
      manifest,
      { ...options, cache, fetch: request, preferHttpBrotli },
      cached,
    );
    if (!cached)
      await client.store(() => cache.putManifest(manifestUrl, bytes!));
    const initial = client.scope(manifest.defaultScopeId);
    // No display chunks and no routing root are read during startup.
    const [shell, overview] = await Promise.all([
      client.readAsset(manifest.shellAssetId, options.signal),
      client.readAsset(initial.overviewAssetId, options.signal),
    ]);
    client.shell = json(shell) as ProgressiveShell;
    client.initialOverview = client.parseOverview(initial, overview);
    if (
      !validShell(client.shell) ||
      !sameSource(client.shell.source, manifest.provenance.source)
    )
      throw new VisitorDeliveryError("format", "Invalid visitor search index.");
    return client;
  }
  private scope(id: string): ProgressiveScope {
    const scope = this.manifest.scopes.find((entry) => entry.id === id);
    if (!scope)
      throw new VisitorDeliveryError(
        "format",
        "This floor is not listed in the selected map revision.",
      );
    return scope;
  }
  private parseOverview(
    scope: ProgressiveScope,
    bytes: Uint8Array,
  ): ProgressiveOverview {
    const overview = json(bytes) as ProgressiveOverview;
    if (
      !overview ||
      overview.version !== 1 ||
      overview.format !== "openindoormaps-visitor-overview-v1" ||
      preparedDisplayBindingSha256(overview.binding) !==
        scope.display.descriptor.bindingSha256 ||
      [
        overview.geometry,
        overview.floor,
        overview.ground,
        overview.labels,
      ].some((collection) => !featureCollection(collection))
    )
      throw new VisitorDeliveryError(
        "format",
        "The overview does not match this floor's source, engine and options.",
      );
    return overview;
  }
  private async store(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      this.options.onStorageError?.(error);
    }
  }
  private async putAsset(asset: ProgressiveAsset, bytes: Uint8Array) {
    const transport = this.#retainedGzip.get(bytes);
    // Custom storage must never receive the privately retained buffer itself.
    // The built-in backend also owns its argument before its first await.
    return transport &&
      transport.sha256 === asset.logicalSha256 &&
      transport.logicalBytes === asset.logicalBytes &&
      this.cache.putGzipAsset
      ? this.cache.putGzipAsset(
          transport.sha256,
          new Uint8Array(transport.gzip),
          transport.logicalBytes,
        )
      : this.cache.putAsset(asset.logicalSha256, bytes);
  }
  private asset(id: string): ProgressiveAsset {
    const asset = this.manifest.assets[id];
    if (!asset || asset.logicalBytes > ASSET_LIMIT)
      throw new VisitorDeliveryError(
        "limit",
        "Invalid or oversized map asset.",
      );
    return asset;
  }
  private async logicalBytes(
    asset: ProgressiveAsset,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    // Keep the exact logical/carrier declarations stable across all awaits.
    // This is a private metadata snapshot, not an authority attestation.
    asset = {
      ...asset,
      representations: asset.representations.map((representation) => ({
        ...representation,
        parts: representation.parts?.map((part) => ({ ...part })),
      })),
    };
    const existing = await this.cache
      .getAsset(asset.logicalSha256)
      .catch((error) => {
        this.options.onStorageError?.(error);
        return;
      });
    aborted(signal);
    if (existing) {
      try {
        verifyProgressiveAssetBytes(asset, existing);
        return existing;
      } catch {
        await this.store(() => this.cache.deleteAsset(asset.logicalSha256));
      }
    }
    if (this.options.offline)
      throw new VisitorDeliveryError(
        "offline",
        "This part of the map has not been saved for offline use.",
      );
    const preference = this.options.preferHttpBrotli
      ? ["br", "gzip", "identity"]
      : ["gzip", "identity", "br"];
    const representations = [...asset.representations].sort(
      (a, b) => preference.indexOf(a.encoding) - preference.indexOf(b.encoding),
    );
    for (const representation of representations) {
      // Parts are raw compressed bytes, so HTTP cannot decode a whole Brotli
      // stream for us. Its required gzip alternative uses the same part reader.
      if (representation.parts && representation.encoding === "br") continue;
      let bytes: Uint8Array;
      if (representation.parts) {
        bytes = await readProgressiveRoutingParts(
          representation,
          async (part) => {
            aborted(signal);
            const response = await this.request(
              safeAssetUrl(part.path, this.manifestUrl),
              { signal, cache: "force-cache" },
            );
            if (!response.ok)
              throw new VisitorDeliveryError(
                "network",
                `Map routing part request failed (${response.status}).`,
              );
            return readBounded(response.body, part.bytes, signal);
          },
        );
      } else {
        const response = await this.request(
          safeAssetUrl(representation.path, this.manifestUrl),
          { signal, cache: "force-cache" },
        );
        if (
          !response.ok &&
          representation.encoding === "br" &&
          [404, 406, 415].includes(response.status)
        ) {
          await response.body?.cancel();
          continue;
        }
        if (!response.ok)
          throw new VisitorDeliveryError(
            "network",
            `Map asset request failed (${response.status}).`,
          );
        bytes = await readBounded(
          response.body,
          Math.max(asset.logicalBytes, representation.bytes),
          signal,
        );
      }
      aborted(signal);
      let logical: Uint8Array;
      let retainedGzip: Uint8Array | undefined;
      // HTTP Content-Encoding has already been decoded by fetch. Verify the
      // logical bytes directly; compressed Content-Length is not a decoded limit.
      // That synchronous check is the logical verification: no second hash.
      const decodedByHttp =
        bytes.byteLength === asset.logicalBytes &&
        progressiveSha256(bytes) === asset.logicalSha256;
      if (decodedByHttp) logical = bytes;
      else {
        if (
          bytes.byteLength !== representation.bytes ||
          progressiveSha256(bytes) !== representation.sha256
        )
          throw new VisitorDeliveryError(
            "checksum",
            "A downloaded map asset failed its checksum.",
          );
        if (representation.encoding === "br") {
          // Static Pages returns raw .br. It is valid stored data, but cannot be
          // decoded by a gzip decoder. Try the required gzip/identity fallback.
          continue;
        }
        if (representation.encoding !== "gzip")
          throw new VisitorDeliveryError(
            "checksum",
            "A map asset has an invalid logical checksum.",
          );
        const compressed = new Blob([bytes.slice().buffer]).stream();
        logical = await readBounded(
          compressed.pipeThrough(new DecompressionStream("gzip")),
          asset.logicalBytes,
          signal,
        );
        retainedGzip = bytes;
      }
      if (!decodedByHttp) verifyProgressiveAssetBytes(asset, logical);
      aborted(signal);
      if (retainedGzip)
        this.#retainedGzip.set(logical, {
          sha256: asset.logicalSha256,
          logicalBytes: asset.logicalBytes,
          gzip: retainedGzip,
        });
      await this.store(() => this.putAsset(asset, logical));
      return logical;
    }
    throw new VisitorDeliveryError(
      "encoding",
      "This asset host serves raw Brotli without a usable gzip or identity fallback.",
    );
  }
  /** Dependencies are verified before the requested root becomes usable. */
  async readAsset(id: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (this.closed)
      throw new DOMException("Map loading was cancelled.", "AbortError");
    aborted(signal);
    const asset = this.asset(id);
    for (const dependency of asset.dependencies)
      await this.readAsset(dependency, signal);
    return this.logicalBytes(asset, signal);
  }
  async selectScope(
    id: string,
    options: { detail?: boolean; signal?: AbortSignal } = {},
  ): Promise<VisitorScopeView> {
    this.activeScope?.abort(
      new DOMException("A newer floor was selected.", "AbortError"),
    );
    const controller = new AbortController();
    this.activeScope = controller;
    const generation = ++this.generation;
    const signal = controller.signal;
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    try {
      const scope = this.scope(id);
      const overview = this.parseOverview(
        scope,
        await this.readAsset(scope.overviewAssetId, signal),
      );
      let display: PreparedDisplayPayload | undefined;
      let context: ProgressivePresentationContext | undefined;
      if (options.detail) {
        display = this.floors.get(scope.display.descriptor.bindingSha256);
        if (!display && this.options.floorWorkerFactory) {
          const decoded = await this.decodeInWorker(scope, signal);
          display = decoded.display;
          context = decoded.context;
        } else {
          context = await this.readPresentationContext(scope, signal);
          if (!display)
            display = await decodeProgressiveFloor(
              this.manifest,
              scope,
              (assetId) => this.readAsset(assetId, signal),
            );
        }
        aborted(signal);
        this.floors.set(
          scope.display.descriptor.bindingSha256,
          display,
          scope.display.descriptor.logicalJsonBytes * 4,
        );
      }
      aborted(signal);
      if (generation !== this.generation || this.closed)
        throw new DOMException("A newer floor was selected.", "AbortError");
      return { scope, overview, display, context };
    } finally {
      options.signal?.removeEventListener("abort", abort);
      if (this.activeScope === controller) this.activeScope = undefined;
    }
  }
  async readPresentationContext(
    scope: ProgressiveScope,
    signal?: AbortSignal,
  ): Promise<ProgressivePresentationContext> {
    const context = json(
      await this.readAsset(scope.contextAssetId, signal),
    ) as ProgressivePresentationContext;
    if (
      context.version !== 1 ||
      context.format !== "openindoormaps-visitor-presentation-context-v1" ||
      preparedDisplayBindingSha256(context.binding) !==
        scope.display.descriptor.bindingSha256 ||
      !Number.isFinite(context.floorDatumFeet) ||
      !Array.isArray(context.rampEdges) ||
      !Array.isArray(context.rampNodes) ||
      !context.stairSelectionKeys ||
      typeof context.stairSelectionKeys !== "object" ||
      Array.isArray(context.stairSelectionKeys) ||
      Object.values(context.stairSelectionKeys).some(
        (keys) =>
          !Array.isArray(keys) || keys.some((key) => typeof key !== "string"),
      ) ||
      [
        context.connectorMarkers,
        context.relativeConnectorMarkers,
        context.visitorLabels,
        context.extrusionWalls,
        context.portals,
      ].some(
        (collection) =>
          !collection ||
          collection.type !== "FeatureCollection" ||
          !Array.isArray(collection.features),
      ) ||
      (context.rampDisplay &&
        (context.rampDisplay.version !== 1 ||
          context.rampDisplay.sourceModelSha256 !==
            this.manifest.provenance.source.modelSha256 ||
          !Array.isArray(context.rampDisplay.ramps)))
    )
      throw new VisitorDeliveryError(
        "format",
        "The presentation context does not match this floor.",
      );
    return context;
  }
  private decodeInWorker(
    scope: ProgressiveScope,
    signal: AbortSignal,
  ): Promise<{
    display: PreparedDisplayPayload;
    context: ProgressivePresentationContext;
  }> {
    const worker = this.options.floorWorkerFactory!();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener("abort", abort);
        worker.terminate();
      };
      const abort = () => {
        cleanup();
        reject(
          signal.reason ??
            new DOMException("Floor loading cancelled.", "AbortError"),
        );
      };
      worker.onmessage = ({ data }) => {
        cleanup();
        if ("error" in data) reject(new Error(data.error));
        else resolve(data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        cleanup();
        reject(new Error(event.message || "Floor display could not load."));
      };
      worker.onmessageerror = () => {
        cleanup();
        reject(new Error("Floor display returned unreadable data."));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      try {
        worker.postMessage({
          manifestUrl: this.manifestUrl,
          manifest: this.manifest,
          scopeId: scope.id,
          preferHttpBrotli: this.httpBrotliEnabled,
          offline: this.offlineOnly,
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }
  /** Exact calculator projection, fetched only when directions start. The
   * worker owns its checked immutable parse and original validation results. */
  async loadRouting(signal?: AbortSignal): Promise<IndoorDataset> {
    const asset = this.asset(this.manifest.routeAssetId);
    if (asset.kind !== "routing")
      throw new VisitorDeliveryError(
        "format",
        "The map has no routing authority.",
      );
    const data = parseVerifiedRoutingDataset(
      await this.readAsset(asset.id, signal),
      asset.logicalSha256,
    );
    if (
      !data ||
      data.format !== "reviter-indoor" ||
      data.version !== 1 ||
      !sameSource(data.source, this.manifest.provenance.source)
    )
      throw new VisitorDeliveryError(
        "format",
        "Directions do not match this map's original source.",
      );
    return data;
  }
  /** Sequential, resumable and explicit. Every cache hit is rehashed; an
   * interrupted run keeps verified assets and resumes without downloading them. */
  async downloadOffline(
    onProgress: (progress: VisitorOfflineProgress) => void = () => {},
    signal?: AbortSignal,
  ): Promise<VisitorOfflineProgress> {
    if (this.manifest.unavailableScopes.length > 0)
      throw new VisitorDeliveryError(
        "offline",
        "This publication is partial. A complete offline map requires all declared floors.",
      );
    const assets = Object.values(this.manifest.assets);
    const progress: VisitorOfflineProgress = {
      completedAssets: 0,
      totalAssets: assets.length,
      verifiedLogicalBytes: 0,
      totalLogicalBytes: assets.reduce(
        (sum, asset) => sum + asset.logicalBytes,
        0,
      ),
      complete: false,
    };
    onProgress({ ...progress });
    // Storage failures must fail this explicit operation, not falsely report a
    // complete offline map after online viewing's best-effort writes.
    for (const asset of assets) {
      aborted(signal);
      const bytes = await this.readAsset(asset.id, signal);
      await this.putAsset(asset, bytes);
      const saved = await this.cache.getAsset(asset.logicalSha256);
      if (!saved)
        throw new VisitorDeliveryError(
          "offline",
          "The browser did not retain an offline map asset.",
        );
      verifyProgressiveAssetBytes(asset, saved);
      progress.completedAssets++;
      progress.verifiedLogicalBytes += asset.logicalBytes;
      onProgress({ ...progress });
    }
    const directions = await saveOfflineRouteCellCache(this.manifest, {
      baseUrl: this.manifestUrl,
      cache: this.cache,
      fetch: this.options.fetch,
      offline: this.options.offline,
      signal,
    });
    progress.directionsCache = directions ? "saved" : "unavailable";
    progress.directionsCacheBytes = directions?.compressedBytes;
    aborted(signal);
    // A bounded backend or browser quota management may have evicted an earlier
    // record while downloading. Require the whole inventory to coexist before
    // reporting completion; never infer completeness from a counter alone.
    for (const asset of assets) {
      aborted(signal);
      const saved = await this.cache.getAsset(asset.logicalSha256);
      if (!saved)
        throw new VisitorDeliveryError(
          "offline",
          "The browser could not retain the complete map. Free storage and resume the download.",
        );
      verifyProgressiveAssetBytes(asset, saved);
    }
    await verifyOfflineRouteCellCache(this.manifest, this.cache, signal);
    const bytes = new TextEncoder().encode(JSON.stringify(this.manifest));
    await this.cache.putManifest(this.manifestUrl, bytes);
    await this.verifySavedManifest();
    aborted(signal);
    progress.complete = true;
    onProgress({ ...progress });
    return progress;
  }
  private async verifySavedManifest() {
    const saved = await this.cache.getManifest(this.manifestUrl);
    if (!saved || saved.length > MANIFEST_LIMIT)
      throw new VisitorDeliveryError(
        "offline",
        "The browser did not retain this map's offline manifest.",
      );
    const manifest = json(saved);
    validateProgressiveManifest(manifest);
    if (manifest.revisionSha256 !== this.manifest.revisionSha256)
      throw new VisitorDeliveryError(
        "offline",
        "The saved offline manifest belongs to another map revision.",
      );
  }
  async verifyOfflineInventory(signal?: AbortSignal): Promise<void> {
    for (const asset of Object.values(this.manifest.assets)) {
      aborted(signal);
      const saved = await this.cache.getAsset(asset.logicalSha256);
      if (!saved)
        throw new VisitorDeliveryError(
          "offline",
          "The browser could not retain the complete map. Free storage and resume the download.",
        );
      verifyProgressiveAssetBytes(asset, saved);
    }
    aborted(signal);
    await this.verifySavedManifest();
    await verifyOfflineRouteCellCache(this.manifest, this.cache, signal);
  }
  get httpBrotliEnabled() {
    return this.options.preferHttpBrotli === true;
  }
  get offlineOnly() {
    return this.options.offline === true;
  }
  memoryStatistics() {
    return this.floors.statistics();
  }
  close() {
    this.closed = true;
    this.generation++;
    this.activeScope?.abort(new DOMException("Map was closed.", "AbortError"));
    this.floors.clear();
  }
}
export const openProgressiveVisitor = ProgressiveVisitorClient.open;
