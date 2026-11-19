import type { IndoorDataset, IndoorEdge } from "./contract";
import type { RoutePath } from "./viewer-centered-route";
import {
  createCorridorGuideSupport,
  createTwoFootCorridorSupport,
} from "./corridor-guide-support";
import { nativeCirculationExactCellParts } from "./native-circulation";
import { createNativeDoorApproachQuery } from "./native-door-approach";
import { nativeDoorClearOpening } from "./native-door-clear-opening";
import { createNativeTransitRefinementPolicy } from "./native-walk-transit-owners";
import { createDoorPassageQuery } from "./route-passages";
import { nativeRationalOverlay } from "./native-rational-overlay";
import { routingCalculationValue } from "./routing-cache";
import * as DMath from "./deterministic-math";

type XY = [number, number];
type XYZ = [number, number, number];
const xy = (p: XYZ): XY => [p[0], p[1]];
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const minus = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const dist = (a: XY, b: XY) => DMath.hypot(a[0] - b[0], a[1] - b[1]);
const same = (a: XYZ, b: XYZ) => a.every((v, i) => v === b[i]);
// The previous centered leg can differ from its source anchor by a few ULPs.
// This recognizes the native dependency only; every proposed point and strip
// is still checked against the unexpanded exact floor and aperture geometry.
const sourceAnchor = (a: XYZ, b: XYZ) =>
  a.every(
    (v, i) =>
      Math.abs(v - b[i]) <=
      32 * Number.EPSILON * Math.max(1, Math.abs(v), Math.abs(b[i])),
  );
const length = (parts: XY[][]) =>
  parts.reduce(
    (n, p) => n + p.slice(1).reduce((s, b, i) => s + dist(p[i], b), 0),
    0,
  );

export type RoomCenterAttachment = {
  roomKey: string;
  role: "departure" | "arrival";
  mappedPointFeet: XYZ;
  centerPointFeet: XYZ;
  attachmentMetres: number;
};
type Gate = { id: string; normal: XY; center: XY; ring: XY[] };

/** Middle of the common jamb interval measured perpendicular to the mean
 * native door normal. Proposal only. Every accepted strip is replayed. */
export function commonDoorCenter(gates: Gate[]) {
  const ordered = [...gates].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const normalized = ordered.map((g) => {
    const magnitude = DMath.hypot(...g.normal);
    return [g.normal[0] / magnitude, g.normal[1] / magnitude] as XY;
  });
  const agreement = dot(normalized[0], normalized[1]);
  if (!Number.isFinite(agreement) || Math.abs(agreement) < 0.999) return;
  const n: XY = [
    normalized[0][0] + Math.sign(agreement) * normalized[1][0],
    normalized[0][1] + Math.sign(agreement) * normalized[1][1],
  ];
  const m = DMath.hypot(...n);
  const u: XY = [n[0] / m, n[1] / m],
    t: XY = [u[1], -u[0]];
  const origin = ordered[0].center;
  const spans = ordered.map((g) => g.ring.map((p) => dot(minus(p, origin), t)));
  const low = Math.max(...spans.map((vals) => Math.min(...vals))),
    high = Math.min(...spans.map((vals) => Math.max(...vals)));
  const width = high - low;
  if (!(width >= 2)) return;
  const middle = (high + low) / 2;
  const base: XY = [origin[0] + middle * t[0], origin[1] + middle * t[1]];
  const station = (p: XY): XY => {
    const along = dot(minus(p, base), u);
    return [base[0] + along * u[0], base[1] + along * u[1]];
  };
  const atGate = (p: XY, normal: XY): XY => {
    const along = dot(minus(p, base), normal) / dot(u, normal);
    return [base[0] + along * u[0], base[1] + along * u[1]];
  };
  return { width, station, atGate, along: (p: XY) => dot(minus(p, base), u) };
}

