import * as DMath from "./deterministic-math";
import { floorDisplayName } from "./floor-display-name";
import type { IndoorDataset } from "./contract";
import type { IndoorProject } from "./package";
import { interiorLabelPoint } from "./interior-label-point";
import {
  validateBasemapBuildings,
  type BasemapBuildingSettings,
} from "./basemap-buildings";

export type EditPoint = [number, number];
export type MapAnnotation = {
  id: string;
  kind: "label" | "area" | "line";
  levelId: number;
  text: string;
  notes: string;
  color: string;
  fontSize: number;
  pointsFeet: EditPoint[];
  symbol?: string;
  rotation?: number;
  roomKey?: string;
  shape?: "rectangle" | "circle" | "measure";
};
export type MapEdits = {
  version: 1;
  sourceModelSha256: string;
  annotations: MapAnnotation[];
  locations?: MapLocation[];
  floorNames?: Record<string, string>;
  basemapBuildings?: BasemapBuildingSettings;
};
export type MapLocation = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  color: string;
  symbol: string;
  roomKeys: string[];
  website: string;
  phone: string;
  hours: string;
  links: { title: string; url: string }[];
  photos: string[];
  logo: string;
  showLabel: boolean;
  position?: { levelId: number; pointFeet: EditPoint };
};
export const editorSymbols = {
  none: "Text only",
  pin: "Location",
  study: "Study / library",
  coffee: "Coffee / food",
  washroom: "Washroom",
  wheelchair: "Accessibility",
  stairs: "Stairs",
  elevator: "Elevator",
  exit: "Emergency exit",
  firstAid: "First aid",
  aed: "AED",
  extinguisher: "Fire extinguisher",
  assembly: "Assembly point",
  warning: "Hazard",
  quiet: "Quiet space",
  water: "Drinking water",
  parking: "Parking",
  security: "Security",
  information: "Information",
  recycling: "Recycling",
} as const;
export function safeEditorUrl(value: string): boolean {
  if (!value) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Presentation annotations stay separate from surveyed geometry and routes. */
export function validateMapEdits(
  value: unknown,
  data: IndoorDataset,
): asserts value is MapEdits {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.sourceModelSha256 !== data.source.modelSha256 ||
    !Array.isArray(value.annotations) ||
    value.annotations.length > 5000
  )
    throw new Error(
      "Map annotations do not match this model or exceed the limit.",
    );
  const ids = new Set<string>();
  if (value.basemapBuildings !== undefined)
    validateBasemapBuildings(value.basemapBuildings);
  const levels = new Set(data.nativeLevels.map((level) => level.id));
  for (const item of value.annotations) {
    if (
      !object(item) ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 100 ||
      ids.has(item.id) ||
      !["label", "area", "line"].includes(String(item.kind)) ||
      !levels.has(item.levelId as number) ||
      typeof item.text !== "string" ||
      !item.text.trim() ||
      item.text.length > 200 ||
      typeof item.notes !== "string" ||
      item.notes.length > 4000 ||
      typeof item.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(item.color) ||
      typeof item.fontSize !== "number" ||
      !Number.isFinite(item.fontSize) ||
      item.fontSize < 10 ||
      item.fontSize > 32 ||
      !Array.isArray(item.pointsFeet) ||
      item.pointsFeet.length > 500 ||
      (item.kind === "label"
        ? item.pointsFeet.length !== 1
        : item.pointsFeet.length < (item.kind === "line" ? 2 : 3)) ||
      (item.symbol !== undefined &&
        !Object.prototype.hasOwnProperty.call(
          editorSymbols,
          String(item.symbol),
        )) ||
      (item.rotation !== undefined &&
        (typeof item.rotation !== "number" ||
          !Number.isFinite(item.rotation) ||
          Math.abs(item.rotation) > 360)) ||
      (item.shape !== undefined &&
        !["rectangle", "circle", "measure"].includes(String(item.shape))) ||
      (item.roomKey !== undefined &&
        !data.records.some(
          (r) => r.key === item.roomKey && r.levelId === item.levelId,
        )) ||
      item.pointsFeet.some(
        (point) =>
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some(
            (n) =>
              typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e8,
          ),
      )
    )
      throw new Error(
        "Invalid map annotation. Check its text, floor, color and coordinates.",
      );
    ids.add(item.id);
    const points = item.pointsFeet as EditPoint[];
    if (item.kind === "area") validateArea(points);
    if (
      item.kind === "line" &&
      points
        .slice(1)
        .some(
          (p, i) =>
            DMath.hypot(p[0] - points[i][0], p[1] - points[i][1]) < 0.001,
        )
    )
      throw new Error("Line points must be distinct.");
  }
  if (value.locations !== undefined) validateLocations(value.locations, data);
  if (
    value.floorNames !== undefined &&
    (!object(value.floorNames) ||
      Object.entries(value.floorNames).some(
        ([id, name]) =>
          !data.floors.some((f) => f.id === id) ||
          typeof name !== "string" ||
          !name.trim() ||
          name.length > 100,
      ))
  )
    throw new Error("Invalid floor display name.");
}
export function setBasemapBuildings(
  project: IndoorProject,
  settings: BasemapBuildingSettings,
): IndoorProject {
  validateBasemapBuildings(settings);
  const mapEdits: MapEdits = {
    version: 1,
    sourceModelSha256: project.dataset.source.modelSha256,
    annotations: [],
    ...project.rooms.mapEdits,
    basemapBuildings: structuredClone(settings),
  };
  validateMapEdits(mapEdits, project.dataset);
  return { ...project, rooms: { ...project.rooms, mapEdits } };
}
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
function validateLocations(
  value: unknown,
  data: IndoorDataset,
): asserts value is MapLocation[] {
  if (!Array.isArray(value) || value.length > 5000)
    throw new Error("Invalid location manager data.");
  const ids = new Set<string>(),
    attached = new Set<string>();
  for (const p of value) {
    if (
      !object(p) ||
      !text(p.id, 100) ||
      !p.id ||
      ids.has(p.id as string) ||
      !text(p.name, 200) ||
      !(p.name as string).trim() ||
      !text(p.description, 4000) ||
      !text(p.category, 100) ||
      !text(p.phone, 100) ||
      !text(p.hours, 2000) ||
      typeof p.showLabel !== "boolean" ||
      !text(p.color, 7) ||
      !/^#[0-9a-f]{6}$/i.test(p.color as string) ||
      !Object.prototype.hasOwnProperty.call(editorSymbols, String(p.symbol)) ||
      !Array.isArray(p.roomKeys) ||
      p.roomKeys.length > 500 ||
      !Array.isArray(p.tags) ||
      p.tags.length > 50 ||
      p.tags.some((t) => !text(t, 100)) ||
      !Array.isArray(p.photos) ||
      p.photos.length > 20 ||
      p.photos.some(
        (u) => !text(u, 2000) || !u || !safeEditorUrl(u as string),
      ) ||
      !text(p.logo, 2000) ||
      !safeEditorUrl(p.logo as string) ||
      !text(p.website, 2000) ||
      !safeEditorUrl(p.website as string) ||
      !Array.isArray(p.links) ||
      p.links.length > 30 ||
      p.links.some(
        (l) =>
          !object(l) ||
          !text(l.title, 100) ||
          !l.title ||
          !text(l.url, 2000) ||
          !l.url ||
          !safeEditorUrl(l.url as string),
      )
    )
      throw new Error(
        "Invalid location details. Use HTTP/HTTPS links, a name, and valid symbols and colors.",
      );
    ids.add(p.id as string);
    for (const key of p.roomKeys) {
      if (
        typeof key !== "string" ||
        !data.records.some((r) => r.key === key) ||
        attached.has(key)
      )
        throw new Error("A room can be attached to only one managed location.");
      attached.add(key);
    }
    if (p.position !== undefined) {
      const pos = p.position;
      if (
        !object(pos) ||
        !data.nativeLevels.some((l) => l.id === pos.levelId) ||
        !Array.isArray(pos.pointFeet) ||
        pos.pointFeet.length !== 2 ||
        pos.pointFeet.some(
          (n) =>
            typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 1e8,
        )
      )
        throw new Error("Invalid location marker position.");
      if (
        p.roomKeys.length > 0 &&
        !p.roomKeys.some((key) =>
          data.records.some((r) => r.key === key && r.levelId === pos.levelId),
        )
      )
        throw new Error(
          "A room-linked marker must stay on an attached room's level.",
        );
    }
  }
}
function validateArea(points: EditPoint[]) {
  const cross = (a: EditPoint, b: EditPoint, c: EditPoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (DMath.hypot(a[0] - b[0], a[1] - b[1]) < 0.001)
      throw new Error("Highlighted areas need distinct corners.");
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0 &&
        Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
          Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
      )
        throw new Error(
          "Highlighted area edges cannot cross or touch each other.",
        );
    }
  }
  if (Math.abs(area) < 0.01)
    throw new Error(
      "Highlighted areas need at least three non-collinear corners.",
    );
}

