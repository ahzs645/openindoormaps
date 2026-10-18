/** Cheap saved-source topology inspection. Does not replace physical routing. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { isDisplayPassage } from "../../app/indoor-project/display-passages";
import { hallwayPathView } from "../../app/indoor-project/hallway-path-view";
import { pathConnections } from "../../app/indoor-project/path-connections";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: audit-path-network.ts input-indoor.json output-report.json",
  );
const bytes = readFileSync(input),
  data = JSON.parse(bytes.toString()) as IndoorDataset;
const nodes = new Map(data.nodes.map((n) => [n.id, n])),
  rooms = new Map(data.records.map((r) => [r.key, r]));
const vertical = new Set([
  "elevator",
  "ramp",
  "stairs",
  "local-steps",
  "escalator",
]);
function graph(passagesOnly: boolean, levels?: Set<number>) {
  const available = new Map(
    data.nodes
      .filter((n) => {
        const r = rooms.get(n.roomKey);
        return (
          r?.walkable &&
          r.access !== "staff" &&
          (!passagesOnly || isDisplayPassage(r) || r.stair) &&
          (!levels || levels.has(n.levelId))
        );
      })
      .map((n) => [n.id, n]),
  );
  const forward = new Map(
      [...available.keys()].map((id) => [id, [] as string[]]),
    ),
    reverse = new Map([...available.keys()].map((id) => [id, [] as string[]]));
  const edges = data.edges.filter(
    (e) =>
      e.enabled &&
      available.has(e.from) &&
      available.has(e.to) &&
      e.roomKeys.every((k) => {
        const r = rooms.get(k);
        return (
          r?.walkable &&
          r.access !== "staff" &&
          (!passagesOnly || isDisplayPassage(r) || r.stair)
        );
      }),
  );
  const link = (a: string, b: string) => {
    forward.get(a)!.push(b);
    reverse.get(b)!.push(a);
  };
  for (const e of edges) {
    if (e.direction !== "to-from") link(e.from, e.to);
    if (e.direction !== "from-to") link(e.to, e.from);
  }
  const seen = new Set<string>(),
    order: string[] = [];
  function finish(start: string) {
    const stack: [string, number][] = [[start, 0]];
    seen.add(start);
    while (stack.length > 0) {
      const frame = stack.at(-1)!,
        next = forward.get(frame[0])!;
      if (frame[1] < next.length) {
        const n = next[frame[1]++];
        if (!seen.has(n)) {
          seen.add(n);
          stack.push([n, 0]);
        }
      } else {
        order.push(frame[0]);
        stack.pop();
      }
    }
  }
  for (const id of available.keys()) if (!seen.has(id)) finish(id);
  seen.clear();
  const components: string[][] = [];
  for (const id of order.reverse()) {
    if (seen.has(id)) continue;
    const component: string[] = [],
      stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const n = stack.pop()!;
      component.push(n);
      for (const p of reverse.get(n)!)
        if (!seen.has(p)) {
          seen.add(p);
          stack.push(p);
        }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);
  return {
    nodeCount: available.size,
    edgeCount: edges.length,
    stronglyConnectedComponents: components.length,
    largestComponents: components.slice(0, 10).map((c) => ({
      nodes: c.length,
      buildings: [...new Set(c.map((id) => nodes.get(id)!.building))].sort(),
      floors: [
        ...new Set(
          c.map(
            (id) =>
              data.floors.find((f) =>
                f.levelIds.includes(nodes.get(id)!.levelId),
              )?.name ?? "unassigned",
          ),
        ),
      ].sort(),
    })),
    isolatedNodes: [...available.keys()]
      .filter(
        (id) => forward.get(id)!.length === 0 && reverse.get(id)!.length === 0,
      )
      .map((id) => ({ id, roomKey: nodes.get(id)!.roomKey })),
  };
}
const connectionEdges = data.edges
  .filter((e) => vertical.has(e.kind))
  .map((e) => ({
    id: e.id,
    kind: e.kind,
    enabled: e.enabled,
    direction: e.direction ?? "both",
    accessible: e.accessible,
    nativeElementId: e.nativeElementId,
    from: {
      building: nodes.get(e.from)?.building,
      levelId: nodes.get(e.from)?.levelId,
    },
    to: {
      building: nodes.get(e.to)?.building,
      levelId: nodes.get(e.to)?.levelId,
    },
  }));
const report = {
  format: "unbc-saved-source-topology-inspection-v1",
  createdAt: new Date().toISOString(),
  sourceIndoorSha256: createHash("sha256").update(bytes).digest("hex"),
  modelSha256: data.source.modelSha256,
  limitations: [
    "Saved enabled edges only; no fresh native geometry, access-zone, body-clearance or connector-proof validation.",
    "Unknown access is included for inspection. Strong connectivity is not physical or step-free route certification.",
    "Passage-only mode conservatively requires every edge owner to be a passage or stair area. Ordinary-room transit is excluded.",
    "Held stairs remain disabled. Separate floor scopes exclude links leaving that floor; the whole-campus graph includes original vertical links.",
  ],
  records: data.records.length,
  nodes: data.nodes.length,
  edges: data.edges.length,
  allWalkableSourceTopology: graph(false),
  passageOnlySourceTopology: graph(true),
  floors: data.floors.map((f) => {
    const paths = hallwayPathView(data, f.levelIds, "all"),
      connections = pathConnections(data, f.levelIds, "all");
    return {
      ...f,
      topology: graph(true, new Set(f.levelIds)),
      overlay: {
        hallwaySegments: paths.features.filter(
          (x) => x.properties?.role === "hallway",
        ).length,
        solidPassageSegments: paths.features.filter(
          (x) => x.properties?.role === "passage",
        ).length,
        dottedRoomApproaches: paths.features.filter(
          (x) => x.properties?.role === "approach",
        ).length,
        connectionLines: connections.features.filter(
          (x) =>
            x.geometry.type === "LineString" && x.properties?.role !== "held",
        ).length,
        verticalStops: connections.features.filter(
          (x) => x.geometry.type === "Point" && x.properties?.role !== "held",
        ).length,
        heldFeatures: connections.features.filter(
          (x) => x.properties?.role === "held",
        ).length,
      },
    };
  }),
  connectionEdges,
  crossBuildingEdges: data.edges
    .filter(
      (e) =>
        e.enabled && nodes.get(e.from)?.building !== nodes.get(e.to)?.building,
    )
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      from: nodes.get(e.from)?.building,
      to: nodes.get(e.to)?.building,
      direction: e.direction ?? "both",
    })),
};
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    sourceIndoorSha256: report.sourceIndoorSha256,
    floors: report.floors.map((f) => ({ floor: f.name, ...f.overlay })),
    vertical: connectionEdges.reduce(
      (a, e) => {
        const k = `${e.enabled ? "enabled" : "held"}:${e.kind}`;
        a[k] = (a[k] ?? 0) + 1;
        return a;
      },
      {} as Record<string, number>,
    ),
    passageComponents:
      report.passageOnlySourceTopology.stronglyConnectedComponents,
  }),
);
