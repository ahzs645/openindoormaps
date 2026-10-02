/**
 * Runs the app's real routing engine (IndoorDirections) headlessly over
 * random POI pairs per venue and checks each route against a reference
 * Dijkstra built independently from the same indoor-routes.geojson.
 *
 *   npx tsx scripts/verify-venue-routing.ts [venue ...] [--pairs=40]
 *
 * Reports per venue: routing time, routes the engine fails although a path
 * exists (or finds although none exists), routes costlier than the optimum,
 * wrong start/end floors, and accessible routes that use stairs/escalators.
 */
import { readFileSync } from "node:fs";
import IndoorDirections from "../app/indoor-directions/directions/main";

const WALKING_SPEED = 1.2;
const args = process.argv.slice(2);
const pairsArg = args.find((a) => a.startsWith("--pairs="));
const PAIRS = pairsArg ? Number(pairsArg.split("=")[1]) : 40;
const venues = args.filter((a) => !a.startsWith("--"));
const VENUES =
  venues.length > 0
    ? venues
    : [
        "galleria",
        "campus",
        "city-mall",
        "harrods",
        "mappedin-mall",
        "bowie-state",
        "eaton-centre",
      ];

const noop = () => {};

/** Map stub: the engine only registers layers/listeners on it. */
function stubMap(): maplibregl.Map {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "getSource") return () => ({ setData: noop });
        if (prop === "getLayer") return () => {};
        if (prop === "getCanvas") return () => ({ style: {} });
        if (prop === "getStyle") return () => ({ layers: [] });
        return noop;
      },
    },
  ) as unknown as maplibregl.Map;
}

// Silence the engine's console.error for expected "no route" cases.
const originalError = console.error;

function haversineMeters(a: GeoJSON.Position, b: GeoJSON.Position) {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) *
      Math.cos((b[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

interface RefEdge {
  to: string;
  w: number;
  accessible: boolean;
  /** Ridden, not walked (stairs/escalator/elevator/ramp or cross-floor). */
  vertical: boolean;
}

/** Reference graph: every segment its own weight, heap Dijkstra. */
function buildReference(routes: GeoJSON.FeatureCollection) {
  const adj = new Map<string, RefEdge[]>();
  const add = (a: string, b: string, e: Omit<RefEdge, "to">) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push({ to: b, ...e });
  };
  for (const f of routes.features) {
    if (f.geometry.type !== "LineString") continue;
    const p = f.properties ?? {};
    const nt =
      typeof p.network_type === "string" ? p.network_type.toLowerCase() : "";
    const accessible =
      typeof p.is_accessible === "boolean"
        ? p.is_accessible
        : !["stairs", "escalator"].includes(nt);
    const vertical =
      ["stairs", "escalator", "elevator", "ramp"].includes(nt) ||
      (typeof p.from_level_id === "number" &&
        typeof p.to_level_id === "number" &&
        p.from_level_id !== p.to_level_id);
    const cs = f.geometry.coordinates;
    for (let i = 0; i < cs.length - 1; i++) {
      const a = JSON.stringify(cs[i]);
      const b = JSON.stringify(cs[i + 1]);
      let w: number;
      if (
        typeof p.routing_cost === "number" &&
        Number.isFinite(p.routing_cost) &&
        p.routing_cost >= 0
      ) {
        w = p.routing_cost / (cs.length - 1);
      } else if (
        typeof p.cost === "number" &&
        p.cost >= 0 &&
        (p.cost > 0 ||
          (typeof p.ride_time_seconds === "number" && p.ride_time_seconds > 0))
      ) {
        w = p.cost / (cs.length - 1);
      } else {
        const factor =
          typeof p.routing_cost_factor === "number" &&
          Number.isFinite(p.routing_cost_factor) &&
          p.routing_cost_factor >= 1
            ? p.routing_cost_factor
            : 1;
        w = (haversineMeters(cs[i], cs[i + 1]) / WALKING_SPEED) * factor;
      }
      if (p.direction !== "backward") add(a, b, { w, accessible, vertical });
      if (p.direction !== "forward") add(b, a, { w, accessible, vertical });
    }
  }
  return adj;
}

function refCost(
  adj: Map<string, RefEdge[]>,
  start: string,
  end: string,
  accessibleOnly: boolean,
): number {
  const dist = new Map<string, number>([[start, 0]]);
  // Binary heap of [cost, vertex].
  const heap: [number, string][] = [[0, start]];
  const push = (item: [number, string]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length > 0) {
    const [d, v] = pop();
    if (v === end) return d;
    if (d > (dist.get(v) ?? Infinity)) continue;
    for (const e of adj.get(v) ?? []) {
      if (accessibleOnly && !e.accessible) continue;
      const nd = d + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        push([nd, e.to]);
      }
    }
  }
  return Infinity;
}

/** Whether a hop is a ride (connector) rather than walking. */
function adjacencyCost(
  adj: Map<string, RefEdge[]>,
  a: GeoJSON.Position,
  b: GeoJSON.Position,
): { vertical: boolean } | undefined {
  const edge = (adj.get(JSON.stringify(a)) ?? []).find(
    (e) => e.to === JSON.stringify(b),
  );
  return edge ? { vertical: edge.vertical } : undefined;
}

/** Cost of an engine path, using the cheapest reference edge per hop. */
function pathCost(
  adj: Map<string, RefEdge[]>,
  path: GeoJSON.Position[],
): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = JSON.stringify(path[i]);
    const b = JSON.stringify(path[i + 1]);
    const edges = (adj.get(a) ?? []).filter((e) => e.to === b);
    if (edges.length === 0) return Number.NaN; // hop that is not an edge
    total += Math.min(...edges.map((e) => e.w));
  }
  return total;
}

