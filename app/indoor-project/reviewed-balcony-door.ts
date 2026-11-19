import type { IndoorDataset } from "./contract";
import type { SharedGuidePoint as XYZ } from "./shared-corridor-guides";
import type { ReviewedStationDoor } from "./reviewed-station-door";
import {
  balconyWalkingSupport,
  balconyFloor as floor,
  balconyLevel,
  balconyCell,
} from "./reviewed-balcony-support";

const north = "rm-402367-133b24ba6565",
  south = "rm-402367-039546889998";

export function balconyDoorSpec(
  data: IndoorDataset,
): ReviewedStationDoor | undefined {
  if (
    data.source.modelSha256 !==
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" ||
    data.source.roomsSha256 !==
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9" ||
    data.edges.some(
      (e) => e.nativeElementId === 2131263 || e.id === "door:402367:2131263",
    ) ||
    data.nativeDoorBoundaryClosures?.doors.some(
      (d) =>
        d.nativeElementId === 2131263 &&
        (!d.selectionBarrierOnly ||
          d.evidenceSha256 !==
            "c7cbdd5c572cdd3801563c6cad000ae7765d7c6e511d3e345d7f3a60aa30d18a"),
    )
  )
    return;
  const door = data.doors?.find((d) => d.id === "door:402367:2131263");
  if (
    !door ||
    door.nativeElementId !== 2131263 ||
    door.hostWallNativeElementId !== 2131262 ||
    door.levelId !== balconyLevel ||
    door.state !== "unmatched" ||
    door.drawingBackedPatchId ||
    JSON.stringify(door.roomKeys) !== JSON.stringify([south]) ||
    JSON.stringify(door.pointFeet) !==
      "[-68.4508160142962,305.72628644297896]" ||
    JSON.stringify(door.normalFeet) !== "[0,1]" ||
    JSON.stringify(door.footprintFeet) !==
      "[[-70.50462178857441,305.49662765032804],[-66.39701024001798,305.49662765032804],[-66.39701024001798,305.9559452356299],[-70.50462178857441,305.9559452356299]]"
  )
    return;
  for (const [key, number] of [
    [north, "04-423"],
    [south, "04-430"],
  ]) {
    const r = data.records.find((r) => r.key === key);
    if (
      !r ||
      r.number !== number ||
      r.levelId !== balconyLevel ||
      r.building !== "04" ||
      !r.circulation ||
      !r.walkable ||
      r.access === "staff"
    )
      return;
  }
  const points: XYZ[] = [
    [-86.83907088935268, 366.84156131352324, floor],
    [-76.3, 357.1, floor],
    [-73.19999999999945, 348.2000000000015, floor],
    [-68.4508160142962, 306.62628644297894, floor],
    [-68.4508160142962, 304.826286442979, floor],
    [-69.19999999999939, 249.80000000000015, floor],
    [-70.31826972460263, 247.57467235836796, floor],
  ];
  return {
    nativeDoorId: 2131263,
    levelId: balconyLevel,
    roomKeys: [north, south],
    terminalIds: ["arrival:" + north, "arrival:" + south],
    guideEdgeIds: [
      balconyCell + ":walk:arrival:" + north + "|connector:unbc-04-lift:3",
      balconyCell + ":walk:arrival:" + south + "|door:402367:1116755:0",
    ],
    paths: [points.slice(0, 4), points.slice(3, 5), points.slice(4)],
    supported: () => balconyWalkingSupport(data, door, points),
    evidence:
      "Owner confirmed two-way public use of the Floor 4 balcony through native door 2131263 between corridors 04-423 and 04-430. Native floor support, atrium openings, host gap and both public approach stations are checked. Threshold accessibility is unverified.",
  };
}
