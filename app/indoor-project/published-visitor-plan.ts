import { gunzipSync } from "fflate";
import { PUBLISHED_VISITOR_PLAN_RECEIPTS } from "./published-visitor-plan-receipts";
import { PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256 } from "./published-visitor-plan-runtime-binding";
import { PREPARED_DISPLAY_ENGINE_SHA256 } from "./prepared-display-engine-binding";
import {
  validateProgressiveManifest,
  type ProgressiveManifest,
  type ProgressiveScope,
} from "./progressive-delivery";
import { readCheckedDownload } from "./checked-download";
import {
  IndexedDbVisitorDeliveryCache,
  type VisitorDeliveryCache,
} from "./visitor-delivery-cache";
import type {
  PublishedVisitorPlan,
  PublishedVisitorPlanReceipt,
} from "./published-visitor-plan-types";
import {
  restorePublishedVisitorPlanDelta,
  type PublishedVisitorPlanDelta,
} from "./published-visitor-plan-delta";
export type {
  PublishedVisitorPlan,
  PublishedVisitorPlanReceipt,
} from "./published-visitor-plan-types";
const layerKeys = [
  "areas",
  "rooms",
  "walls",
  "doors",
  "stairs",
  "windows",
  "labels",
  "portals",
  "selection",
];
const sha = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
function matches(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  r: PublishedVisitorPlanReceipt,
) {
  return (
    r.revisionSha256 === manifest.revisionSha256 &&
    r.engineSha256 === PREPARED_DISPLAY_ENGINE_SHA256 &&
    r.datasetSha256 === manifest.provenance.datasetSha256 &&
    r.scopeId === scope.id &&
    r.bindingSha256 === scope.display.descriptor.bindingSha256 &&
    r.pooledJsonSha256 === scope.display.descriptor.pooledJsonSha256 &&
    r.runtimeSha256 === PUBLISHED_VISITOR_PLAN_RUNTIME_SHA256
  );
}
export function publishedVisitorPlanReceipt(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
) {
  return PUBLISHED_VISITOR_PLAN_RECEIPTS.find((r) =>
    matches(manifest, scope, r),
  );
}
/** Only drawing data leaves this loader. No record access, native source index,
 * navigation graph or validation capability is created from a plan. */