export function centeredDoorCandidate(points: XY[][], gates: Gate[]) {
  const line = commonDoorCenter(gates);
  if (!line) return;
  const sources = [points[0].at(-2)!, points[4][1]];
  const stations = sources.map(line.station);
  if (sources.some((p, i) => dist(p, stations[i]) > line.width / 2)) return;
  const refs = [...points[1], ...points[3]];
  const [a, b, c, d] = refs.map((p, i) =>
    line.atGate(p, gates[Math.floor(i / 2)].normal),
  );
  if (refs.some((p, i) => dist(p, [a, b, c, d][i]) > 1)) return;
  const progression = [stations[0], a, b, c, d, stations[1]].map(line.along);
  const direction = Math.sign(progression[4] - progression[1]);
  if (
    !direction ||
    progression.some(
      (v, i) => i > 0 && (v - progression[i - 1]) * direction <= 0,
    )
  )
    return;
  const first = points[0],
    last = points[4];
  const leg0 =
    first.length === 2
      ? [first[0], stations[0], a]
      : [...first.slice(0, -2), stations[0], a];
  const leg4 =
    last.length === 2
      ? [d, stations[1], last[1]]
      : [d, stations[1], ...last.slice(2)];
  const legs = [leg0, [a, b], [b, c], [c, d], leg4].map((ps) =>
    ps.filter((p, i) => !i || p.some((q, k) => q !== ps[i - 1][k])),
  );
  if (legs.some((part) => part.length < 2)) return;
  return { legs, stations, sources, score: length(legs), width: line.width };
}

/** Numerical shape proposals only. Callers must replay native floor, aperture
 * body, source passage order/direction and ordinary-room transit checks. */
export function pairedDoorCandidates(
  points: XY[][],
  gates: Gate[],
  atPlace: boolean[],
) {
  const refs = [...points[1], ...points[3]];
  const normals = gates.map((g) => g.normal);
  const norm = normals.map((n) => DMath.hypot(...n));
  if (
    norm.some((n) => !n) ||
    Math.abs(dot(normals[0], normals[1])) / (norm[0] * norm[1]) < 0.98
  )
    return [];

  const outer = [points[0].at(-2)!, points[4][1]];
  const mids = gates.map((g) => g.center);
  const span = dist(mids[0], mids[1]);
  if (
    span <= 1 ||
    Math.abs(dot(minus(mids[1], mids[0]), normals[0])) / (span * norm[0]) < 0.95
  )
    return [];
  // Canonicalize gate order for the floating proposal, including reversal.
  const axes: { a: XY; b: XY; start: boolean; end: boolean }[] = [];
  const add = (a: XY, b: XY, start = false, end = false) =>
    axes.push({ a, b, start, end });
  add(outer[0], outer[1], true, true);
  for (const j of [0, 1]) {
    const ring = gates[j].ring;
    const t: XY = [-normals[j][1] / norm[j], normals[j][0] / norm[j]];
    const offsets = ring
      .map((p) => dot(minus(p, mids[j]), t))
      .sort((a, b) => a - b);
    // Candidate offsets retain a one-foot half width on either jamb.
    for (const x of [0, 0.9 * (offsets[0] + 1), 0.9 * (offsets.at(-1)! - 1)]) {
      const target: XY = [mids[j][0] + t[0] * x, mids[j][1] + t[1] * x];
      if (j === 0) add(target, outer[1], false, true);
      else add(outer[0], target, true, false);
    }
  }
  add(mids[0], mids[1]);
  const proposals: {
    legs: XY[][];
    score: number;
    walkTurns: number;
    reachesPlace: boolean;
  }[] = [];
  for (const axis of axes) {
    const reverse = gates[0].id > gates[1].id;
    const base = reverse ? axis.b : axis.a,
      far = reverse ? axis.a : axis.b;
    const direction = minus(far, base),
      magnitude = DMath.hypot(...direction);
    if (!magnitude) continue;
    const u: XY = [direction[0] / magnitude, direction[1] / magnitude];
    const sign = reverse ? -1 : 1;
    const ts = refs.map((q, j) => {
      const n = normals[j < 2 ? 0 : 1];
      return dot(minus(q, base), n) / dot(u, n);
    });
    if (
      ts.some(
        (v, j) => !Number.isFinite(v) || (j > 0 && sign * (v - ts[j - 1]) <= 0),
      )
    )
      continue;
    const at = (v: number): XY => [base[0] + u[0] * v, base[1] + u[1] * v];
    const [a, b, c, e] = ts.map(at);
    // Keep a one-foot lead on the common line outside each gate, unless
    // that line already reaches the adjoining fixed walking waypoint.
    if (refs.some((q, j) => dist(q, [a, b, c, e][j]) > 1)) continue;
    const approach = axis.start ? [] : [at(ts[0] - sign)];
    const exit = axis.end ? [] : [at(ts[3] + sign)];
    if (
      (approach.length > 0 && dist(outer[0], a) <= 1) ||
      (exit.length > 0 && dist(outer[1], e) <= 1)
    )
      continue;
    const legs = [
      [...points[0].slice(0, -1), ...approach, a],
      [a, b],
      [b, c],
      [c, e],
      [e, ...exit, ...points[4].slice(1)],
    ];
    proposals.push({
      legs,
      score: length(legs),
      walkTurns: approach.length + exit.length,
      reachesPlace: (axis.start && atPlace[0]) || (axis.end && atPlace[1]),
    });
  }
  proposals.sort(
    (a, b) =>
      a.walkTurns - b.walkTurns ||
      Number(b.reachesPlace) - Number(a.reachesPlace) ||
      a.score - b.score,
  );

  return proposals;
}

