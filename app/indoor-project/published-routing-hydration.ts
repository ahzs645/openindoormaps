/** Internal decoder for publisher-pinned, normally validated routing results.
 * This module is not an admission boundary. Only published-route-cells invokes
 * it after exact source, carrier, runtime and compiled allowlist admission.
 * Unlisted topology continues through createNativeExactTopologyIndex. */
import type {
  NativeExactPlanarBinding,
  NativeExactPlanarTopology,
  NativeExactTopologyIndex,
} from "./native-exact-planar-topology";
import {
  Rational,
  type NativeRationalParts,
  type NativeRationalPoint,
} from "./native-rational-overlay";
import {
  createNativeRoutingMaterialQuery,
  type NativeRoutingMaterial,
} from "./native-routing-material";
import type { IndoorDataset } from "./contract";
import type { PublishedSupportTiles } from "./published-support-tiles";
import type { NativeAccessZoneBinding } from "./native-access-zones";
export type PublishedAccessZoneBinding = {
  zoneIds: string[];
  issues: NativeAccessZoneBinding["issues"];
  topology: NativeExactPlanarTopology;
};

type MaterialWire = Omit<
  NativeRoutingMaterial,
  | "known"
  | "present"
  | "censusOmissionSupplementIds"
  | "fenestrationIds"
  | "assemblies"
> & {
  known: number[];
  present: number[];
  censusOmissionSupplementIds: number[];
  fenestrationIds: number[];
  assemblies: [number, { childIds: number[]; doorIds: number[] }][];
};
export type PublishedRoutingHydration = {
  version: 1;
  runtimeSha256: string;
  policySnapshot: string;
  /** Exact normal helper results for this already matched immutable dataset. */
  preparedRoutingKey?: string;
  resolvedRouteGeometryKey?: string;
  supportTiles?: PublishedSupportTiles;
  accessZones?: PublishedAccessZoneBinding;
  materials: { z: number; cut: number; value: MaterialWire }[];
};
/** Only accepted original restricted-zone geometry is restored. The zone and
 * its access/members remain the exact source object; no wire approval flag or
 * replacement access declaration can confer authority. Caller admission is
 * the same private compiled-carrier boundary as all other hydrated geometry.
 */
