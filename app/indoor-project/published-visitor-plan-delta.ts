/** Lossless drawing transport only. Each reference addresses one exact feature
 * in a separately checked full plan from the same publication. */
import type { FeatureCollection, Feature } from "geojson";
import type { PublishedVisitorPlan } from "./published-visitor-plan-types";
type Reference = { ref: number } | { feature: Feature };
type CollectionWire = Omit<FeatureCollection, "features"> & {
  features: Reference[];
};
export type PublishedVisitorPlanDelta = {
  format: "openindoormaps-visitor-plan-feature-delta-v1";
  version: 1;
  baseScopeId: string;
  baseLogicalSha256: string;
  value: Omit<PublishedVisitorPlan, "layers" | "native"> & {
    layers: Record<keyof PublishedVisitorPlan["layers"], CollectionWire>;
    native?: Omit<
      NonNullable<PublishedVisitorPlan["native"]>,
      "fills" | "overview" | "outlines" | "partitions" | "walls"
    > &
      Record<
        "fills" | "overview" | "outlines" | "partitions" | "walls",
        CollectionWire
      >;
  };
};
export function encodePublishedVisitorPlanDelta(
  plan: PublishedVisitorPlan,
  base: PublishedVisitorPlan,
  baseLogicalSha256: string,
): PublishedVisitorPlanDelta {
  const encode = (
    value: FeatureCollection,
    other: FeatureCollection | undefined,
  ): CollectionWire => {
    const indices = new Map(
      (other?.features ?? []).map((f, i) => [JSON.stringify(f), i]),
    );
    return {
      ...value,
      features: value.features.map((f) => {
        const ref = indices.get(JSON.stringify(f));
        return ref === undefined ? { feature: f } : { ref };
      }),
    };
  };
  const native = plan.native;
  const result: PublishedVisitorPlanDelta = {
    format: "openindoormaps-visitor-plan-feature-delta-v1",
    version: 1,
    baseScopeId: base.scopeId,
    baseLogicalSha256,
    value: {
      ...plan,
      layers: Object.fromEntries(
        Object.entries(plan.layers).map(([key, value]) => [
          key,
          encode(value, base.layers[key as keyof typeof base.layers]),
        ]),
      ) as PublishedVisitorPlanDelta["value"]["layers"],
      native: native
        ? {
            ...native,
            fills: encode(native.fills, base.native?.fills),
            overview: encode(native.overview, base.native?.overview),
            outlines: encode(native.outlines, base.native?.outlines),
            partitions: encode(native.partitions, base.native?.partitions),
            walls: encode(native.walls, base.native?.walls),
          }
        : undefined,
    },
  };
  if (!native) delete result.value.native;
  return result;
}
export function restorePublishedVisitorPlanDelta(
  wire: PublishedVisitorPlanDelta,
  base: PublishedVisitorPlan,
  baseLogicalSha256: string,
): PublishedVisitorPlan {
  if (
    wire.format !== "openindoormaps-visitor-plan-feature-delta-v1" ||
    wire.version !== 1 ||
    wire.baseScopeId !== base.scopeId ||
    wire.baseLogicalSha256 !== baseLogicalSha256 ||
    !wire.value ||
    wire.value.revisionSha256 !== base.revisionSha256 ||
    wire.value.engineSha256 !== base.engineSha256 ||
    wire.value.datasetSha256 !== base.datasetSha256
  )
    throw new Error("The plan delta differs from its checked base.");
  let count = 0;
  const restore = (
    value: CollectionWire,
    other: FeatureCollection | undefined,
  ): FeatureCollection => {
    if (
      !value ||
      value.type !== "FeatureCollection" ||
      !Array.isArray(value.features)
    )
      throw new Error("Invalid published plan delta collection.");
    return {
      ...value,
      features: value.features.map((token) => {
        if (++count > 2_000_000 || !token || Object.keys(token).length !== 1)
          throw new Error("Invalid published plan delta reference.");
        if (Object.hasOwn(token, "ref")) {
          const i = (token as { ref: number }).ref;
          if (!Number.isSafeInteger(i) || i < 0 || !other?.features[i])
            throw new Error(
              "Published plan delta reference is outside its base.",
            );
          return other.features[i];
        }
        const f = (token as { feature: Feature }).feature;
        if (!f || f.type !== "Feature" || !f.geometry)
          throw new Error("Invalid published plan delta feature.");
        return f;
      }),
    };
  };
  const plan = wire.value;
  const native = plan.native;
  const result: PublishedVisitorPlan = {
    ...plan,
    layers: Object.fromEntries(
      Object.entries(plan.layers).map(([key, value]) => [
        key,
        restore(value, base.layers[key as keyof typeof base.layers]),
      ]),
    ) as PublishedVisitorPlan["layers"],
    native: native
      ? {
          ...native,
          fills: restore(native.fills, base.native?.fills),
          overview: restore(native.overview, base.native?.overview),
          outlines: restore(native.outlines, base.native?.outlines),
          partitions: restore(native.partitions, base.native?.partitions),
          walls: restore(native.walls, base.native?.walls),
        }
      : undefined,
  };
  if (!native) delete result.native;
  return result;
}
