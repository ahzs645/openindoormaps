import type { IndoorDataset, IndoorRecord } from "./contract";

const rotundas = new Map<string, readonly [string, number, number]>([
  ["rm-311-2054e6ddb852", ["04-124", 311, 3.2808398950131235]],
  ["rm-694-07de695d7751", ["04-259", 694, 14.435695538057743]],
  ["rm-400176-0f6e59c1a3f5", ["04-329", 400176, 24.278215223097114]],
] as const);

/** Owner decision D5 identifies the public rotunda perimeter. Its actual native
 * walking cells, openings, access restrictions and other room owners still apply.
 * The floor-four rotunda is a recorded floor opening and supplies no pathway. */
export function reviewedRotundaPassage(
  data: Pick<IndoorDataset, "source">,
  room?: Pick<
    IndoorRecord,
    | "key"
    | "name"
    | "number"
    | "building"
    | "levelId"
    | "elevationFeet"
    | "walkable"
    | "stair"
    | "access"
  >,
) {
  if (
    !room ||
    !room.walkable ||
    room.access === "staff" ||
    room.stair ||
    room.name !== "Rotunda" ||
    room.building !== "04"
  )
    return false;
  const role = rotundas.get(room.key);
  return (
    !!role &&
    room.number === role[0] &&
    room.levelId === role[1] &&
    room.elevationFeet === role[2] &&
    data.source.modelSha256 ===
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" &&
    data.source.roomsSha256 ===
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9"
  );
}
export function pathwayCirculationOwner(
  data: Pick<IndoorDataset, "source">,
  room?: IndoorRecord,
) {
  return !!room && (room.circulation || reviewedRotundaPassage(data, room));
}