export async function loadPublishedVisitorPlan(
  manifest: ProgressiveManifest,
  scope: ProgressiveScope,
  options: {
    manifestUrl: string;
    signal?: AbortSignal;
    offline?: boolean;
    cache?: Pick<VisitorDeliveryCache, "getAsset" | "putAsset">;
    fetch?: typeof fetch;
  },
  receipts: readonly PublishedVisitorPlanReceipt[] = PUBLISHED_VISITOR_PLAN_RECEIPTS,
): Promise<PublishedVisitorPlan | undefined> {
  const receipt = receipts.find((r) => matches(manifest, scope, r));
  if (!receipt) return;
  validateProgressiveManifest(manifest);
  const wireLogicalBytes = receipt.delta?.logicalBytes ?? receipt.logicalBytes;
  const wireLogicalSha256 =
    receipt.delta?.logicalSha256 ?? receipt.logicalSha256;
  if (
    !manifest.scopes.some(
      (s) => s.id === scope.id && JSON.stringify(s) === JSON.stringify(scope),
    )
  )
    throw new Error("The drawing scope differs from the checked map revision.");
  if (
    !Number.isSafeInteger(receipt.compressedBytes) ||
    receipt.compressedBytes < 1 ||
    receipt.compressedBytes > 64 * 1024 * 1024 ||
    !Number.isSafeInteger(receipt.logicalBytes) ||
    receipt.logicalBytes < 1 ||
    receipt.logicalBytes > 256 * 1024 * 1024 ||
    !Number.isSafeInteger(wireLogicalBytes) ||
    wireLogicalBytes < 1 ||
    wireLogicalBytes > 256 * 1024 * 1024
  )
    throw new Error("The plan exceeds its checked allocation limits.");
  options.signal?.throwIfAborted();
  let cache = options.cache;
  if (!cache) {
    try {
      cache = new IndexedDbVisitorDeliveryCache();
    } catch {
      /* Optional persistent storage. */
    }
  }
  const checked = async (bytes: Uint8Array) => {
    const compressed =
      bytes.length === receipt.compressedBytes &&
      (await sha(bytes)) === receipt.compressedSha256;
    const logical = compressed ? gunzipSync(bytes) : bytes;
    if (
      logical.length !== wireLogicalBytes ||
      (await sha(logical)) !== wireLogicalSha256
    )
      throw new Error("The published plan failed its checksum.");
    return { logical, compressed };
  };
  let selected: { logical: Uint8Array; compressed: boolean } | undefined,
    stored: Uint8Array | undefined,
    corruptSaved = false;
  for (const digest of [receipt.compressedSha256, wireLogicalSha256]) {
    const saved = await cache?.getAsset(digest).catch(() => {});
    if (!saved) continue;
    try {
      selected = await checked(saved);
      stored = saved;
      break;
    } catch {
      corruptSaved = true;
    }
  }
  if (!selected && !options.offline) {
    let response: Response | undefined;
    try {
      response = await (options.fetch ?? fetch)(
        new URL(receipt.url, options.manifestUrl),
        { signal: options.signal },
      );
    } catch {
      options.signal?.throwIfAborted();
    }
    if (response?.ok) {
      stored = await readCheckedDownload(
        response,
        Math.max(receipt.compressedBytes, wireLogicalBytes),
      );
      // A present invalid network carrier always refuses; it is never paint.
      selected = await checked(stored);
    }
  }
  if (!selected) {
    if (corruptSaved)
      throw new Error(
        "The saved published plan failed its checksum and could not be recovered.",
      );
    return;
  }
  options.signal?.throwIfAborted();
  const { logical, compressed } = selected;
  const parsed = JSON.parse(
    new TextDecoder("utf8", { fatal: true }).decode(logical),
  );
  let plan: PublishedVisitorPlan;
  if (receipt.delta) {
    const baseScope = manifest.scopes.find(
      (s) => s.id === receipt.delta!.baseScopeId,
    );
    const baseReceipt =
      baseScope && receipts.find((r) => matches(manifest, baseScope, r));
    if (
      !baseScope ||
      !baseReceipt ||
      baseReceipt.delta ||
      baseReceipt.logicalSha256 !== receipt.delta.baseLogicalSha256 ||
      baseReceipt.scopeId === receipt.scopeId
    )
      throw new Error("The published plan delta lacks its checked full base.");
    const base = await loadPublishedVisitorPlan(
      manifest,
      baseScope,
      options,
      receipts,
    );
    if (!base) throw new Error("The published plan delta base is unavailable.");
    plan = restorePublishedVisitorPlanDelta(
      parsed as PublishedVisitorPlanDelta,
      base,
      baseReceipt.logicalSha256,
    );
    const expanded = new TextEncoder().encode(JSON.stringify(plan));
    if (
      expanded.length !== receipt.logicalBytes ||
      (await sha(expanded)) !== receipt.logicalSha256
    )
      throw new Error("The reconstructed published plan failed its checksum.");
  } else plan = parsed as PublishedVisitorPlan;
  if (
    plan.format !== "openindoormaps-visitor-plan-v1" ||
    plan.version !== 1 ||
    plan.revisionSha256 !== receipt.revisionSha256 ||
    plan.engineSha256 !== receipt.engineSha256 ||
    plan.datasetSha256 !== receipt.datasetSha256 ||
    plan.scopeId !== receipt.scopeId ||
    plan.bindingSha256 !== receipt.bindingSha256 ||
    plan.pooledJsonSha256 !== receipt.pooledJsonSha256 ||
    JSON.stringify(plan.levelIds) !== JSON.stringify(scope.levelIds) ||
    !plan.display ||
    typeof plan.display.nativeIndoorEnvelopes !== "boolean" ||
    typeof plan.display.nativeMaterialSections !== "boolean" ||
    !["native", "simplified", null].includes(plan.display.windowMode) ||
    !plan.layers ||
    Object.keys(plan.layers).length !== layerKeys.length ||
    layerKeys.some((key) => {
      const v = plan.layers[key as keyof typeof plan.layers];
      return !v || v.type !== "FeatureCollection" || !Array.isArray(v.features);
    }) ||
    (plan.native !== undefined &&
      (!plan.native ||
        !Array.isArray(plan.native.regions) ||
        plan.native.regions.some(
          (r) =>
            !r ||
            typeof r.id !== "string" ||
            !scope.levelIds.includes(r.levelId) ||
            !Array.isArray(r.roomKeys) ||
            r.roomKeys.some((key) => typeof key !== "string"),
        ) ||
        (
          ["fills", "overview", "outlines", "partitions", "walls"] as const
        ).some((key) => {
          const v = plan.native![key];
          return (
            !v || v.type !== "FeatureCollection" || !Array.isArray(v.features)
          );
        })))
  )
    throw new Error("The published plan differs from its checked floor.");
  options.signal?.throwIfAborted();
  await cache
    ?.putAsset(
      compressed ? receipt.compressedSha256 : wireLogicalSha256,
      stored!,
    )
    .catch(() => {});
  return plan;
}
