import { readFile, writeFile } from "node:fs/promises";
import {
  readIndoorProject,
  exportIndoorProject,
  reviewArea,
} from "../../app/indoor-project/package";
import {
  findProjectRoute,
  geographicPoint,
} from "../../app/indoor-project/routing";
const args = process.argv.slice(2),
  option = (name: string) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
const input = args[0];
if (!input)
  throw new Error(
    "Usage: npm run indoor:audit -- prepared.zip [--cases route-cases.json] [--out report.json]",
  );
const project = await readIndoorProject(new Uint8Array(await readFile(input))),
  data = project.dataset;
type Endpoint = { key?: string; number?: string; levelId?: number };
type Case = {
  name: string;
  start: Endpoint;
  end: Endpoint;
  expect: "route" | "blocked" | "review";
  profile?: "public" | "accessible";
};
const cases: Case[] = option("--cases")
  ? JSON.parse(await readFile(option("--cases")!, "utf8"))
  : [];
const key = (endpoint: Endpoint) => {
  if (endpoint.key)
    return data.records.find((r) => r.key === endpoint.key)?.key;
  const matches = data.records.filter(
    (r) => r.number === endpoint.number && r.levelId === endpoint.levelId,
  );
  if (matches.length > 1)
    throw new Error(
      `Ambiguous route endpoint ${endpoint.number} on #${endpoint.levelId}; supply its stable source key.`,
    );
  return matches[0]?.key;
};
const routes = cases.map((test) => {
  const start = key(test.start),
    end = key(test.end),
    route =
      start && end ? findProjectRoute(data, start, end, test.profile) : null;
  if (!start || !end)
    throw new Error(`Case ${test.name} references missing source areas.`);
  if (
    (test.expect === "route" && !route) ||
    (test.expect === "blocked" && route)
  )
    throw new Error(`Route case failed: ${test.name}`);
  return {
    name: test.name,
    expect: test.expect,
    start: test.start,
    end: test.end,
    route: route
      ? {
          metres: route.distanceMetres,
          sourceGraphMetres: route.sourceDistanceMetres,
          edges: route.edges.length,
          paths: route.paths.map((path) => ({
            centered: path.centered,
            vertices: path.pointsFeet.length,
            nativeLevels: path.levelIds,
          })),
          transitions: route.edges
            .filter((e) => e.kind === "stairs" || e.kind === "local-steps")
            .map((e) => e.id),
        }
      : null,
  };
});
let smoke = cases
  .filter((c) => c.expect === "route")
  .map((c) => [key(c.start)!, key(c.end)!] as [string, string])
  .find(([a, b]) => !!findProjectRoute(data, a, b));
if (!smoke)
  smoke = data.edges
    .flatMap((e) => {
      const keys = [...new Set(e.roomKeys)];
      return keys.length > 1 ? [[keys[0], keys[1]] as [string, string]] : [];
    })
    .find(([a, b]) => !!findProjectRoute(data, a, b));
let roundtrip = {
  originalModelPreserved: false,
  gisPreserved: false,
  staffBlocked: false,
};
if (smoke) {
  const [start, end] = smoke,
    restricted = reviewArea(project, end, {
      access: "staff",
      notes: "Automated restriction round-trip check",
    });
  if (findProjectRoute(restricted.dataset, start, end))
    throw new Error("Staff restriction was ignored.");
  const restored = await readIndoorProject(
    await exportIndoorProject(restricted),
  );
  if (
    restored.dataset.records.find((r) => r.key === end)?.access !== "staff" ||
    findProjectRoute(restored.dataset, start, end)
  )
    throw new Error("Review round-trip failed.");
  if (
    restored.manifest.model.sha256 !== project.manifest.model.sha256 ||
    JSON.stringify(restored.rooms.georeference) !==
      JSON.stringify(project.rooms.georeference)
  )
    throw new Error("Source model or GIS changed.");
  roundtrip = {
    originalModelPreserved: true,
    gisPreserved: true,
    staffBlocked: true,
  };
}
const geoError = Math.max(
  0,
  ...data.nodes.map((n) => {
    const point = geographicPoint(data, n.pointFeet);
    return Math.hypot(point[0] - n.geographic[0], point[1] - n.geographic[1]);
  }),
);
if (geoError > 1e-9) throw new Error("Map and graph registrations differ.");
const floorCoverage = [
  ...new Set(data.records.map((r) => `${r.building}:${r.levelId}`)),
]
  .sort()
  .map((id) => {
    const records = data.records.filter(
      (r) => `${r.building}:${r.levelId}` === id,
    );
    return {
      id,
      records: records.length,
      arrivals: records.filter((r) => r.arrivalNodeId).length,
      unconfirmedAccess: records.filter((r) => r.access === "unknown").length,
    };
  });
const report = {
  source: data.source,
  report: data.report,
  nodeCount: data.nodes.length,
  edgeCount: data.edges.length,
  edgeKinds: Object.fromEntries(
    ["walk", "door", "opening", "stairs", "local-steps"].map((k) => [
      k,
      data.edges.filter((e) => e.kind === k).length,
    ]),
  ),
  routes,
  roundtrip,
  maxGeoDifferenceDegrees: geoError,
  floorCoverage,
};
console.log(JSON.stringify(report, null, 2));
if (option("--out"))
  await writeFile(option("--out")!, JSON.stringify(report, null, 2));
