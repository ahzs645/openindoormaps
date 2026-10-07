import type { FeatureCollection, LineString } from "geojson";
import type { ReviewBundle } from "./review-bundle";
import { reviewFileBytes } from "./review-bundle";

export const CAD_INTAKE_PATH = "cad-intake/intake.json";
export type CadPoint = [number, number];
export type CadRoom = {
  key: string;
  number: string;
  name: string;
  anchorMetres: CadPoint;
  ringsMetres: CadPoint[][];
  matchMode: "contains" | "buffer" | null;
  enclosureVerified: false;
  routingEligible: false;
  source: {
    handle: string;
    sheet: string;
    anchorDrawing: CadPoint;
    roomNumberFloor: number;
  };
};
export type CadFloor = {
  id: string;
  ordinal: number;
  name: string;
  elevationMetres: null;
  nativeLevelId: null;
  alignment: {
    rotationDegrees: number;
    translationMetres: CadPoint;
    status: string;
    overlapScore: number;
    alternativeScore: number;
  };
  rooms: CadRoom[];
  stairSymbols: {
    id: string;
    centreMetres: CadPoint;
    ringsMetres: CadPoint[][];
    sourceHandles: string[];
    treadCount: number;
    medianSpacingMetres: number;
    status: string;
    routingEligible: false;
  }[];
  linework: {
    sourceHandle: string;
    type: string;
    layer: string;
    pointsMetres: CadPoint[];
  }[];
};
export type CadBuilding = {
  id: string;
  code: string;
  name: string;
  placement: null;
  coordinateSystem: "building-local-metres";
  floors: CadFloor[];
  connectors: {
    id: string;
    kind: "stair";
    fromFloor: string;
    toFloor: string;
    fromRoom: string | null;
    toRoom: string | null;
    fromHint: string | null;
    toHint: string | null;
    fromPointMetres: CadPoint;
    toPointMetres: CadPoint;
    offsetMetres: number;
    evidence: string;
    status: string;
    routingEligible: false;
  }[];
};
export type CadIntake = {
  format: "openindoormaps-cad-intake";
  version: 1;
  sourceSha256: string;
  evidenceSha256: string;
  sourceFiles: { name: string; sha256: string; sizeBytes: number }[];
  unitEvidence: {
    metresPerDrawingUnit: number;
    registrationCount: number;
    method: string;
  };
  appliedToNativeGeometry: false;
  graphEdges: [];
  buildings: CadBuilding[];
  campusReference: {
    source: { name: string; sha256: string; sizeBytes: number };
    registration: {
      method: string;
      surveyed: false;
      controlCount: number;
      rmsMetres: number;
      status: string;
    };
    routingEligible: false;
    graphEdges: [];
    geojson: FeatureCollection<
      LineString,
      {
        sourceHandle: string;
        kind: "sidewalk" | "trail";
        layer: string;
        routingEligible: false;
        evidence: string;
      }
    >;
  };
};
function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw Error(`CAD intake: ${message}`);
}
const object = (v: unknown): Record<string, unknown> => {
  requireValue(
    v && typeof v === "object" && !Array.isArray(v),
    "expected an object",
  );
  return v as Record<string, unknown>;
};
const list = (v: unknown, max: number) => {
  requireValue(
    Array.isArray(v) && v.length <= max,
    "invalid or oversized list",
  );
  return v;
};
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 512;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function point(v: unknown, geographic = false, limit = 1e6) {
  const p = list(v, 2);
  requireValue(
    p.length === 2 &&
      p.every(finite) &&
      Math.abs(p[0]) <= (geographic ? 180 : limit) &&
      Math.abs(p[1]) <= (geographic ? 90 : limit),
    "invalid coordinates",
  );
}
function noRoutes(v: Record<string, unknown>) {
  requireValue(
    list(v.graphEdges, 0).length === 0,
    "drawing edges cannot be routing edges",
  );
}
function source(v: unknown) {
  const s = object(v);
  requireValue(
    text(s.name) && hash(s.sha256) && finite(s.sizeBytes) && s.sizeBytes >= 0,
    "invalid source binding",
  );
}
/** Bounded, authoring-only input. No native IDs, elevation or route admission. */
export function validateCadIntake(value: unknown): CadIntake {
  const root = object(value);
  requireValue(
    root.format === "openindoormaps-cad-intake" &&
      root.version === 1 &&
      root.appliedToNativeGeometry === false &&
      hash(root.sourceSha256) &&
      hash(root.evidenceSha256),
    "unsupported format or source identity",
  );
  noRoutes(root);
  const sources = list(root.sourceFiles, 20);
  sources.forEach(source);
  requireValue(
    sources.some((v) => object(v).sha256 === root.sourceSha256),
    "floor drawing is absent from sources",
  );
  const units = object(root.unitEvidence);
  requireValue(
    finite(units.metresPerDrawingUnit) &&
      units.metresPerDrawingUnit > 0 &&
      units.metresPerDrawingUnit <= 10 &&
      finite(units.registrationCount) &&
      units.registrationCount >= 3 &&
      text(units.method),
    "unproved drawing scale",
  );
  const buildingIds = new Set<string>(),
    roomIds = new Set<string>();
  let points = 0;
  const countPoint = (p: unknown) => {
    point(p);
    requireValue(++points <= 500000, "too many drawing points");
  };
  for (const value of list(root.buildings, 100)) {
    const b = object(value);
    requireValue(
      text(b.id) &&
        text(b.code) &&
        text(b.name) &&
        !buildingIds.has(b.id) &&
        b.placement === null &&
        b.coordinateSystem === "building-local-metres",
      "building must have unique identity and remain unplaced",
    );
    buildingIds.add(b.id);
    const floorIds = new Set<string>(),
      owners = new Map<string, string>(),
      hints = new Map<string, string>();
    for (const value of list(b.floors, 50)) {
      const f = object(value);
      requireValue(
        text(f.id) &&
          text(f.name) &&
          !floorIds.has(f.id) &&
          Number.isInteger(f.ordinal) &&
          f.elevationMetres === null &&
          f.nativeLevelId === null,
        "invalid schematic floor",
      );
      floorIds.add(f.id);
      const alignment = object(f.alignment);
      point(alignment.translationMetres);
      requireValue(
        finite(alignment.rotationDegrees) &&
          text(alignment.status) &&
          finite(alignment.overlapScore) &&
          alignment.overlapScore >= 0 &&
          alignment.overlapScore <= 1.00001 &&
          finite(alignment.alternativeScore),
        "invalid floor alignment",
      );
      for (const value of list(f.rooms, 20000)) {
        const r = object(value);
        requireValue(
          text(r.key) &&
            !roomIds.has(r.key) &&
            text(r.number) &&
            typeof r.name === "string" &&
            r.name.length <= 512 &&
            r.routingEligible === false &&
            r.enclosureVerified === false &&
            [null, "contains", "buffer"].includes(r.matchMode as null),
          "invalid tentative room identity",
        );
        roomIds.add(r.key);
        owners.set(r.key, f.id);
        countPoint(r.anchorMetres);
        for (const ring of list(r.ringsMetres, 1000)) {
          const ps = list(ring, 50000);
          requireValue(ps.length >= 3, "incomplete ring");
          ps.forEach(countPoint);
        }
        const origin = object(r.source);
        requireValue(
          text(origin.sheet) &&
            text(origin.handle) &&
            finite(origin.roomNumberFloor),
          "missing room provenance",
        );
        point(origin.anchorDrawing, false, 1e9);
      }
      for (const value of list(f.stairSymbols, 1000)) {
        const h = object(value);
        requireValue(
          text(h.id) &&
            !hints.has(`${f.id}:${h.id}`) &&
            h.routingEligible === false &&
            finite(h.treadCount) &&
            Number.isInteger(h.treadCount) &&
            h.treadCount >= 6 &&
            finite(h.medianSpacingMetres) &&
            h.medianSpacingMetres > 0 &&
            text(h.status),
          "invalid schematic stair hint",
        );
        hints.set(`${f.id}:${h.id}`, f.id);
        countPoint(h.centreMetres);
        list(h.sourceHandles, 1000).forEach((v) =>
          requireValue(text(v), "missing tread provenance"),
        );
        for (const ring of list(h.ringsMetres, 10)) {
          const ps = list(ring, 100);
          requireValue(ps.length >= 3, "incomplete stair hint ring");
          ps.forEach(countPoint);
        }
      }
      for (const value of list(f.linework, 50000)) {
        const l = object(value);
        requireValue(
          text(l.sourceHandle) && text(l.type) && text(l.layer),
          "missing linework provenance",
        );
        const ps = list(l.pointsMetres, 50000);
        requireValue(ps.length >= 2, "incomplete linework");
        ps.forEach(countPoint);
      }
    }
    requireValue(floorIds.size > 0, "building needs at least one floor");
    for (const value of list(b.connectors, 1000)) {
      const c = object(value);
      requireValue(
        text(c.id) &&
          c.kind === "stair" &&
          floorIds.has(c.fromFloor as string) &&
          floorIds.has(c.toFloor as string) &&
          c.fromFloor !== c.toFloor &&
          (c.fromRoom === null
            ? hints.get(`${c.fromFloor}:${c.fromHint}`) === c.fromFloor
            : c.fromHint === null &&
              owners.get(c.fromRoom as string) === c.fromFloor) &&
          (c.toRoom === null
            ? hints.get(`${c.toFloor}:${c.toHint}`) === c.toFloor
            : c.toHint === null &&
              owners.get(c.toRoom as string) === c.toFloor) &&
          finite(c.offsetMetres) &&
          c.offsetMetres >= 0 &&
          text(c.evidence) &&
          text(c.status) &&
          c.routingEligible === false,
        "unbound schematic connector",
      );
      countPoint(c.fromPointMetres);
      countPoint(c.toPointMetres);
    }
  }
  const campus = object(root.campusReference);
  source(campus.source);
  noRoutes(campus);
  requireValue(
    campus.routingEligible === false,
    "campus reference cannot admit routes",
  );
  requireValue(
    sources.some((v) => object(v).sha256 === object(campus.source).sha256),
    "campus drawing is absent from sources",
  );
  const registration = object(campus.registration);
  requireValue(
    registration.surveyed === false &&
      text(registration.method) &&
      text(registration.status) &&
      finite(registration.controlCount) &&
      registration.controlCount >= 3 &&
      finite(registration.rmsMetres) &&
      registration.rmsMetres >= 0,
    "invalid approximate campus registration",
  );
  const geojson = object(campus.geojson);
  requireValue(
    geojson.type === "FeatureCollection",
    "expected campus edge collection",
  );
  for (const value of list(geojson.features, 20000)) {
    const f = object(value),
      g = object(f.geometry),
      p = object(f.properties);
    requireValue(
      f.type === "Feature" &&
        g.type === "LineString" &&
        p.routingEligible === false &&
        ["sidewalk", "trail"].includes(p.kind as string) &&
        text(p.layer) &&
        text(p.sourceHandle) &&
        text(p.evidence),
      "invalid reference edge",
    );
    const ps = list(g.coordinates, 50000);
    requireValue(ps.length >= 2, "incomplete reference edge");
    ps.forEach((p) => {
      point(p, true);
      requireValue(++points <= 500000, "too many points");
    });
  }
  return value as CadIntake;
}
export function readCadIntake(
  bundle: ReviewBundle | undefined,
): CadIntake | null {
  const file = bundle?.files.find((f) => f.path === CAD_INTAKE_PATH);
  return file
    ? validateCadIntake(
        JSON.parse(new TextDecoder().decode(reviewFileBytes(file))),
      )
    : null;
}