// Deterministic sampling.
let seed = 42;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};

interface Result {
  venue: string;
  routes: number;
  msMedian: number;
  msMax: number;
  failedWithPath: number;
  foundWithoutPath: number;
  suboptimal: number;
  worstExcess: number;
  wrongFloors: number;
  badWording: number;
  stepsMedian: number;
  inaccessible: number;
  badHops: number;
  examples: string[];
}

function verifyVenue(venue: string): Result {
  const load = (name: string) =>
    JSON.parse(
      readFileSync(`app/data/${venue}/${name}.geojson`, "utf8"),
    ) as GeoJSON.FeatureCollection;
  const routes = load("indoor-routes");
  const pois = load("pois").features.filter(
    (f) => f.geometry.type === "Point",
  ) as GeoJSON.Feature<GeoJSON.Point>[];

  const engine = new IndoorDirections(stubMap());
  engine.loadMapData(routes);
  const reference = buildReference(routes);

  const result: Result = {
    venue,
    routes: 0,
    msMedian: 0,
    msMax: 0,
    failedWithPath: 0,
    foundWithoutPath: 0,
    suboptimal: 0,
    worstExcess: 0,
    wrongFloors: 0,
    badWording: 0,
    stepsMedian: 0,
    inaccessible: 0,
    badHops: 0,
    examples: [],
  };
  const times: number[] = [];
  const stepCounts: number[] = [];
  const note = (text: string) => {
    if (result.examples.length < 6) result.examples.push(text);
  };

  for (let n = 0; n < PAIRS; n++) {
    const from = pois[Math.floor(random() * pois.length)];
    const to = pois[Math.floor(random() * pois.length)];
    if (from === to) continue;
    const accessibleOnly = n % 4 === 3;
    const label = `${from.properties?.name} (${from.properties?.floor}) -> ${to.properties?.name} (${to.properties?.floor})${accessibleOnly ? " [accessible]" : ""}`;

    engine.setPathfindingOptions({ accessibleOnly });
    console.error = () => {};
    const t0 = performance.now();
    engine.setWaypoints(
      [
        from.geometry.coordinates as [number, number],
        to.geometry.coordinates as [number, number],
      ],
      [from.properties?.floor ?? null, to.properties?.floor ?? null],
      [from.properties?.name ?? null, to.properties?.name ?? null],
    );
    const ms = performance.now() - t0;
    console.error = originalError;
    times.push(ms);
    result.routes++;

    const lines = engine.routelinesCoordinates[0] ?? [];
    const path: GeoJSON.Position[] = [];
    for (const line of lines) {
      for (const c of line.geometry.coordinates) {
        if (
          path.length === 0 ||
          JSON.stringify(path.at(-1)) !== JSON.stringify(c)
        ) {
          path.push(c);
        }
      }
    }
    const instructions = engine.routeInstructions;
    const snaps = (
      engine as unknown as { snappoints: GeoJSON.Feature<GeoJSON.Point>[] }
    ).snappoints.map((s) => JSON.stringify(s.geometry.coordinates));
    const optimum =
      snaps.length === 2
        ? refCost(reference, snaps[0], snaps[1], accessibleOnly)
        : Infinity;
    const found = path.length >= 2 && instructions.length > 0;

    if (!found && optimum !== Infinity && snaps[0] !== snaps[1]) {
      result.failedWithPath++;
      note(`FAILED although a path exists: ${label}`);
      continue;
    }
    if (found && optimum === Infinity) {
      result.foundWithoutPath++;
      note(`route found where reference has none: ${label}`);
    }
    if (!found) continue;

    const cost = pathCost(reference, path);
    if (Number.isNaN(cost)) {
      result.badHops++;
      note(`route uses a hop that is not an edge: ${label}`);
    } else if (cost > optimum * 1.001 + 0.5) {
      result.suboptimal++;
      const excess = cost - optimum;
      result.worstExcess = Math.max(result.worstExcess, excess);
      note(
        `suboptimal by ${excess.toFixed(0)} s (${cost.toFixed(0)} vs ${optimum.toFixed(0)}): ${label}`,
      );
    }

    stepCounts.push(instructions.length);
    // Wording: named endpoints, and merged turn+walk steps must keep the
    // walking distance (steps sum to the drawn route + lead-in/out).
    const expectedStart = `Start at ${from.properties?.name}`;
    const expectedArrive = `Arrive at ${to.properties?.name}`;
    const walked = instructions
      .filter((i) => i.type !== "floor-change")
      .reduce((sum, i) => sum + i.distanceMeters, 0);
    let drawn = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const hop = (adjacencyCost(reference, path[i], path[i + 1]) ?? {})
        .vertical;
      if (!hop) drawn += haversineMeters(path[i], path[i + 1]);
    }
    const leads =
      haversineMeters(from.geometry.coordinates, JSON.parse(snaps[0])) +
      haversineMeters(to.geometry.coordinates, JSON.parse(snaps[1]));
    if (
      instructions[0]?.message !== expectedStart ||
      instructions.at(-1)?.message !== expectedArrive ||
      Math.abs(walked - (drawn + leads)) > 1 + instructions.length * 0.5
    ) {
      result.badWording++;
      note(
        `wording: "${instructions[0]?.message}" … "${instructions.at(-1)?.message}", steps ${walked.toFixed(0)} m vs route ${(drawn + leads).toFixed(0)} m: ${label}`,
      );
    }

    const first = instructions[0];
    const last = instructions.at(-1);
    if (
      first?.toLevel !== (from.properties?.floor ?? null) ||
      last?.toLevel !== (to.properties?.floor ?? null)
    ) {
      result.wrongFloors++;
      note(
        `floors ${first?.toLevel}->${last?.toLevel}, expected ${from.properties?.floor}->${to.properties?.floor}: ${label}`,
      );
    }
    if (
      accessibleOnly &&
      instructions.some(
        (i) =>
          i.type === "floor-change" &&
          (i.networkType === "stairs" || i.networkType === "escalator"),
      )
    ) {
      result.inaccessible++;
      note(`accessible route uses stairs/escalator: ${label}`);
    }
  }

  times.sort((a, b) => a - b);
  result.msMedian = times[Math.floor(times.length / 2)] ?? 0;
  stepCounts.sort((a, b) => a - b);
  result.stepsMedian = stepCounts[Math.floor(stepCounts.length / 2)] ?? 0;
  result.msMax = times.at(-1) ?? 0;
  return result;
}

let problems = 0;
for (const venue of VENUES) {
  const r = verifyVenue(venue);
  const issues =
    r.failedWithPath +
    r.foundWithoutPath +
    r.suboptimal +
    r.wrongFloors +
    r.badWording +
    r.inaccessible +
    r.badHops;
  problems += issues;
  console.log(
    `${venue.padEnd(14)} routes ${String(r.routes).padStart(3)}  ` +
      `time median ${r.msMedian.toFixed(0)} ms, max ${r.msMax.toFixed(0)} ms  ` +
      `failed-with-path ${r.failedWithPath}  suboptimal ${r.suboptimal}` +
      (r.suboptimal ? ` (worst +${r.worstExcess.toFixed(0)} s)` : "") +
      `  wrong-floors ${r.wrongFloors}  bad-wording ${r.badWording}  steps median ${r.stepsMedian}  inaccessible ${r.inaccessible}` +
      `  bad-hops ${r.badHops}  found-without-path ${r.foundWithoutPath}`,
  );
  for (const example of r.examples) console.log(`    ${example}`);
}
process.exitCode = problems > 0 ? 1 : 0;
