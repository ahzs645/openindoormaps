import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { readIndoorProject } from "../../app/indoor-project/package";
const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
export function fixture(): IndoorDataset {
  return {
    format: "reviter-indoor",
    version: 1,
    generator: "reviter/indoor-pipeline-1",
    source: {
      modelFileName: "review.rvt",
      modelSha256: "a".repeat(64),
      roomsSha256: "b".repeat(64),
    },
    alignment: {
      originFeet: [0, 0, 0],
      originGeographic: [-122, 53],
      projectionLatitude: 53,
      rotationRadians: 0,
      horizontalMetresPerFoot: 0.3048,
      verticalMetresPerFoot: 0.3048,
      rmsMetres: 0,
      referenceCount: 2,
    },
    floors: [{ id: "first", name: "Floor 1", levelIds: [1], elevationFeet: 0 }],
    nativeLevels: [{ id: 1, name: "Floor 1", elevationFeet: 0 }],
    presentation: {
      version: 1,
      generator: "reviter/native-room-presentation-2",
      sourceModelSha256: "a".repeat(64),
      junctionToleranceFeet: 0.04,
      rooms: [],
      diagnostics: [
        {
          roomKey: "0",
          levelId: 1,
          code: "no-native-enclosure",
          message: "Native walls do not enclose this room.",
        },
      ],
    },
    records: ["Office", "Corridor", "Staff", "Stair", "Void"].map(
      (name, i) => ({
        key: String(i),
        number: `01-${i}`,
        name,
        building: "01",
        levelId: 1,
        elevationFeet: 0,
        elevationEvidence: "Native floor",
        surfaceId: "first",
        circulation: name === "Corridor",
        stair: name === "Stair",
        access: name === "Staff" ? "staff" : "unknown",
        walkable: name !== "Void",
        confidence: 1,
        properties: {},
        ringsFeet: [
          [
            [i * 20, 0],
            [i * 20 + 10, 0],
            [i * 20 + 10, 10],
            [i * 20, 10],
          ],
        ],
      }),
    ),
    nodes: [],
    edges: [],
    walls: [],
    issues: [],
    report: {
      recordCount: 5,
      routableArrivals: 0,
      components: 0,
      largestComponentArrivals: 0,
      unmatchedDoors: 0,
      cellSizeFeet: 0.6,
      omittedSourceLabels: 0,
    },
  };
}
export async function project() {
  const data = fixture(),
    model = strToU8("model bytes must survive review"),
    rooms = {
      format: "reviter-room-annotations",
      version: 1,
      model: { fileName: "review.rvt" },
      annotations: data.records.map((r) => ({ key: r.key, name: r.name })),
      georeference: { points: [] },
    };
  const floorBytes = strToU8(JSON.stringify(rooms)),
    gis = strToU8(JSON.stringify(rooms.georeference));
  data.source.modelSha256 = hash(model);
  data.presentation!.sourceModelSha256 = data.source.modelSha256;
  data.source.roomsSha256 = hash(floorBytes);
  const indoor = strToU8(JSON.stringify(data));
  const entry = (path: string, bytes: Uint8Array) => ({
    path,
    bytes: bytes.length,
    sha256: hash(bytes),
  });
  const manifest = {
    format: "reviter-project",
    version: 2,
    createdAt: "2026-10-03",
    model: {
      ...entry("model/review.rvt", model),
      fileName: "review.rvt",
      lastModified: 1,
    },
    floors: entry("floors/rooms.json", floorBytes),
    georeference: entry("gis/reference-points.json", gis),
    indoor: entry("viewer/indoor.json", indoor),
  };
  return readIndoorProject(
    zipSync({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "model/review.rvt": model,
      "floors/rooms.json": floorBytes,
      "gis/reference-points.json": gis,
      "viewer/indoor.json": indoor,
    }),
  );
}
export async function gapProject() {
  const p = await project();
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
  p.dataset.records = p.dataset.records.slice(0, 2);
  p.rooms.annotations = p.rooms.annotations.slice(0, 2);
  p.dataset.records[0].ringsFeet = [rect(1, 1, 10, 10)];
  p.dataset.records[1].ringsFeet = [rect(18, 1, 10, 10)];
  p.dataset.walkingSupport = {
    version: 1,
    sourceModelSha256: p.dataset.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 30, 20), rect(3, 14, 3, 3)],
      },
    ],
  };
  p.dataset.walls = [
    {
      kind: "wall",
      nativeElementId: 200,
      levelId: 1,
      ringsFeet: [rect(14.8, 0, 0.4, 7.25)],
    },
    {
      kind: "wall",
      nativeElementId: 201,
      levelId: 1,
      ringsFeet: [rect(14.8, 12.75, 0.4, 7.25)],
    },
  ];
  return p;
}

/** Two independent gaps connect the same rooms: one repair alone must not isolate either room. */
export async function coupledGapProject() {
  const p = await gapProject();
  const wall = (id: number, y: number, height: number) => ({
    kind: "wall" as const,
    nativeElementId: id,
    levelId: 1,
    ringsFeet: [
      [
        [14.8, y],
        [15.2, y],
        [15.2, y + height],
        [14.8, y + height],
      ],
    ] as [number, number][][],
  });
  p.dataset.walls = [wall(200, 0, 5), wall(201, 6, 8), wall(202, 15, 5)];
  return p;
}
