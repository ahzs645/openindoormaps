import type {
  IndoorDataset,
  IndoorEdge,
  IndoorNode,
  IndoorRecord,
} from "./contract";
import { reviewedRotundaPassage } from "./reviewed-rotunda-role";
import { validatedNativeRampSurface } from "./native-ramp-surface";
import { rotundaRampRimNormal } from "./rotunda-ramp-rim";
import { corridorGuideLength } from "./shared-corridor-guides";
import type { PreparedRouting } from "./prepared-routing";

type Guide = PreparedRouting["guides"][number];
type XYZ = IndoorNode["pointFeet"];
const upperCell = "native-cell:3.280840:383",
  lowerCell = "native-cell:0.000000:99",
  lift = "connector:unbc-04-lift:0",
  groundDoor = "door:311:1591013:1";
const upperHeight = 3.2808398950131235;
const upperPeer = upperCell + ":walk:" + lift + "|door:1487816:1026477:0",
  lowerPeer = lowerCell + ":walk:door:311:1032260:1|" + groundDoor;
const reviews = new Map([
  [
    upperCell + ":walk:" + lift + "|ramp:1586431:upper",
    {
      id: 1586431,
      side: "upper",
      cell: upperCell,
      peer: lift,
      peerGuide: upperPeer,
    },
  ],
  [
    upperCell + ":walk:" + lift + "|ramp:1587605:upper",
    {
      id: 1587605,
      side: "upper",
      cell: upperCell,
      peer: lift,
      peerGuide: upperPeer,
    },
  ],
  [
    lowerCell + ":walk:" + groundDoor + "|ramp:1587605:lower",
    {
      id: 1587605,
      side: "lower",
      cell: lowerCell,
      peer: groundDoor,
      peerGuide: lowerPeer,
    },
  ],
] as const);
export const isRotundaRampApproach = (edge: IndoorEdge) => reviews.has(edge.id);
const same = (p: XYZ, q?: XYZ) => !!q && p.every((v, i) => v === q[i]);
/** Directory floor and physical floor disagree at the two upper landings.
 * Bind each exception to the actual source ramp, its two-foot native ramp
 * surface and original slab rim. Never join nodes solely by equal elevation. */
export function reviewedRampLanding(
  data: IndoorDataset,
  edge: IndoorEdge,
  a: IndoorNode,
  b: IndoorNode,
  records: ReadonlyMap<string, IndoorRecord>,
) {
  const review = reviews.get(edge.id);
  if (
    !review ||
    edge.kind !== "walk" ||
    !edge.enabled ||
    edge.accessible === "yes" ||
    edge.nativeCellId !== review.cell
  )
    return undefined;
  const room = records.get("rm-311-2054e6ddb852");
  if (!room || !reviewedRotundaPassage(data, room)) return undefined;
  const upper = review.side === "upper",
    z = upper ? upperHeight : 0,
    slab = upper ? 1582103 : 423406,
    physicalLevel = upper ? 1487816 : 311;
  const tipId = "ramp:" + review.id + ":" + review.side,
    tip = a.id === tipId ? a : b,
    peer = tip === a ? b : a;
  if (
    tip.id !== tipId ||
    peer.id !== review.peer ||
    tip.levelId !== physicalLevel ||
    peer.levelId !== 311 ||
    tip.roomKey !==
      (upper ? "landing:ramp:1586431:upper" : "landing:ramp:1587605:lower") ||
    peer.roomKey !== (upper ? room.key : "rm-311-df4c89e6b168")
  )
    return undefined;
  const landing = records.get(tip.roomKey);
  if (
    !landing?.walkable ||
    !landing.circulation ||
    landing.access === "staff" ||
    ![a, b].every(
      (n, i) =>
        n.pointFeet[2] === z &&
        edge.roomKeys.includes(n.roomKey) &&
        same(n.pointFeet, edge.pointsFeet[i ? edge.pointsFeet.length - 1 : 0]),
    ) ||
    !edge.pointsFeet.every((p) => p[2] === z)
  )
    return undefined;
  const cell = data.circulationGeometry?.cells.find(
      (c) => c.id === review.cell,
    ),
    native = data.nativePhysicalLevels?.levels.find(
      (l) => l.nativeLevelId === physicalLevel,
    );
  if (
    !cell ||
    !cell.exactFaceId ||
    cell.elevationFeet !== z ||
    ![311, physicalLevel].every((id) => cell.levelIds.includes(id)) ||
    ![a, b].every((n) => cell.roomKeys.includes(n.roomKey)) ||
    !cell.nativeFloorIds.includes(slab) ||
    native?.elevationFeet !== z ||
    !native.nativeFloorElementIds.includes(slab)
  )
    return undefined;
  const ramp = data.edges.find((e) => e.id === "ramp:" + review.id);
  if (
    !ramp?.enabled ||
    ramp.nativeElementId !== review.id ||
    ramp[upper ? "to" : "from"] !== tip.id ||
    !same(
      tip.pointFeet,
      ramp.pointsFeet[upper ? ramp.pointsFeet.length - 1 : 0],
    ) ||
    !validatedNativeRampSurface(data, ramp)
  )
    return undefined;
  const normal = rotundaRampRimNormal(data, ramp, review.side);
  if (normal) return { review, normal, tip, peer };
}

/** The ramp's finite cap sets its exit direction. Preserve its far station
 * from a verified neighboring guide and replay each proposed straight run. */
export function reviewedRampLandingGuide(
  edge: IndoorEdge,
  landing: NonNullable<ReturnType<typeof reviewedRampLanding>>,
  existing: Guide[],
  replay: (edge: IndoorEdge, g: Guide) => boolean,
) {
  const { review, tip, peer, normal } = landing;
  const reference = existing.find((g) => g.edgeId === review.peerGuide);
  if (!reference?.hallwayJoins) return undefined;
  const points = reference.pointsFeet;
  const atStart = same(points[0], peer.pointFeet);
  if (!atStart && !same(points.at(-1)!, peer.pointFeet)) return undefined;
  const [a, b] = reference.hallwayJoins;
  const back = atStart ? points.slice(0, a + 1).toReversed() : points.slice(b);
  const candidates: Guide[] = [];
  const along = (feet: number): XYZ => [
    tip.pointFeet[0] + feet * normal[0],
    tip.pointFeet[1] + feet * normal[1],
    tip.pointFeet[2],
  ];
  for (const run of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
    const path = [
      tip.pointFeet,
      along(1),
      ...(run === 1 ? [] : [along(run)]),
      ...back,
    ];
    const joins: [number, number] = [1, path.length - back.length];
    const backwards = edge.from !== tip.id;
    candidates.push({
      edgeId: edge.id,
      kind: "shared-corridor",
      pointsFeet: backwards ? path.toReversed() : path,
      hallwayJoins: backwards
        ? [path.length - 1 - joins[1], path.length - 1 - joins[0]]
        : joins,
    });
  }
  return candidates
    .sort(
      (a, b) =>
        corridorGuideLength(a.pointsFeet) - corridorGuideLength(b.pointsFeet),
    )
    .find((g) => replay(edge, g));
}
