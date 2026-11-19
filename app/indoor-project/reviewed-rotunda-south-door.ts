import type { IndoorDataset } from "./contract";
import { nativeCirculationCells } from "./native-circulation";
import { nativeReviewedSillStrip } from "./native-reviewed-sill-strip";
import { pathwayCirculationOwner } from "./reviewed-rotunda-role";
import type { ReviewedStationDoor } from "./reviewed-station-door";
import { chordFitsFiniteDoor } from "./shared-door-crossing";
import { projectLinkPolicy } from "./route-policy";
import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";

const floor = 14.435695538057743,
  topFeet = 14.5997375328084;
const centre = -68.6690225460822,
  northY = 305.38097804402884,
  southY = 304.88885205977687;
const doorId = 2093121,
  sillId = 2093130,
  hostId = 2093117;
const rooms: [string, string] = ["rm-694-07de695d7751", "rm-694-07e5355d7757"];
const cellIds = ["native-cell:14.435696:563", "native-cell:14.435696:573"];
const aperture: [number, number][] = [
  [-70.5144949870271, 303.4944951043964],
  [-66.82355010513731, 303.4944951043964],
  [-66.82355010513731, 306.77533499940944],
  [-70.5144949870271, 306.77533499940944],
];
const sillRing: [number, number][] = [
  [-66.8235501051373, northY],
  [-66.8235501051373, southY],
  [-70.51469609629747, southY],
  [-70.51469609629747, northY],
];
const physicalChildren = [
  2093118, 2093123, 2093124, 2093127, 2093128, 2093129, 2093130, 2093131,
  2093132, 2093133, 2093134, 2093135, 2093136, 2093137, 2093138,
];
const doorKey = "door:694:2093121";
const northStation: XYZ = [-69.09038261244997, 313.82171959966576, floor],
  southStation: XYZ = [-69.65195264110862, 281.51074942272913, floor];
const northCap: XYZ = [centre, 307.52533499940944, floor],
  southCap: XYZ = [centre, 302.7444951043964, floor];

export function rotundaSouthSillSupported(data: IndoorDataset, points: XYZ[]) {
  try {
    if (
      data.source.modelSha256 !==
        "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
      data.source.roomsSha256 !==
        "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" ||
      points.length < 4 ||
      points.some((p) => p[2] !== floor || !p.every(Number.isFinite))
    )
      return false;
    const door = data.doors?.find((q) => q.id === doorKey),
      edge = data.edges.find((e) => e.id === doorKey);
    if (
      !door ||
      !edge?.enabled ||
      edge.kind !== "door" ||
      edge.nativeElementId !== doorId ||
      door.levelId !== 694 ||
      door.nativeElementId !== doorId ||
      door.hostWallNativeElementId !== hostId ||
      door.state !== "connected" ||
      door.drawingBackedPatchId ||
      JSON.stringify(door.roomKeys) !== JSON.stringify(rooms) ||
      JSON.stringify(door.normalFeet) !== "[0,1]" ||
      JSON.stringify(door.footprintFeet) !== JSON.stringify(aperture) ||
      data.nativeDoorBoundaryClosures?.doors.some(
        (q) => q.nativeElementId === doorId,
      )
    )
      return false;
    const records = new Map(data.records.map((r) => [r.key, r]));
    if (
      rooms.some((k, i) => {
        const r = records.get(k);
        return (
          !r ||
          r.levelId !== 694 ||
          r.building !== "04" ||
          r.number !== ["04-259", "04-244"][i] ||
          !r.walkable ||
          r.access === "staff" ||
          !pathwayCirculationOwner(data, r)
        );
      })
    )
      return false;
    if (
      [true, false].some((f) => {
        const policy = projectLinkPolicy(
          records,
          edge,
          [],
          f,
          "public",
          data.source.modelSha256,
          data,
        );
        return policy.blockers.length || policy.requiredRooms.length;
      })
    )
      return false;
    const gate = points
      .slice(1)
      .filter(
        (p, i) =>
          p[0] === centre &&
          points[i]![0] === centre &&
          Math.min(p[1], points[i]![1]) < aperture[0]![1] &&
          Math.max(p[1], points[i]![1]) > aperture[2]![1] &&
          chordFitsFiniteDoor(points[i]!, p, aperture, [0, 1]),
      );
    if (gate.length !== 1) return false;
    const cells = nativeCirculationCells(data, { cellIds: new Set(cellIds) });
    if (
      !cellIds.every((id, i) =>
        cells.some((c) => c.id === id && c.roomKeys.includes(rooms[i]!)),
      )
    )
      return false;
    return nativeReviewedSillStrip(data, door, cells, points, {
      floor,
      topFeet,
      aperture,
      sillRing,
      hostId,
      sillId,
      doorId,
      physicalChildren,
      throughRooms: rooms,
    });
  } catch {
    return false;
  }
}
export function rotundaSouthDoor(data: IndoorDataset): ReviewedStationDoor {
  const gate: XYZ[] = [
    northCap,
    [centre, northY, floor],
    [centre, northY, topFeet],
    [centre, southY, topFeet],
    [centre, southY, floor],
    southCap,
  ];
  return {
    nativeDoorId: doorId,
    levelId: 694,
    roomKeys: rooms,
    guideEdgeIds: [
      cellIds[0] + ":walk:door:694:2093121:0|door:694:2093658:1",
      cellIds[1] + ":walk:door:694:1108459:1|door:694:1108589:1",
    ],
    terminalIds: [doorKey + ":0", "door:694:1108589:1"],
    paths: [[northStation, northCap], gate, [southCap, southStation]],
    reviewedSillHeightFeet: topFeet - floor,
    evidence:
      "Door 2093121 connects the public 04-259 rotunda and 04-244 corridor. Native sill 2093130 rises 50 mm above floor slab 427511.",
    supported: () =>
      rotundaSouthSillSupported(data, [
        northStation,
        northCap,
        southCap,
        southStation,
      ]),
  };
}