export function setMapAnnotations(
  project: IndoorProject,
  annotations: MapAnnotation[],
): IndoorProject {
  const mapEdits: MapEdits = {
    ...project.rooms.mapEdits,
    version: 1,
    sourceModelSha256: project.dataset.source.modelSha256,
    annotations: structuredClone(annotations),
    ...(project.rooms.mapEdits?.locations
      ? { locations: project.rooms.mapEdits.locations }
      : {}),
  };
  validateMapEdits(mapEdits, project.dataset);
  return { ...project, rooms: { ...project.rooms, mapEdits } };
}

export function setMapLocations(
  project: IndoorProject,
  locations: MapLocation[],
): IndoorProject {
  const mapEdits: MapEdits = {
    ...project.rooms.mapEdits,
    version: 1,
    sourceModelSha256: project.dataset.source.modelSha256,
    annotations: project.rooms.mapEdits?.annotations ?? [],
    locations: structuredClone(locations),
  };
  validateMapEdits(mapEdits, project.dataset);
  return { ...project, rooms: { ...project.rooms, mapEdits } };
}
export function roomLabelPoint(data: IndoorDataset, key: string): EditPoint {
  const room = data.records.find((r) => r.key === key);
  if (!room) throw new Error("Unknown room for label.");
  const anchor = data.nodes.find((n) => n.id === room.arrivalNodeId);
  if (anchor) return [anchor.pointFeet[0], anchor.pointFeet[1]];
  const interior = interiorLabelPoint(room.ringsFeet);
  if (interior) return interior;
  const points = room.ringsFeet[0];
  return [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ];
}
export function locationAnnotations(project: IndoorProject): MapAnnotation[] {
  return (project.rooms.mapEdits?.locations ?? []).flatMap((location) => {
    if (!location.showLabel) return [];
    const positions = location.position
      ? [location.position]
      : location.roomKeys.map((key) => ({
          levelId: project.dataset.records.find((r) => r.key === key)!.levelId,
          pointFeet: roomLabelPoint(project.dataset, key),
        }));
    return positions.map((pos, i) => ({
      id: `location:${location.id}:${i}`,
      kind: "label" as const,
      levelId: pos.levelId,
      text: location.name,
      notes: location.description,
      color: location.color,
      fontSize: 16,
      symbol: location.symbol,
      pointsFeet: [pos.pointFeet],
    }));
  });
}
export function shapePoints(tool: string, points: EditPoint[]): EditPoint[] {
  if (points.length !== 2 || !["rectangle", "circle"].includes(tool))
    return points;
  const [a, b] = points;
  if (tool === "rectangle") return [a, [b[0], a[1]], b, [a[0], b[1]]];
  const radius = DMath.hypot(b[0] - a[0], b[1] - a[1]);
  return Array.from({ length: 48 }, (_, i) => [
    a[0] + radius * DMath.cos((i * Math.PI) / 24),
    a[1] + radius * DMath.sin((i * Math.PI) / 24),
  ]);
}

