import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import type {
  IndoorDataset,
  IndoorRecord,
} from "../../app/indoor-project/contract";
import {
  geographicPoint,
  validateIndoorDataset,
} from "../../app/indoor-project/routing";
import { readIndoorProject } from "../../app/indoor-project/package";
import { projectDisplayGeometry } from "../../app/indoor-project/display-geometry";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
export const floorOpeningFixturePath =
  "/tmp/oim-synthetic-floor-opening.reviter.zip";
export async function generateFloorOpeningFixture(
  path = floorOpeningFixturePath,
) {
  const record = (
    key: string,
    name: string,
    levelId: number,
    elevationFeet: number,
    ringsFeet: [number, number][][],
    circulation = false,
  ): IndoorRecord => ({
    key,
    number: "",
    name,
    building: "DEMO",
    levelId,
    elevationFeet,
    elevationEvidence: "Synthetic test fixture",
    surfaceId: `surface:${levelId}`,
    circulation,
    stair: false,
    access: "public",
    walkable: true,
    confidence: 1,
    ringsFeet,
    properties: {},
    arrivalNodeId: `arrival:${key}`,
  });
  const visitor = {
    version: 1 as const,
    buildings: {
      DEMO: { name: "Synthetic floor-opening example", shortName: "DEMO" },
    },
    places: {
      "lower-main": {
        displayName: "Lower room through atrium",
        color: "#ff0080",
        landmark: true,
      },
      "upper-room": {
        displayName: "Upper Studio",
        color: "#fff0ce",
        landmark: true,
      },
    },
  };
  const georeference = { synthetic: true };
  const records = [
    record(
      "upper-floor",
      "Upper floor with reviewed source holes",
      2,
      12,
      [rect(0, 0, 80, 60), rect(10, 10, 40, 40), rect(53, 15, 5, 5)],
      true,
    ),
    record("upper-room", "Upper Studio", 2, 12, [rect(60, 30, 16, 20)]),
    record("lower-main", "Lower room through atrium", 1, 0, [
      rect(12, 12, 36, 36),
    ]),
    record("lower-column-recess", "Room beneath a column recess", 1, 0, [
      rect(53, 15, 5, 5),
    ]),
  ];
  const rooms = {
    format: "reviter-room-annotations",
    version: 1,
    model: { fileName: "Synthetic-Floor-Opening.rvt" },
    annotations: records.map((r) => ({
      key: r.key,
      name: r.name,
      walkability: "walkable",
    })),
    georeference,
    visitorMetadata: visitor,
  };
  const model = strToU8(
    "Synthetic opaque model placeholder for renderer regression only. Not a real RVT and not UNBC.",
  );
  const roomBytes = strToU8(JSON.stringify(rooms)),
    gisBytes = strToU8(JSON.stringify(georeference));
  const sha = (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex");
  const data: IndoorDataset = {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: {
      modelFileName: rooms.model.fileName,
      modelSha256: sha(model),
      roomsSha256: sha(roomBytes),
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-123.2, 49.2],
      projectionLatitude: 49.2,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [
      { id: "upper", name: "Level 2", levelIds: [2], elevationFeet: 12 },
      { id: "lower", name: "Level 1", levelIds: [1], elevationFeet: 0 },
    ],
    nativeLevels: [
      { id: 1, name: "Level 1", elevationFeet: 0 },
      { id: 2, name: "Level 2", elevationFeet: 12 },
    ],
    records,
    nodes: [],
    edges: [],
    walls: [
      {
        kind: "column",
        levelId: 2,
        nativeElementId: 100,
        ringsFeet: [rect(53, 15, 5, 5)],
      },
    ],
    visitor,
    issues: [],
    report: {
      recordCount: 4,
      routableArrivals: 4,
      components: 4,
      largestComponentArrivals: 1,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
  data.nodes = records.map((r) => {
    const anchor: [number, number, number] =
      r.key === "upper-room"
        ? [68, 40, r.elevationFeet]
        : r.key === "upper-floor"
          ? [5, 5, r.elevationFeet]
          : r.key === "lower-main"
            ? [30, 30, r.elevationFeet]
            : [55, 17, r.elevationFeet];
    return {
      id: r.arrivalNodeId!,
      roomKey: r.key,
      levelId: r.levelId,
      building: r.building,
      surfaceId: r.surfaceId,
      kind: "arrival",
      pointFeet: anchor,
      geographic: geographicPoint(data, anchor),
    };
  });
  validateIndoorDataset(data);
  const unchanged = JSON.stringify({
    records: data.records,
    nodes: data.nodes,
    edges: data.edges,
  });
  const display = projectDisplayGeometry(data, [2], "DEMO");
  if (
    display.lowerRooms.features.length !== 1 ||
    display.lowerRooms.features[0].properties?.key !== "lower-main" ||
    display.lowerOpenings.features.length !== 1
  )
    throw new Error("Synthetic aperture fixture invalid.");
  if (
    JSON.stringify({
      records: data.records,
      nodes: data.nodes,
      edges: data.edges,
    }) !== unchanged
  )
    throw new Error("Renderer mutated fixture graph/source.");
  const indoorBytes = strToU8(JSON.stringify(data));
  const entry = (path: string, bytes: Uint8Array) => ({
    path,
    bytes: bytes.length,
    sha256: sha(bytes),
  });
  const manifest = {
    format: "reviter-project",
    version: 2,
    createdAt: "2026-10-01T00:00:00Z",
    model: {
      ...entry(`model/${rooms.model.fileName}`, model),
      fileName: rooms.model.fileName,
      lastModified: 0,
    },
    floors: entry("floors/rooms.json", roomBytes),
    georeference: entry("gis/reference-points.json", gisBytes),
    indoor: entry("viewer/indoor.json", indoorBytes),
  };
  const zip = zipSync({
    "manifest.json": strToU8(JSON.stringify(manifest)),
    [`model/${rooms.model.fileName}`]: model,
    "floors/rooms.json": roomBytes,
    "gis/reference-points.json": gisBytes,
    "viewer/indoor.json": indoorBytes,
  });
  await readIndoorProject(zip);
  await mkdir(path.slice(0, Math.max(0, path.lastIndexOf("/"))), {
    recursive: true,
  });
  await writeFile(path, zip);
  return { path, data };
}
if (process.argv[1]?.endsWith("indoor-floor-opening.ts")) {
  const result = await generateFloorOpeningFixture(process.argv[2]);
  process.stdout.write(`${result.path}\n`);
}
