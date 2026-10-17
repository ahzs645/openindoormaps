/** Standalone map-data figure, never a browser screenshot or route generator. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { nativeRecordPhysicalLevelId } from "../../app/indoor-project/native-physical-level-records";

type Point = readonly number[];
type Part = readonly (readonly Point[])[];
export type RecordedRouteRow = {
  name?: string;
  start: string;
  end: string;
  mode?: string;
  errors?: string[];
  route: null | {
    nodeIds: string[];
    edgeIds: string[];
    distanceMetres: number;
    paths: {
      edgeIds: string[];
      levelIds: number[];
      pointsFeet: number[][];
      sourceReason?: string;
    }[];
  };
};
const sha = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
const xml = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const finite = (p: Point) =>
  Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite);
function bounds(points: readonly Point[]) {
  assert(
    points.length && points.every(finite),
    "Finite actual coordinates are required",
  );
  const lo = [Infinity, Infinity],
    hi = [-Infinity, -Infinity];
  for (const p of points)
    for (let i = 0; i < 2; i++) {
      lo[i] = Math.min(lo[i], p[i]);
      hi[i] = Math.max(hi[i], p[i]);
    }
  return { lo, hi };
}
const meets = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
  a.lo.every((v, i) => v <= b.hi[i] && a.hi[i] >= b.lo[i]);
const partPath = (part: Part) =>
  part
    .map((ring) => {
      assert(
        ring.length >= 3 && ring.every(finite),
        "Malformed actual polygon",
      );
      return `M${ring.map((p) => `${p[0]},${p[1]}`).join("L")}Z`;
    })
    .join("");

export function renderActualRouteSvg(
  data: IndoorDataset,
  row: RecordedRouteRow,
  status: "baseline" | "candidate" | "source-diagnostic",
) {
  assert(
    row.route,
    "Selected actual calculation has no route; no route image was produced",
  );
  assert(!row.errors?.length, "Selected route has recorded QA errors");
  const route = row.route,
    levels = [...new Set(route.paths.flatMap((p) => p.levelIds))];
  assert(
    route.paths.length,
    "Actual route has zero movement; no path figure is needed",
  );
  assert(Number.isFinite(route.distanceMetres) && route.distanceMetres >= 0);
  assert(
    levels.length > 0 && levels.length <= 12,
    "Unsupported actual route floor inventory",
  );
  for (const p of route.paths)
    assert(
      p.pointsFeet.length >= 2 &&
        p.pointsFeet.every((p) => finite(p) && p.length === 3),
    );
  const width = Math.max(980, Math.min(levels.length, 3) * 560),
    panelWidth = width / Math.min(levels.length, 3),
    panelHeight = 590,
    rows = Math.ceil(levels.length / 3),
    height = 130 + rows * panelHeight + 64;
  const start = data.records.find((r) => r.key === row.start),
    end = data.records.find((r) => r.key === row.end),
    title = (r: typeof start, key: string) =>
      r ? [r.number, r.name].filter(Boolean).join(" · ") : key,
    pieces = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="100%" height="100%" fill="#fff"/>`,
      `<style>text{font-family:DejaVu Sans,sans-serif;fill:#20343b}.label{font-size:11px}.small{font-size:11px}.title{font-size:21px;font-weight:bold}</style>`,
      `<text x="24" y="32" class="title">Map-data render of actual calculated route</text>`,
      `<text x="24" y="58" font-size="14">${xml(title(start, row.start))} → ${xml(title(end, row.end))}</text>`,
      `<text x="24" y="80" class="small">${status === "baseline" ? "BASELINE · unchanged earlier dataset; this does not demonstrate a new repair" : status === "source-diagnostic" ? "SOURCE DIAGNOSTIC · public navigation unverified; this is not a published repair" : "CANDIDATE · bound to the completed original navigation QA"}</text>`,
      `<text x="24" y="100" class="small">${xml(row.mode ?? "Recorded route")} · ${route.distanceMetres.toFixed(1)} m · ${levels.length} route level(s) · Not a browser screenshot</text>`,
    ];
  let rampTriangles = 0,
    nativeParts = 0,
    nativeHoles = 0,
    roomParts = 0,
    drawnPaths = 0,
    transitions = 0;
  for (const [panel, levelId] of levels.entries()) {
    const relevant = route.paths.filter((p) => p.levelIds.includes(levelId)),
      all = relevant.flatMap((p) => p.pointsFeet),
      crop = bounds(all),
      margin = Math.max(
        14,
        Math.max(crop.hi[0] - crop.lo[0], crop.hi[1] - crop.lo[1]) * 0.12,
      );
    crop.lo = crop.lo.map((n) => n - margin);
    crop.hi = crop.hi.map((n) => n + margin);
    const left = (panel % 3) * panelWidth + 12,
      top = 124 + Math.floor(panel / 3) * panelHeight,
      boxWidth = panelWidth - 24,
      boxHeight = panelHeight - 44,
      scale = Math.min(
        (boxWidth - 24) / (crop.hi[0] - crop.lo[0]),
        (boxHeight - 24) / (crop.hi[1] - crop.lo[1]),
      ),
      tx = left + boxWidth / 2 - ((crop.lo[0] + crop.hi[0]) / 2) * scale,
      ty = top + 28 + boxHeight / 2 + ((crop.lo[1] + crop.hi[1]) / 2) * scale,
      screen = (p: Point) => [tx + p[0] * scale, ty - p[1] * scale],
      physical = data.nativePhysicalLevels?.levels.find(
        (l) => l.nativeLevelId === levelId,
      ),
      sourceLevel = data.nativeLevels.find((l) => l.id === levelId),
      mapping = data.nativeExploreMapping?.levels.find(
        (l) => l.levelId === levelId,
      ),
      floorParts: Part[] = mapping
        ? mapping.regions.flatMap((r) => r.displayPartsFeet ?? [r.ringsFeet])
        : (data.walkingSupport?.floors ?? [])
            .filter((f) => f.elevationFeet === sourceLevel?.elevationFeet)
            .flatMap((f) => f.partsFeet ?? [f.ringsFeet]),
      visible = floorParts.filter((p) => meets(bounds(p.flat()), crop)),
      floorPaths = visible.map(partPath),
      clip = `floor-${panel}`,
      viewport = `view-${panel}`;
    assert(
      visible.length,
      `No stored numeric native floor geometry for route level ${levelId}`,
    );
    nativeParts += visible.length;
    nativeHoles += visible.reduce((n, part) => n + part.length - 1, 0);
    pieces.push(
      `<text x="${left + 8}" y="${top + 15}" font-size="15" font-weight="bold">${xml(physical?.sourceName ?? sourceLevel?.name ?? `Level ${levelId}`)} · native ID ${levelId}</text>`,
      `<defs><clipPath id="${viewport}"><rect x="${left}" y="${top + 28}" width="${boxWidth}" height="${boxHeight}"/></clipPath></defs>`,
      `<g clip-path="url(#${viewport})"><rect x="${left}" y="${top + 28}" width="${boxWidth}" height="${boxHeight}" fill="#d2d8d5"/>`,
      `<g transform="matrix(${scale} 0 0 ${-scale} ${tx} ${ty})">`,
      `<defs><clipPath id="${clip}" clipPathUnits="userSpaceOnUse">${floorPaths.map((d) => `<path d="${d}" clip-rule="evenodd"/>`).join("")}</clipPath></defs>`,
      ...floorPaths.map(
        (d) => `<path d="${d}" fill="#bed8cb" fill-rule="evenodd"/>`,
      ),
    );
    if (data.rampDisplay?.sourceModelSha256 === data.source.modelSha256) {
      for (const ramp of data.rampDisplay.ramps.filter((r) =>
        r.levelIds.includes(levelId),
      )) {
        for (const triangle of ramp.displayTrianglesFeet ??
          ramp.trianglesFeet) {
          assert(
            triangle.length === 3 &&
              triangle.every((p) => p.length === 3 && finite(p)),
            "Malformed original displayed ramp triangle",
          );
          if (!meets(bounds(triangle), crop)) continue;
          const [a, b, c] = triangle;
          if ((b[0] - a[0]) * (c[1] - a[1]) === (b[1] - a[1]) * (c[0] - a[0]))
            continue;
          pieces.push(`<path d="${partPath([triangle])}" fill="#bed8cb"/>`);
          rampTriangles++;
        }
      }
    }
    pieces.push(`<g clip-path="url(#${clip})">`);
    const records = data.records.filter(
      (r) =>
        nativeRecordPhysicalLevelId(data, r) === levelId &&
        r.ringsFeet.length > 0 &&
        r.ringsFeet.every((ring) => ring.length >= 3 && ring.every(finite)) &&
        meets(bounds(r.ringsFeet.flat()), crop),
    );
    for (const record of records) {
      if (!record.circulation && !record.stair) {
        pieces.push(
          `<path d="${partPath(record.ringsFeet)}" fill="#f4f4ef" fill-rule="evenodd"/>`,
        );
        roomParts++;
      }
    }
    pieces.push(`</g></g>`);
    for (const record of records) {
      if (
        record.arrivalNodeId === route.nodeIds[0] ||
        record.arrivalNodeId === route.nodeIds.at(-1)
      )
        continue;
      const label =
          record.number ||
          (record.key.startsWith("landing:")
            ? record.name.replace(/^Native /, "")
            : ""),
        p =
          data.nodes.find((n) => n.id === record.arrivalNodeId)?.pointFeet ??
          (record.properties.labelPointFeet as number[] | undefined);
      if (label && p && finite(p) && meets(bounds([p]), crop)) {
        const [x, y] = screen(p);
        pieces.push(
          `<text x="${x}" y="${y}" text-anchor="middle" class="label">${xml(label)}</text>`,
        );
      }
    }
    for (const [index, p] of relevant.entries()) {
      const isTransition =
          new Set(p.levelIds).size > 1 ||
          p.sourceReason === "vertical-transition",
        points = p.pointsFeet.map((point) => screen(point).join(",")).join(" "),
        color = isTransition ? "#da741f" : "#0789cf";
      pieces.push(
        `<polyline points="${points}" fill="none" stroke="white" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>`,
        `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"${isTransition ? ' stroke-dasharray="7 5"' : ""}/>`,
      );
      drawnPaths++;
      if (isTransition) {
        transitions++;
        const a = screen(p.pointsFeet[0]),
          b = screen(p.pointsFeet.at(-1)!),
          edge = data.edges.find((e) => p.edgeIds.includes(e.id)),
          levelName = (id: number) =>
            data.nativePhysicalLevels?.levels.find(
              (l) => l.nativeLevelId === id,
            )?.sourceName ?? `Level ${id}`,
          message = `${edge?.kind ?? "Transition"} · ${p.levelIds.map(levelName).join(" → ")} (plan projection)`,
          labelX = Math.max(
            left + 10,
            Math.min(
              (a[0] + b[0]) / 2 - 110,
              left + boxWidth - message.length * 5.7,
            ),
          ),
          labelY = (a[1] + b[1]) / 2 - 16 - index * 3;
        pieces.push(
          `<circle cx="${a[0]}" cy="${a[1]}" r="6" fill="white" stroke="${color}" stroke-width="3"/>`,
          `<circle cx="${b[0]}" cy="${b[1]}" r="6" fill="white" stroke="${color}" stroke-width="3"/>`,
          `<rect x="${labelX - 4}" y="${labelY - 12}" width="${message.length * 5.7 + 8}" height="17" rx="3" fill="white" fill-opacity=".92"/>`,
          `<text x="${labelX}" y="${labelY}" class="label">${xml(message)}</text>`,
        );
      }
    }
    const endpoints = [
      route.paths[0].pointsFeet[0],
      route.paths.at(-1)!.pointsFeet.at(-1)!,
    ];
    for (const [i, p] of endpoints.entries()) {
      const owner = i ? route.paths.at(-1)! : route.paths[0];
      const node = data.nodes.find(
          (node) => node.id === (i ? route.nodeIds.at(-1) : route.nodeIds[0]),
        ),
        endpointLevel =
          node && owner.levelIds.includes(node.levelId)
            ? node.levelId
            : i
              ? owner.levelIds.at(-1)
              : owner.levelIds[0];
      if (endpointLevel !== levelId) continue;
      const [x, y] = screen(p);
      pieces.push(
        `<circle cx="${x}" cy="${y}" r="9" fill="${i ? "#1f536b" : "#fff"}" stroke="#123f51" stroke-width="3"/>`,
        `<text x="${x + 13}" y="${y + 5}" class="label">${i ? "End" : "Start"}${xml((i ? end : start)?.number ? ` · ${(i ? end : start)!.number}` : "")}</text>`,
      );
    }
    pieces.push(
      `</g><rect x="${left}" y="${top + 28}" width="${boxWidth}" height="${boxHeight}" fill="none" stroke="#a6b3ae"/>`,
    );
  }
  pieces.push(
    `<text x="24" y="${height - 42}" class="small">Blue: actual same-level path · Orange dashes: actual transition projected in plan on both served levels</text>`,
    `<text x="24" y="${height - 23}" class="small">Stored numeric native floor polygons retain all rings and holes. Saved circulation/room identities supply the simple figure palette.</text>`,
    `</svg>`,
  );
  return {
    svg: pieces.join("\n"),
    statistics: {
      levels,
      nativeParts,
      nativeHoles,
      rampTriangles,
      roomParts,
      drawnPaths,
      projectedTransitionCopies: transitions,
      originalRoutePaths: route.paths.length,
      originalRoutePoints: route.paths.reduce(
        (n, p) => n + p.pointsFeet.length,
        0,
      ),
      routeGeometryChanged: false,
      newRouteSegmentsGenerated: false,
      browserScreenshot: false,
      exactResiduals:
        "Only stored numeric display parts are painted; exact residual authority remains in the byte-bound input and is not rounded into substitute polygons.",
    },
  };
}

async function main() {
  const args = process.argv.slice(2),
    value = (name: string) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    },
    required = (name: string) => {
      const v = value(name);
      assert(v && !v.startsWith("--"), `Missing ${name}`);
      return v;
    };
  if (args.includes("--help")) {
    console.log(
      "render-actual-route-data.ts --visitor VISITOR.zip --routes ACTUAL-CALCULATOR.json --status baseline|candidate --out NEW-EMPTY-DIR [--row INDEX | --case NAME] [--qa-report PASSED-CANDIDATE-REPORT.json]",
    );
    return;
  }
  const visitorPath = path.resolve(required("--visitor")),
    routesPath = path.resolve(required("--routes")),
    status = required("--status");
  assert(status === "baseline" || status === "candidate");
  const out = path.resolve(required("--out"));
  await fs.mkdir(out, { recursive: true });
  assert.equal((await fs.readdir(out)).length, 0);
  let archive: Uint8Array | undefined = new Uint8Array(
    await fs.readFile(visitorPath),
  );
  const visitorSha256 = sha(archive),
    entries = unzipSync(archive, {
      filter: (e) =>
        e.name === "manifest.json" || e.name === "viewer/indoor.json",
    });
  archive = undefined;
  const manifest = JSON.parse(
      new TextDecoder().decode(entries["manifest.json"]),
    ),
    raw = entries["viewer/indoor.json"];
  assert.equal(manifest.format, "openindoormaps-viewer");
  assert.equal(raw.length, manifest.indoor.bytes);
  assert.equal(sha(raw), manifest.indoor.sha256);
  const data = JSON.parse(new TextDecoder().decode(raw)) as IndoorDataset;
  delete entries["viewer/indoor.json"];
  globalThis.gc?.();
  const routesBytes = new Uint8Array(await fs.readFile(routesPath)),
    document = JSON.parse(new TextDecoder().decode(routesBytes)),
    projectionSha256 = sha(JSON.stringify(routeWorkerDataset(data)));
  assert.equal(
    document.candidateRoutingProjectionSha256 ??
      document.sourceRoutingDatasetSha256,
    projectionSha256,
    "Actual route JSON belongs to another source dataset",
  );
  if (document.candidatePackageSha256)
    assert.equal(document.candidatePackageSha256, visitorSha256);
  if (status === "candidate") {
    const qa = JSON.parse(await fs.readFile(required("--qa-report"), "utf8"));
    assert.equal(qa.passed, true);
    assert.equal(qa.candidatePackageSha256, visitorSha256);
    assert.equal(qa.actualRouteGeometriesFileSha256, sha(routesBytes));
  }
  const rows = document.rows as RecordedRouteRow[],
    row = value("--case")
      ? rows.find((r) => r.name === value("--case"))
      : rows[Number(value("--row") ?? 0)];
  assert(row, "Requested original calculation was not found");
  const rendered = renderActualRouteSvg(data, row, status),
    svgPath = path.join(out, "actual-route.svg");
  await fs.writeFile(svgPath, rendered.svg, { flag: "wx" });
  const receipt = {
    format: "openindoormaps-actual-route-map-data-render-v1",
    status,
    visitorPath,
    visitorSha256,
    indoorSha256: manifest.indoor.sha256,
    routesPath,
    routesSha256: sha(routesBytes),
    routingProjectionSha256: projectionSha256,
    svgSha256: sha(rendered.svg),
    selectedCase: {
      name: row.name,
      start: row.start,
      end: row.end,
      mode: row.mode,
    },
    ...rendered.statistics,
    label: "Map-data render of actual calculated route",
    sourceAuthority: document.authority,
    memory: process.memoryUsage(),
  };
  await fs.writeFile(
    path.join(out, "render-receipt.json"),
    JSON.stringify(receipt, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify({ svgPath, ...receipt }));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
