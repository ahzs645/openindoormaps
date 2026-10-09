import type { IndoorDataset, IndoorRecord } from "./contract";
import type { NativeAreaRegion } from "./native-area-review";
import { pointInNativeArea } from "./native-area-review";
import { nativeSelectionBoolean } from "./native-selection-boolean";
import { nativeIndoorEnvelopeParts } from "./native-indoor-envelopes";

type Rings = [number, number][][];
const area = (rings: Rings) => {
  const ring = (r: [number, number][]) =>
    Math.abs(
      r.reduce((n, p, i) => {
        const q = r[(i + 1) % r.length];
        return n + p[0] * q[1] - q[0] * p[1];
      }, 0),
    ) / 2;
  return Math.max(
    0,
    ring(rings[0]) - rings.slice(1).reduce((n, r) => n + ring(r), 0),
  );
};
export const NATIVE_STAIR_LANDING_ASSOCIATION_VERSION =
  "native-stair-landing-identity-v2";
/** A source stair endpoint owns a flat landing face. This is metadata identity,
 * not a complete flight-body certificate or permission to add a route. */
export function nativeStairLandingAssociation(
  data: IndoorDataset,
  room: IndoorRecord,
  regions: readonly NativeAreaRegion[],
) {
  if (
    !room.stair ||
    !room.walkable ||
    !data.nativeIndoorEnvelopes ||
    data.walkingSupport?.sourceModelSha256 !== data.source.modelSha256 ||
    data.stairDisplay?.sourceModelSha256 !== data.source.modelSha256
  )
    return;
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const ownedFlight = (id: number) => {
    const flights = data.stairDisplay!.sourceFlights?.filter(
      (f) => f.stairElementId === id,
    );
    if (flights?.length !== 1) return false;
    const f = flights[0],
      runs = new Set(f.treads.map((t) => t.runElementId));
    return (
      f.levelIds.includes(room.levelId) &&
      f.context !== "outdoor" &&
      f.context !== "tiered-seating" &&
      runs.size > 0 &&
      [...runs].every((r) => Number.isSafeInteger(r) && r > 0) &&
      !data.stairDisplay!.sourceFlights?.some(
        (other) =>
          other.stairElementId !== id &&
          other.treads.some((t) => runs.has(t.runElementId)),
      )
    );
  };
  const endpoints = data.edges
    .filter(
      (e) =>
        e.enabled &&
        e.kind === "stairs" &&
        e.evidence === "native-flight" &&
        e.accessible === "no" &&
        e.roomKeys.includes(room.key) &&
        e.nativeElementId &&
        ownedFlight(e.nativeElementId),
    )
    .flatMap((e) =>
      [e.from, e.to].flatMap((id, i) => {
        const n = nodes.get(id),
          p = e.pointsFeet[i === 0 ? 0 : e.pointsFeet.length - 1];
        return n &&
          p &&
          n.kind === "stair" &&
          n.roomKey === room.key &&
          n.levelId === room.levelId &&
          n.pointFeet[2] === room.elevationFeet &&
          n.pointFeet.every((v, j) => v === p[j])
          ? [n]
          : [];
      }),
    );
  if (!endpoints.length) return;
  const envelope = nativeIndoorEnvelopeParts(
    data.nativeIndoorEnvelopes,
    data.source.modelSha256,
    room.elevationFeet,
  );
  const matches: {
    index: number;
    coverage: number;
    labelPointFeet: [number, number];
  }[] = [];
  for (const [index, face] of regions.entries()) {
    const inFace = endpoints.filter((n) =>
      pointInNativeArea([n.pointFeet[0], n.pointFeet[1]], face.ringsFeet),
    );
    const endpoint = inFace[0];
    // An original terminal identifies its own landing, never a face joining
    // distinct terminals or another destination/circulation branch.
    if (
      new Set(inFace.map((n) => JSON.stringify(n.pointFeet))).size !== 1 ||
      data.nodes.some(
        (n) =>
          n.roomKey !== room.key &&
          n.pointFeet[2] === room.elevationFeet &&
          pointInNativeArea([n.pointFeet[0], n.pointFeet[1]], face.ringsFeet),
      )
    )
      continue;
    if (!endpoint || !face.nativeFloorIds.length || !area(face.ringsFeet))
      continue;
    const floor = data.walkingSupport.floors
      .filter(
        (f) =>
          face.nativeFloorIds.includes(f.nativeElementId) &&
          f.elevationFeet === endpoint.pointFeet[2],
      )
      .flatMap((f) => f.partsFeet ?? [f.ringsFeet]);
    if (!floor.length || !envelope.length) continue;
    try {
      // Preserve the original slab holes and positive native enclosure. A
      // staircase label never admits an unenclosed or unsupported face.
      if (
        nativeSelectionBoolean("difference", [face.ringsFeet], floor).length ||
        nativeSelectionBoolean("difference", [face.ringsFeet], envelope).length
      )
        continue;
      const overlap = nativeSelectionBoolean(
        "intersection",
        [face.ringsFeet],
        [room.ringsFeet],
      ).reduce((n, r) => n + area(r), 0);
      const coverage = Math.min(1, overlap / area(face.ringsFeet));
      const otherNamedOwner = data.records.some(
        (r) =>
          r.key !== room.key &&
          r.levelId === room.levelId &&
          (r.stair || !!r.number.trim()) &&
          nativeSelectionBoolean(
            "intersection",
            [face.ringsFeet],
            [r.ringsFeet],
          ).reduce((n, part) => n + area(part), 0) /
            area(face.ringsFeet) >
            0.5 + 1e-8,
      );
      if (!otherNamedOwner)
        matches.push({
          index,
          coverage,
          labelPointFeet: [endpoint.pointFeet[0], endpoint.pointFeet[1]],
        });
    } catch {
      /* An unresolved exact source intersection supplies no identity. */
    }
  }
  // Different original endpoints cannot silently merge two landing faces.
  return matches.length === 1 ? matches[0] : undefined;
}

