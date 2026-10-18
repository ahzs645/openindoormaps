/** Saved display/topology diagnostic only. No import, geometry preparation,
 * route calculation, new portal, or publication/validation authority. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { isDisplayPassage } from "../../app/indoor-project/display-passages";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";
import { pathConnections } from "../../app/indoor-project/path-connections";
import { geographicPoint } from "../../app/indoor-project/routing";
import {
  preparedWalkingGuides,
  type PreparedRouting,
} from "../../app/indoor-project/prepared-routing";
import { hasReviewedThroughNavigation } from "../../app/indoor-project/through-navigation";

const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: audit-hallway-display-links.ts SOURCE.json EMPTY-OUTPUT-DIRECTORY",
  );
const raw = await readFile(input);
const data = JSON.parse(raw.toString()) as IndoorDataset;
await mkdir(output, { recursive: false });
const nodes = new Map(data.nodes.map((n) => [n.id, n]));
const rooms = new Map(data.records.map((r) => [r.key, r]));
const edges = new Map(data.edges.map((e) => [e.id, e]));
const guides = new Map(
  (
    (data as IndoorDataset & { preparedRouting?: PreparedRouting })
      .preparedRouting?.guides ?? []
  ).map((g) => [g.edgeId, g]),
);
const bound = preparedWalkingGuides(data);
const passage = (key: string) => {
  const r = rooms.get(key);
  return !!r?.walkable && r.access !== "staff" && isDisplayPassage(r);
};
const ordinaryOwners = (roomKeys: string[]) =>
  roomKeys
    .map((k) => rooms.get(k)!)
    .filter(
      (r) =>
        r.walkable &&
        r.access !== "staff" &&
        !r.circulation &&
        !r.stair &&
        !hasReviewedThroughNavigation(r, data.source.modelSha256),
    )
    .map((r) => ({ key: r.key, number: r.number, name: r.name }));
const entrances = [
  {
    floor: "Floor 1",
    bridge: "door:1487816:1501580",
    inner: "door:1487816:1501582",
    mainHallNode: "door:1487816:1501582:0",
  },
  {
    floor: "Floor 2",
    bridge: "door:694:1499620",
    inner: "door:694:1499619",
    mainHallNode: "door:694:1499619:1",
  },
].map((item) => ({
  ...item,
  doors: [item.bridge, item.inner].map((id) => edges.get(id)),
  mainHallTerminal: nodes.get(item.mainHallNode),
  walkingEdgesAtMainHallTerminal: data.edges
    .filter(
      (e) =>
        e.kind === "walk" &&
        e.enabled &&
        [e.from, e.to].includes(item.mainHallNode),
    )
    .map((e) => ({
      id: e.id,
      pointsFeet: e.pointsFeet,
      sharedGuide: bound.has(e.id),
      ordinaryOwners: ordinaryOwners(e.roomKeys),
    })),
}));
const floors = data.floors.map((floor) => {
  const view = hallwayPathView(data, floor.levelIds, "all", {
    includeSourceFeet: true,
  });
  const connections = pathConnections(data, floor.levelIds, "all");
  const segments = view.features.map((feature) => {
    const edge = edges.get(feature.properties!.edgeId)!;
    const guide = guides.get(edge.id);
    if (feature.properties?.pointsFeet)
      return {
        ...feature.properties,
        pointsFeet: feature.properties.pointsFeet,
      };
    if (!guide) throw new Error("Missing display-segment source coordinates");
    const points = new Map(
      guide.pointsFeet.map((p) => [
        JSON.stringify(geographicPoint(data, p)),
        p,
      ]),
    );
    const feet = feature.geometry.coordinates.map(
      (p) => points.get(JSON.stringify(p))!,
    );
    if (feet.some((p) => !p))
      throw new Error("Displayed point missing from its original guide");
    return { ...feature.properties, pointsFeet: feet };
  });
  // Keep fallback paths distinct: these are saved originals, not newly fitted
  // centerlines. Their absence from the current guide layer is the diagnostic.
  const fallbacks = data.edges
    .filter(
      (e) =>
        e.enabled &&
        e.kind === "walk" &&
        !bound.has(e.id) &&
        e.roomKeys.every(passage) &&
        [e.from, e.to].every((id) => {
          const n = nodes.get(id);
          return n && floor.levelIds.includes(n.levelId) && passage(n.roomKey);
        }),
    )
    .map((e) => ({
      edgeId: e.id,
      nativeCellId: e.nativeCellId,
      pointsFeet: e.pointsFeet,
    }));
  return {
    ...floor,
    segments,
    fallbacks,
    connections: connections.features
      .filter(
        (f) =>
          f.geometry.type === "LineString" && f.properties?.role !== "held",
      )
      .map((f) => ({
        ...f.properties,
        pointsFeet: edges.get(f.properties!.edgeId)!.pointsFeet,
      })),
  };
});

const witnesses = [];
for (const [fromNumber, toNumber] of [
  ["08-159", "10-1060"],
  ["08-267", "10-2066"],
]) {
  const from = data.records.find((r) => r.number === fromNumber)!;
  const to = data.records.find((r) => r.number === toNumber)!;
  const floor = data.floors.find((f) => f.levelIds.includes(from.levelId))!;
  const adjacency = new Map<string, { to: string; edgeId: string }[]>();
  for (const e of data.edges) {
    if (
      !e.enabled ||
      !e.roomKeys.every(passage) ||
      ![e.from, e.to].every((id) => {
        const n = nodes.get(id);
        return n && floor.levelIds.includes(n.levelId) && passage(n.roomKey);
      })
    )
      continue;
    const link = (a: string, b: string) => {
      const list = adjacency.get(a) ?? [];
      list.push({ to: b, edgeId: e.id });
      adjacency.set(a, list);
    };
    if (e.direction !== "to-from") link(e.from, e.to);
    if (e.direction !== "from-to") link(e.to, e.from);
  }
  for (const [start, end] of [
    [from, to],
    [to, from],
  ]) {
    const a = data.nodes.find(
      (n) => n.kind === "arrival" && n.roomKey === start.key,
    )!;
    const b = data.nodes.find(
      (n) => n.kind === "arrival" && n.roomKey === end.key,
    )!;
    const queue = [a.id],
      seen = new Set(queue);
    const previous = new Map<string, { from: string; edgeId: string }>();
    for (let i = 0; i < queue.length && !seen.has(b.id); i++)
      for (const next of adjacency.get(queue[i]) ?? []) {
        if (seen.has(next.to)) continue;
        seen.add(next.to);
        previous.set(next.to, { from: queue[i], edgeId: next.edgeId });
        queue.push(next.to);
      }
    const edgeIds: string[] = [];
    if (seen.has(b.id))
      for (let at = b.id; at !== a.id; ) {
        const prev = previous.get(at)!;
        edgeIds.push(prev.edgeId);
        at = prev.from;
      }
    witnesses.push({
      floor: floor.name,
      from: start.number,
      to: end.number,
      topologyFilter:
        "Conservative: every edge owner must be a display passage; not the physical route calculator",
      savedTopologyConnected: seen.has(b.id),
      edges: edgeIds.reverse().map((id) => {
        const e = edges.get(id)!;
        return {
          id,
          kind: e.kind,
          enabled: e.enabled,
          direction: e.direction ?? "both",
          owners: e.roomKeys.map((k) => rooms.get(k)!.number),
          sharedGuide: bound.has(id),
          pointsFeet: e.pointsFeet,
        };
      }),
    });
  }
}
const report = {
  format: "hallway-display-links-inspection-v1",
  createdAt: new Date().toISOString(),
  sourceIndoorSha256: createHash("sha256").update(raw).digest("hex"),
  boundGuideCount: bound.size,
  witnesses,
  entrances,
  limitations: [
    "Saved graph connectivity is not a fresh physical navigation calculation.",
    "The passage-only topology filter checks every cell owner, and can refuse a path because the cell also lists ordinary rooms. A failed witness is not independently a physical-route refusal.",
    "Fallback originals and saved transitions are distinguished from fitted centerlines.",
    "No source geometry, access, stair status, graph or published viewer was changed.",
  ],
  floors,
  records: data.records.map((r) => ({
    key: r.key,
    number: r.number,
    name: r.name,
    building: r.building,
    levelId: r.levelId,
    circulation: isDisplayPassage(r),
    walkable: r.walkable,
    access: r.access,
    ringsFeet: r.ringsFeet,
  })),
};
await writeFile(`${output}/display-links.json`, JSON.stringify(report));
console.log(
  JSON.stringify(
    {
      sourceIndoorSha256: report.sourceIndoorSha256,
      boundGuideCount: bound.size,
      entrances: entrances.map(({ doors: _, mainHallTerminal: __, ...e }) => e),
      witnesses: witnesses.map(({ edges, ...w }) => ({
        ...w,
        edgeCount: edges.length,
        fallbackWalks: edges
          .filter((e) => e.kind === "walk" && !e.sharedGuide)
          .map((e) => e.id),
      })),
      floors: floors.map((f) => ({
        name: f.name,
        segments: f.segments.length,
        fallbackWalks: f.fallbacks.length,
        connections: f.connections.length,
      })),
    },
    null,
    2,
  ),
);