/** Inverse of geographicPoint; labels remain registered in native model feet. */
export function nativeEditPoint(
  data: IndoorDataset,
  geographic: EditPoint,
): EditPoint {
  const a = data.alignment;
  const east =
    ((((geographic[0] - a.originGeographic[0]) * Math.PI) / 180) *
      6_378_137 *
      DMath.cos((a.projectionLatitude * Math.PI) / 180)) /
    a.horizontalMetresPerFoot;
  const north =
    ((((geographic[1] - a.originGeographic[1]) * Math.PI) / 180) * 6_378_137) /
    a.horizontalMetresPerFoot;
  const c = DMath.cos(a.rotationRadians),
    s = DMath.sin(a.rotationRadians);
  return [
    a.originFeet[0] + east * c + north * s,
    a.originFeet[1] - east * s + north * c,
  ];
}

export function moveMapAnnotation(
  item: MapAnnotation,
  point: EditPoint,
): MapAnnotation {
  const [x, y] = item.pointsFeet[0];
  return {
    ...item,
    pointsFeet: item.pointsFeet.map((p) => [
      p[0] + point[0] - x,
      p[1] + point[1] - y,
    ]),
  };
}

/** Derive visitor presentation without rewriting source geometry or the ZIP contract. */
export function editorVisitorDataset(project: IndoorProject): IndoorDataset {
  const locations = project.rooms.mapEdits?.locations;
  if (
    !locations?.some((p) => p.roomKeys.length) &&
    !project.rooms.mapEdits?.floorNames
  )
    return { ...project.dataset, floors: project.dataset.floors.map(f => ({...f, name: floorDisplayName(f.name)})) };
  const visitor = structuredClone(
    project.dataset.visitor ?? {
      version: 1 as const,
      buildings: {},
      places: {},
    },
  );
  for (const p of locations ?? [])
    for (const key of p.roomKeys)
      visitor.places[key] = {
        ...visitor.places[key],
        displayName: p.name,
        description: p.description || undefined,
        color: p.color,
        category: [
          "study",
          "food",
          "washroom",
          "department",
          "entrance",
          "other",
        ].includes(p.category)
          ? (p.category as
              | "study"
              | "food"
              | "washroom"
              | "department"
              | "entrance"
              | "other")
          : "other",
      };
  return {
    ...project.dataset,
    visitor,
    floors: project.dataset.floors.map((f) => ({
      ...f,
      name: project.rooms.mapEdits?.floorNames?.[f.id] ?? floorDisplayName(f.name),
    })),
  };
}

export function setFloorDisplayName(
  project: IndoorProject,
  id: string,
  name: string,
): IndoorProject {
  const next = setMapAnnotations(
    project,
    project.rooms.mapEdits?.annotations ?? [],
  );
  const floorNames = { ...next.rooms.mapEdits?.floorNames };
  if (name.trim()) floorNames[id] = name.trim();
  else delete floorNames[id];
  const mapEdits = { ...next.rooms.mapEdits!, floorNames };
  validateMapEdits(mapEdits, project.dataset);
  return { ...next, rooms: { ...next.rooms, mapEdits } };
}
