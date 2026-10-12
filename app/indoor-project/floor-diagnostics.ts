/** Opt-in scalar diagnostics for import, floor preparation and rendering.
 *
 * Disabled unless `localStorage["oim:diagnostics"] === "1"` (UI realm) or the
 * UI enables it for a worker. Entries carry only stage names, timings, counts
 * and heap scalars: never geometry, source carriers, identifiers or text from
 * the project. Nothing here changes validation, preparation or rendering. */
export type FloorDiagnosticScalar = number | string | boolean;
export type FloorDiagnosticEntry = {
  stage: string;
  realm: "main" | "worker";
  /** performance.now() in the emitting realm. */
  at: number;
  ms?: number;
  heapUsed?: number;
  heapTotal?: number;
  heapLimit?: number;
  [scalar: string]: FloorDiagnosticScalar | undefined;
};
type Sink = (entry: FloorDiagnosticEntry) => void;
const MAX_ENTRIES = 1000;
const STORAGE_KEY = "oim:diagnostics";
let enabled: boolean | undefined;
let sink: Sink | undefined;
const realm: FloorDiagnosticEntry["realm"] =
  typeof window === "undefined" ? "worker" : "main";

function storageEnabled() {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}
export function floorDiagnosticsEnabled() {
  if (enabled === undefined) enabled = realm === "main" && storageEnabled();
  return enabled;
}
/** Workers receive the UI decision explicitly; tests may override either realm. */
export function configureFloorDiagnostics(on: boolean, output?: Sink) {
  enabled = on;
  sink = output;
}
function heap() {
  const memory = (
    globalThis.performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    }
  )?.memory;
  return memory
    ? {
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        heapLimit: memory.jsHeapSizeLimit,
      }
    : {};
}
const scalar = (v: unknown): v is FloorDiagnosticScalar =>
  typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v)) ||
  (typeof v === "string" && v.length <= 120);

/** Record one scalar marker. Non-scalar values are dropped, never serialized. */
export function floorDiagnostic(
  stage: string,
  values: Record<string, unknown> = {},
): FloorDiagnosticEntry | undefined {
  if (!floorDiagnosticsEnabled()) return undefined;
  const entry: FloorDiagnosticEntry = {
    stage: stage.slice(0, 120),
    realm,
    at: globalThis.performance?.now() ?? Date.now(),
    ...heap(),
  };
  for (const [key, value] of Object.entries(values))
    if (scalar(value) && !(key in entry)) entry[key] = value;
  recordFloorDiagnostic(entry);
  return entry;
}
/** Accept an entry already built by a worker (scalar-filtered again). */
export function recordFloorDiagnostic(entry: FloorDiagnosticEntry) {
  if (!floorDiagnosticsEnabled() || !entry || typeof entry !== "object") return;
  const clean: FloorDiagnosticEntry = {
    stage: String(entry.stage).slice(0, 120),
    realm: entry.realm === "worker" ? "worker" : "main",
    at: Number(entry.at) || 0,
  };
  for (const [key, value] of Object.entries(entry))
    if (!(key in clean) && scalar(value)) clean[key] = value;
  const store = globalThis as typeof globalThis & {
    __oimFloorDiagnostics?: FloorDiagnosticEntry[];
  };
  const list = (store.__oimFloorDiagnostics ??= []);
  list.push(clean);
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  if (sink) sink(clean);
  else if (realm === "main") console.info(`[oim-diag]${JSON.stringify(clean)}`);
}
/** Time a synchronous stage. Errors propagate unchanged. */
export function timeFloorStage<T>(
  stage: string,
  run: () => T,
  values?: (result: T) => Record<string, unknown>,
): T {
  if (!floorDiagnosticsEnabled()) return run();
  const start = performance.now();
  const result = run();
  floorDiagnostic(stage, {
    ...(values?.(result) ?? {}),
    ms: performance.now() - start,
  });
  return result;
}
export async function timeFloorStageAsync<T>(
  stage: string,
  run: () => Promise<T>,
  values?: (result: T) => Record<string, unknown>,
): Promise<T> {
  if (!floorDiagnosticsEnabled()) return run();
  const start = performance.now();
  const result = await run();
  floorDiagnostic(stage, {
    ...(values?.(result) ?? {}),
    ms: performance.now() - start,
  });
  return result;
}
