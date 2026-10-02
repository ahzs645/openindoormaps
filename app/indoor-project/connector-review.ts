import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { IndoorProject } from "./package";
/** Same version-1 source review consumed by Reviter's --connectors option. */
export type SourceConnectorReview = {
  version: 1;
  modelSha256: string;
  connectors: {
    id: string;
    kind: "elevator" | "escalator";
    nativeElementId: number;
    evidence: string;
    reviewedShaft?: {
      pinId: string;
      pointFeet: [number, number];
      wallElementIds: number[];
    };
    accessible: "yes" | "no" | "unknown";
    direction: "both" | "from-to" | "to-from";
    entrances: {
      roomKey: string;
      levelId: number;
      nativeElementId: number;
      pointFeet: [number, number];
    }[];
  }[];
};
export function validateSourceConnectorReview(
  value: unknown,
  modelSha256: string,
): asserts value is SourceConnectorReview {
  const source = value as SourceConnectorReview;
  if (
    !source ||
    source.version !== 1 ||
    source.modelSha256 !== modelSha256 ||
    !Array.isArray(source.connectors) ||
    source.connectors.length > 5000
  )
    throw new Error(
      "Connector review belongs to different model bytes or has an invalid format.",
    );
  const ids = new Set<string>();
  for (const c of source.connectors) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !c.id.trim() ||
      c.id.length > 200 ||
      ids.has(c.id) ||
      !["elevator", "escalator"].includes(c.kind) ||
      (c.reviewedShaft !== undefined && !validShaft(c)) ||
      !Number.isSafeInteger(c.nativeElementId) ||
      typeof c.evidence !== "string" ||
      !c.evidence.trim() ||
      c.evidence.length > 10_000 ||
      !["yes", "no", "unknown"].includes(c.accessible) ||
      !["both", "from-to", "to-from"].includes(c.direction) ||
      !Array.isArray(c.entrances) ||
      c.entrances.length < 2 ||
      c.entrances.length > 200 ||
      new Set(c.entrances.map((e) => e?.levelId)).size !== c.entrances.length ||
      (c.kind === "escalator" &&
        (c.direction === "both" ||
          c.accessible === "yes" ||
          c.entrances.length !== 2)) ||
      c.entrances.some(
        (e) =>
          !e ||
          typeof e.roomKey !== "string" ||
          !e.roomKey ||
          !Number.isSafeInteger(e.levelId) ||
          !Number.isSafeInteger(e.nativeElementId) ||
          !Array.isArray(e.pointFeet) ||
          e.pointFeet.length !== 2 ||
          !e.pointFeet.every((p) => Number.isFinite(p) && Math.abs(p) < 1e7),
      )
    )
      throw new Error(
        "Invalid connector identity, served floors, direction or accessibility.",
      );
    ids.add(c.id);
  }
}
export function sourceConnectorReview(
  project: IndoorProject,
): SourceConnectorReview {
  return (
    (project.rooms.indoorConnectors as SourceConnectorReview | undefined) ?? {
      version: 1,
      modelSha256: project.dataset.source.modelSha256,
      connectors: [],
    }
  );
}
export function reviewConnector(
  project: IndoorProject,
  connector: SourceConnectorReview["connectors"][number],
): IndoorProject {
  if (project.dataset.connectors?.some((c) => c.id === connector.id))
    throw new Error(
      "This connector is already compiled. Reviter must regenerate changes to its served entrances.",
    );
  const source = sourceConnectorReview(project);
  if (
    source.version !== 1 ||
    source.modelSha256 !== project.dataset.source.modelSha256
  )
    throw new Error("Connector review belongs to different model bytes.");
  if (
    !connector.id.trim() ||
    connector.id.length > 200 ||
    !Number.isSafeInteger(connector.nativeElementId) ||
    connector.nativeElementId <= 0 ||
    !connector.evidence.trim() ||
    connector.evidence.length > 10_000 ||
    !["elevator", "escalator"].includes(connector.kind) ||
    !["yes", "no", "unknown"].includes(connector.accessible) ||
    !["both", "from-to", "to-from"].includes(connector.direction) ||
    connector.entrances.length < 2 ||
    connector.entrances.length > 200 ||
    new Set(connector.entrances.map((e) => e.levelId)).size !==
      connector.entrances.length ||
    (connector.kind === "escalator" &&
      (connector.direction === "both" ||
        connector.accessible === "yes" ||
        connector.entrances.length !== 2))
  )
    throw new Error(
      "Provide a native connector ID, evidence and at least two distinct served floors.",
    );
  const buildings = new Set<string>();
  for (const e of connector.entrances) {
    const r = project.dataset.records.find(
      (r) => r.key === e.roomKey && r.levelId === e.levelId,
    );
    if (
      !r ||
      !r.walkable ||
      r.access === "staff" ||
      !Number.isSafeInteger(e.nativeElementId) ||
      e.nativeElementId <= 0 ||
      e.pointFeet.length !== 2 ||
      !e.pointFeet.every((p) => Number.isFinite(p) && Math.abs(p) < 1e7) ||
      !booleanPointInPolygon(e.pointFeet, {
        type: "Polygon",
        coordinates: r.ringsFeet.map((ring) => [...ring, ring[0]]),
      })
    )
      throw new Error(
        "Each entrance needs its native element ID and a point inside a walkable public room on its served floor.",
      );
    buildings.add(r.building);
  }
  if (connector.reviewedShaft && !validShaft(connector))
    throw new Error("Provide the source pin and native shaft wall identities.");
  if (!connector.reviewedShaft && buildings.size !== 1)
    throw new Error("All elevator entrances must be in the same building.");
  const next = { ...project, rooms: structuredClone(project.rooms) };
  next.rooms.indoorConnectors = {
    ...source,
    connectors: [
      ...source.connectors.filter((c) => c.id !== connector.id),
      structuredClone(connector),
    ],
  };
  validateSourceConnectorReview(
    next.rooms.indoorConnectors,
    project.dataset.source.modelSha256,
  );
  // Keep the compiled graph untouched. Only Reviter has the full native model,
  // floor associations and barrier checks needed to authorize these new stops.
  return next;
}
export function removeConnectorReview(
  project: IndoorProject,
  id: string,
): IndoorProject {
  if (project.dataset.connectors?.some((c) => c.id === id))
    throw new Error(
      "Remove a compiled connector in Reviter and regenerate its graph.",
    );
  const source = sourceConnectorReview(project);
  return {
    ...project,
    rooms: {
      ...project.rooms,
      indoorConnectors: {
        ...source,
        connectors: source.connectors.filter((c) => c.id !== id),
      },
    },
  };
}

export function validShaft(
  c: Pick<
    SourceConnectorReview["connectors"][number],
    "kind" | "nativeElementId" | "reviewedShaft"
  >,
) {
  const s = c.reviewedShaft;
  return (
    !!s &&
    c.kind === "elevator" &&
    typeof s.pinId === "string" &&
    !!s.pinId.trim() &&
    s.pinId.length <= 200 &&
    Array.isArray(s.pointFeet) &&
    s.pointFeet.length === 2 &&
    s.pointFeet.every((p) => Number.isFinite(p) && Math.abs(p) < 1e7) &&
    Array.isArray(s.wallElementIds) &&
    s.wallElementIds.length >= 3 &&
    s.wallElementIds.length <= 100 &&
    new Set(s.wallElementIds).size === s.wallElementIds.length &&
    s.wallElementIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
    s.wallElementIds.includes(c.nativeElementId)
  );
}