/** Physical terminal/edge preservation is checked separately from room count.
 * This guard never upgrades legacy flight evidence or changes access policy. */
export function nativeStairLandingLinksPreserved(
  before: IndoorDataset,
  after: IndoorDataset,
  roomKey: string,
) {
  const a = before.records.find((r) => r.key === roomKey),
    b = after.records.find((r) => r.key === roomKey);
  if (
    !a?.stair ||
    !b?.stair ||
    before.source.modelSha256 !== after.source.modelSha256 ||
    [
      "key",
      "number",
      "name",
      "levelId",
      "elevationFeet",
      "access",
      "walkable",
    ].some((k) => a[k as keyof IndoorRecord] !== b[k as keyof IndoorRecord])
  )
    return false;
  const fields = (e: IndoorDataset["edges"][number]) => [
    e.id,
    e.nativeElementId,
    e.from,
    e.to,
    e.kind,
    e.enabled,
    e.accessible,
    e.evidence,
    e.roomKeys,
    e.pointsFeet,
    e.direction,
  ];
  const edges = before.edges.filter(
    (e) =>
      e.enabled &&
      e.kind === "stairs" &&
      e.evidence === "native-flight" &&
      e.nativeElementId &&
      e.roomKeys.includes(roomKey),
  );
  if (!edges.length) return false;
  return edges.every((e) => {
    const current = after.edges.find((c) => c.id === e.id);
    return (
      current &&
      JSON.stringify(fields(e)) === JSON.stringify(fields(current)) &&
      [e.from, e.to].every((id) => {
        const n = before.nodes.find((n) => n.id === id),
          m = after.nodes.find((n) => n.id === id);
        return (
          n &&
          m &&
          JSON.stringify([
            n.id,
            n.kind,
            n.roomKey,
            n.levelId,
            n.pointFeet,
            n.building,
            n.surfaceId,
          ]) ===
            JSON.stringify([
              m.id,
              m.kind,
              m.roomKey,
              m.levelId,
              m.pointFeet,
              m.building,
              m.surfaceId,
            ])
        );
      })
    );
  });
}