/** A route across two parallel doors may use an oblique line through each
 * actual aperture. The graph retains its source nodes and directional edges.
 * Only accept one continuous crossing whose walking body fits the native
 * floor, authorized door halves and the access policy on all three sides. */
export function alignPairedDoors(
  data: IndoorDataset,
  paths: RoutePath[],
  edges: IndoorEdge[],
  protectedPoints: readonly XYZ[],
  directoryEndpoints?: { start: string; end: string },
) {
  if (
    !data.nativeIndoorEnvelopes ||
    !data.circulationGeometry ||
    paths.length < 5
  )
    return;
  const byId = new Map(edges.map((e) => [e.id, e]));
  const passage = createDoorPassageQuery(data);
  for (let i = 0; i + 4 < paths.length; i++) {
    try {
      const group = paths.slice(i, i + 5);
      const [first, doorA, middle, doorB, last] = group;
      if (
        doorA.sourceReason !== "native-door" ||
        doorB.sourceReason !== "native-door" ||
        middle.pointsFeet.length !== 2 ||
        [first, middle, last].some(
          (p) => !p.centered || p.shape === "curved",
        ) ||
        group.some(
          (p) =>
            p.levelIds.length !== 1 || p.levelIds[0] !== middle.levelIds[0],
        ) ||
        group
          .slice(1)
          .some(
            (p, j) =>
              !sourceAnchor(group[j].pointsFeet.at(-1)!, p.pointsFeet[0]),
          )
      )
        continue;
      const refs = [...doorA.pointsFeet, ...doorB.pointsFeet];
      if (
        refs.length !== 4 ||
        refs.some((v) => protectedPoints.some((p) => same(v, p)))
      )
        continue;
      const z = refs[0][2],
        level = middle.levelIds[0];
      if (group.some((p) => p.pointsFeet.some((q) => q[2] !== z))) continue;
      const gates = [doorA, doorB].map((p) => byId.get(p.edgeIds[0])!);
      if (
        gates.some(
          (e) =>
            e?.kind !== "door" || !e.enabled || e.nativeElementId === undefined,
        )
      )
        continue;
      if (
        gates.some((edge, j) => {
          const start = group[2 * j + 1].pointsFeet[0];
          return (
            (edge.direction === "from-to" &&
              !sourceAnchor(start, edge.pointsFeet[0])) ||
            (edge.direction === "to-from" &&
              !sourceAnchor(start, edge.pointsFeet.at(-1)!))
          );
        })
      )
        continue;
      const doors = gates.map((e) => data.doors?.find((d) => d.id === e.id));
      if (
        doors.some(
          (d, j) =>
            !d?.normalFeet ||
            !d.footprintFeet ||
            !d.pointFeet ||
            d.state !== "connected" ||
            d.hostWallNativeElementId === undefined ||
            d.nativeElementId !== gates[j].nativeElementId,
        )
      )
        continue;
      const walks = [first, middle, last];
      const groups = walks.map((p) => p.edgeIds.map((id) => byId.get(id)!));
      const cells = groups.map((g) =>
        data.circulationGeometry!.cells.find(
          (c) => c.id === g[0]?.nativeCellId,
        ),
      );
      if (
        cells.some(
          (c, j) =>
            !c ||
            !groups[j].every(
              (e) => e?.kind === "walk" && e.enabled && e.nativeCellId === c.id,
            ),
        )
      )
        continue;
      if (new Set(cells.map((c) => c!.id)).size !== 3) continue;
      const points = group.map((p) => p.pointsFeet.map(xy));
      const gateShapes = doors.map((d) => ({
        id: d!.id,
        normal: d!.normalFeet!,
        center: d!.pointFeet,
        ring: nativeDoorClearOpening(data, d!, z) ?? d!.footprintFeet!,
      }));
      const atPlace = [
        i === 0 && first.pointsFeet.length === 2,
        i + 5 === paths.length && last.pointsFeet.length === 2,
      ];
      const alternatives = pairedDoorCandidates(points, gateShapes, atPlace);
      const preferred = centeredDoorCandidate(points, gateShapes);
      const proposals = preferred ? [preferred, ...alternatives] : alternatives;
      if (proposals.length === 0) continue;
      const faces = cells.map((c) => nativeCirculationExactCellParts(data, c!));
      if (faces.some((f) => !f?.length)) continue;
      const halvesFor = routingCalculationValue(
        data,
        "native-door-approach-query",
        () => createNativeDoorApproachQuery(data),
      );
      const sides = gates.map((g, j) =>
        [g.from, g.to].map((id) =>
          [...groups[j], ...groups[j + 1]].flatMap((edge) =>
            halvesFor(edge, new Set([id])).flatMap((h) =>
              h.z === z ? (h.exactParts ?? []) : [],
            ),
          ),
        ),
      );
      if (sides.some((pair) => pair.some((parts) => parts.length === 0)))
        continue;
      const halves = sides.map(([a, b]) => [...a, ...b]);
      const strips = faces.map((f, j) =>
        createCorridorGuideSupport(f!, z, groups[j], halvesFor),
      );
      const gateStrips = gates.map((_, j) =>
        createTwoFootCorridorSupport(
          nativeRationalOverlay("union", faces[j]!, faces[j + 1]!, halves[j]),
          z,
        ),
      );
      const transit = walks.map((p, j) =>
        createNativeTransitRefinementPolicy(data, groups[j], p.pointsFeet),
      );
      const xyz = (p: XY[]): XYZ[] => p.map(([x, y]) => [x, y, z]);
      const originalPass = group.map((p) => passage(level, p.pointsFeet));
      if (
        originalPass.some((crossings, j) =>
          j % 2 === 0
            ? crossings.length > 0
            : crossings.length !== 1 ||
              crossings[0].edge.id !== gates[(j - 1) / 2].id,
        )
      )
        continue;
      const samePassages = (p: XY[], j: number) => {
        const crossings = passage(level, xyz(p));
        return (
          crossings.length === originalPass[j].length &&
          crossings.every(
            (c, k) =>
              c.edge.id === originalPass[j][k].edge.id &&
              c.forward === originalPass[j][k].forward,
          )
        );
      };
      // The first and last walk may end at a door distinct from the pair.
      // Recover the source anchor IDs by the original walking orientation.
      const endpoints = groups.map((g, j) =>
        [g[0], g.at(-1)!].map((edge, k) => {
          const target = k
            ? walks[j].pointsFeet.at(-1)!
            : walks[j].pointsFeet[0];
          return sourceAnchor(edge.pointsFeet[0], target)
            ? edge.from
            : sourceAnchor(edge.pointsFeet.at(-1)!, target)
              ? edge.to
              : undefined;
        }),
      );
      if (endpoints.some((pair) => pair.some((v) => !v))) continue;
      const fixed = group
        .flatMap((p) => p.pointsFeet)
        .filter((q) => protectedPoints.some((v) => same(v, q)));
      const originalLength = length(points);
      for (const { legs, score } of proposals) {
        if (
          fixed.some(
            (q) =>
              !legs.some((part) =>
                part.some(([x, y]) => q[0] === x && q[1] === y),
              ),
          )
        )
          continue;
        if (score > originalLength + 2) continue; // At most the two exterior alignment leads.
        if (legs.some((p, j) => !samePassages(p, j))) continue;
        if (!gates.every((_, j) => gateStrips[j](legs[2 * j + 1]))) continue;
        if (
          !walks.every((_, j) => {
            const part = legs[2 * j],
              ends = endpoints[j];
            if (
              !strips[j].edgeSupported(part, ends[0]!, ends[1]!) ||
              !transit[j](xyz(part))
            )
              return false;
            return part.slice(1, -1).every(([x, y]) =>
              strips[j].supported([
                [x - 1, y],
                [x + 1, y],
              ]),
            );
          })
        )
          continue;
        const checkedLegs = legs.map(xyz);
        const centers = new Map<number, RoomCenterAttachment>();
        if (legs === preferred?.legs && directoryEndpoints) {
          for (const side of [0, 1]) {
            if (!atPlace[side]) continue;
            const j = side * 4,
              role = side === 0 ? "departure" : "arrival";
            const key =
              side === 0 ? directoryEndpoints.start : directoryEndpoints.end;
            const record = data.records.find((r) => r.key === key);
            const node = data.nodes.find((n) => n.id === record?.arrivalNodeId);
            // Only an explicit directory choice of a labeled circulation room
            // can use the certified center instead of its generated room pin.
            const label = record?.properties?.dwg as
              | { tag?: string }
              | undefined;
            if (
              !record?.circulation ||
              record.stair ||
              !record.walkable ||
              record.access === "staff" ||
              label?.tag !== "ROOMNUM" ||
              node?.kind !== "arrival" ||
              node.id !== "arrival:" + key ||
              node.roomKey !== key ||
              !same(
                node.pointFeet,
                side === 0 ? first.pointsFeet[0] : last.pointsFeet.at(-1)!,
              ) ||
              !cells[side * 2]!.roomKeys.includes(key)
            )
              continue;
            const from = preferred.sources[side],
              to = preferred.stations[side];
            const lengthFeet = dist(from, to);
            if (
              lengthFeet === 0 ||
              fixed.some((p) => sourceAnchor(p, node.pointFeet))
            )
              continue;
            const part = checkedLegs[j],
              station = side === 0 ? part[1] : part.at(-2)!;
            if (station[0] !== to[0] || station[1] !== to[1]) continue;
            centers.set(j, {
              role,
              roomKey: key,
              mappedPointFeet: [...node.pointFeet],
              centerPointFeet: [...station],
              attachmentMetres:
                lengthFeet * data.alignment.horizontalMetresPerFoot,
            });
            checkedLegs[j] = side === 0 ? part.slice(1) : part.slice(0, -1);
          }
        }
        group.forEach((p, j) => {
          paths[i + j] = {
            ...p,
            centered: true,
            pointsFeet: checkedLegs[j],
            ...(centers.has(j) ? { roomCenter: centers.get(j) } : {}),
          };
        });
        i += 3;
        break;
      }
    } catch {
      // Optional line fitting cannot displace the existing verified walk.
      continue;
    }
  }
}
