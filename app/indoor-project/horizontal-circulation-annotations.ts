import { reviewedRotundaPassage } from "./reviewed-rotunda-role";
import type { IndoorDataset, IndoorRecord } from "./contract";

const horizontalNames = new Set([
  "corridor",
  "hallway",
  "lobby",
  "vestibule",
  "delivery vestibule",
  "entrance",
  "circulation",
  "central circulation",
  "reviewed agora circulation",
  "connecting passage",
  "multi purpose circulation space and hall",
  "atrium crosswalk",
  "concrete catwalk",
  "bridge",
  "link",
]);

// The mixed-use records own a native flight as well as a horizontal
// corridor or vestibule. The classification here concerns the printed
// destination; stair edges retain their own native identity and policy.
const reviewedCirculationLabels = new Map<
  string,
  readonly [string, string, number, string, boolean]
>([
  ["rm-694-64239d17d7d8", ["05", "05-201", 694, "Corridor", true]],
  ["rm-694-0cb418ab63c6", ["06", "06-201", 694, "Vestibule", true]],
  // The source review explicitly identifies both 07-203 records as
  // shared atrium circulation. Their room numbers alone are ambiguous.
  ["rm-311-0850e3c8e4ce", ["07", "07-203", 311, "Unnamed area", false]],
  ["rm-311-935a520f9690", ["07", "07-203", 311, "Plaza Street", false]],
] as const);

const reviewedPassages = new Map([
  ["rm-694-3b62e4fee0f2", ["08", "08-245", "Storage"]],
  ["rm-694-44498dfee60e", ["08", "08-249", "Office"]],
]);

/** Source room identity remains available for access, floor membership and
 * label placement. A horizontal passage has no room destination branch. */
export function isHorizontalCirculationAnnotation(
  data: Pick<IndoorDataset, "source">,
  room: Pick<
    IndoorRecord,
    | "key"
    | "name"
    | "number"
    | "circulation"
    | "stair"
    | "levelId"
    | "building"
    | "elevationFeet"
    | "walkable"
    | "access"
  >,
): boolean {
  const sourceMatches =
    data.source.modelSha256 ===
      "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178" &&
    data.source.roomsSha256 ===
      "fa8412e7c44aa16c083cb4dd5238a533c4dfeff62f818ae855bb0968c600a5a9";
  const label = reviewedCirculationLabels.get(room.key);
  if (
    label &&
    sourceMatches &&
    room.circulation &&
    room.walkable &&
    room.access !== "staff" &&
    room.building === label[0] &&
    room.number === label[1] &&
    room.levelId === label[2] &&
    room.name === label[3] &&
    room.stair === label[4]
  )
    return true;
  if (room.stair) return false;
  if (reviewedRotundaPassage(data, room)) return true;
  if (room.circulation && horizontalNames.has(room.name.trim().toLowerCase()))
    return true;
  const identity = reviewedPassages.get(room.key);
  return (
    !!identity &&
    room.levelId === 694 &&
    sourceMatches &&
    identity[0] === room.building &&
    identity[1] === room.number &&
    identity[2] === room.name
  );
}