export function hydratePublishedAccessZones(
  data: IndoorDataset,
  value: PublishedAccessZoneBinding,
  expected: NativeExactPlanarBinding,
): NativeAccessZoneBinding {
  if (
    !Array.isArray(value.zoneIds) ||
    value.zoneIds.length > 1000 ||
    new Set(value.zoneIds).size !== value.zoneIds.length ||
    !Array.isArray(value.issues) ||
    value.issues.length > 1000 ||
    value.issues.some(
      (i) =>
        typeof i.zoneId !== "string" ||
        typeof i.reason !== "string" ||
        i.zoneId.length > 1024 ||
        i.reason.length > 16_384,
    ) ||
    value.topology.sourceModelSha256 !== expected.sourceModelSha256 ||
    value.topology.sourceGeometryKey !== expected.sourceGeometryKey ||
    value.topology.kernelVersion !== expected.kernelVersion
  )
    throw new Error("Invalid published access-zone geometry binding");
  const index = hydratePublishedTopology(value.topology),
    source = new Map(data.nativeAccessZones?.zones.map((z) => [z.id, z]) ?? []),
    remaining = new Set(index.ids());
  const zones = value.zoneIds.map((id) => {
    const zone = source.get(id),
      parts = index.parts(id);
    if (!zone || !parts || !remaining.delete(id))
      throw new Error("Published access zone does not match its source");
    return Object.freeze({ zone, parts });
  });
  if (remaining.size > 0)
    throw new Error("Unlisted published access-zone geometry");
  return { zones, issues: value.issues.map((i) => ({ ...i })) };
}
export function materialWire(value: NativeRoutingMaterial): MaterialWire {
  return {
    ...value,
    known: [...value.known],
    present: [...value.present],
    censusOmissionSupplementIds: [...value.censusOmissionSupplementIds],
    fenestrationIds: [...value.fenestrationIds],
    assemblies: [...value.assemblies],
  };
}
export function hydratePublishedMaterials(
  data: IndoorDataset,
  rows: PublishedRoutingHydration["materials"],
) {
  const values = new Map<string, NativeRoutingMaterial>();
  const ints = (v: unknown): v is number[] =>
    Array.isArray(v) &&
    v.every(Number.isSafeInteger) &&
    new Set(v).size === v.length;
  const rings = (v: unknown): boolean =>
    Array.isArray(v) &&
    v.every(
      (r) =>
        Array.isArray(r) &&
        r.length >= 3 &&
        r.every(
          (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
        ),
    );
  for (const { z, cut, value: v } of rows) {
    const key = JSON.stringify([z, cut]);
    if (
      !Number.isFinite(z) ||
      !Number.isFinite(cut) ||
      values.has(key) ||
      !ints(v.known) ||
      !ints(v.present) ||
      !ints(v.censusOmissionSupplementIds) ||
      !ints(v.fenestrationIds) ||
      !Array.isArray(v.parts) ||
      v.parts.some(
        (p) =>
          !Number.isSafeInteger(p.nativeElementId) ||
          typeof p.column !== "boolean" ||
          !rings(p.rings) ||
          (p.positiveSubsetOnly !== undefined && p.positiveSubsetOnly !== true),
      ) ||
      (v.derivedParts !== undefined &&
        (!Array.isArray(v.derivedParts) || !v.derivedParts.every(rings))) ||
      !Array.isArray(v.assemblies) ||
      v.assemblies.some(
        ([id, a]) =>
          !Number.isSafeInteger(id) || !ints(a.childIds) || !ints(a.doorIds),
      )
    )
      throw new Error("Invalid published routing material snapshot");
    values.set(key, {
      ...v,
      known: new Set(v.known),
      present: new Set(v.present),
      censusOmissionSupplementIds: new Set(v.censusOmissionSupplementIds),
      fenestrationIds: new Set(v.fenestrationIds),
      assemblies: new Map(v.assemblies),
    });
  }
  let ordinary: ReturnType<typeof createNativeRoutingMaterialQuery> | undefined;
  // New/unlisted cuts retain the unchanged material validator. No floor or route
  // is omitted to obtain the startup improvement.
  return (z: number, cut = z + 0.1) =>
    values.get(JSON.stringify([z, cut])) ??
    (ordinary ??= createNativeRoutingMaterialQuery(data))(z, cut);
}
/** Preserve canonical rational values and all original owners/holes. Geometric
 * validation happened in the normal publisher, before compiled admission.
 * Bounds and representation checks still prevent accidental allocation errors. */
export function hydratePublishedTopology(
  value: NativeExactPlanarTopology,
): NativeExactTopologyIndex {
  if (
    value.version !== 1 ||
    value.coordinates.length > 500_000 ||
    value.faces.length > 100_000
  )
    throw new Error("Invalid published exact topology inventory");
  let scalarChars = 0,
    indices = 0;
  const scalar = (pair: [string, string]) => {
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      !/^(0|-?[1-9][0-9]*)$/.test(pair[0]) ||
      !/^[1-9][0-9]*$/.test(pair[1]) ||
      pair.some((s) => s.length > 4096) ||
      (scalarChars += pair[0].length + pair[1].length) > 64 * 1024 * 1024
    )
      throw new Error("Invalid published rational coordinate");
    const q = new Rational(BigInt(pair[0]), BigInt(pair[1]));
    if (
      String(q.n) !== pair[0] ||
      String(q.d) !== pair[1] ||
      q.n < -10_000_000n * q.d ||
      q.n > 10_000_000n * q.d
    )
      throw new Error("Noncanonical published rational coordinate");
    return Object.freeze(q);
  };
  const coordinates = value.coordinates.map(
    (p) => Object.freeze([scalar(p.x), scalar(p.y)]) as NativeRationalPoint,
  );
  const faces = new Map<string, NativeRationalParts>();
  for (const face of value.faces) {
    if (!face.id || faces.has(face.id) || face.parts.length === 0)
      throw new Error("Invalid published exact face");
    const parts = face.parts.map((part) => {
      if (part.length === 0) throw new Error("Invalid published exact polygon");
      return Object.freeze(
        part.map((ring) => {
          if (
            ring.length < 3 ||
            (indices += ring.length) > 2_000_000 ||
            ring.some((i) => !Number.isSafeInteger(i) || !coordinates[i])
          )
            throw new Error("Invalid published exact indices");
          return Object.freeze(
            ring.map((i) => coordinates[i]),
          ) as NativeRationalPoint[];
        }),
      ) as NativeRationalPoint[][];
    });
    faces.set(face.id, Object.freeze(parts) as NativeRationalParts);
  }
  const ids = Object.freeze([...faces.keys()]);
  return Object.freeze({
    binding: Object.freeze({
      sourceModelSha256: value.sourceModelSha256,
      sourceGeometryKey: value.sourceGeometryKey,
      kernelVersion: value.kernelVersion,
    }),
    geometrySha256: value.geometrySha256,
    parts: (id: string) => faces.get(id),
    ids: () => ids,
  });
}
