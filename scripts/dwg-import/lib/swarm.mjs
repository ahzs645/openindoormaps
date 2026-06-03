import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import DxfParser from "dxf-parser";
import { anyPatternMatches } from "./config.mjs";
import {
  closeRing,
  createLineFeature,
  createPointFeature,
  createPolygonFeature,
  featureCollection,
  normalizeTextValue,
  pointInsidePolygon,
  polygonArea,
  polygonCentroid,
} from "./geometry.mjs";
import {
  createCoordinateTransform,
  createLeastSquaresAffineTransform,
} from "./transform.mjs";

export class AgentSwarmPipeline {
  constructor({ inputPath, outputDir, bundleTarget, config }) {
    this.context = {
      inputPath: resolve(inputPath),
      outputDir: resolve(outputDir),
      bundleTarget: bundleTarget ? resolve(bundleTarget) : null,
      config,
      logs: [],
      warnings: [],
      stats: {},
      report: {
        warnings: [],
        unmatchedLabels: [],
      },
      artifacts: {},
      counters: {
        featureId: 1,
      },
    };

    this.agents = [
      new ConversionAgent(),
      new ParseCadAgent(),
      new LayoutContextAgent(),
      new WallRecoveryAgent(),
      new SemanticExtractionAgent(),
      new CampusPlacementAgent(),
      new QualityAgent(),
      new ExportAgent(),
    ];
  }

  run() {
    for (const agent of this.agents) {
      agent.run(this.context);
    }

    return this.context;
  }
}

class BaseAgent {
  constructor(name) {
    this.name = name;
  }

  log(context, message) {
    context.logs.push({ agent: this.name, message });
  }
}

class ConversionAgent extends BaseAgent {
  constructor() {
    super("conversion-agent");
  }

  run(context) {
    const inputExtension = extname(context.inputPath).toLowerCase();
    if (inputExtension === ".dxf") {
      context.artifacts.dxfPath = context.inputPath;
      this.log(context, `Using DXF input ${context.inputPath}.`);
      return;
    }

    if (inputExtension !== ".dwg") {
      throw new Error("Input must be a .dwg or .dxf file.");
    }

    mkdirSync(context.outputDir, { recursive: true });
    const dxfPath = join(
      context.outputDir,
      `${basename(context.inputPath, extname(context.inputPath))}.dxf`,
    );

    const commandTemplate = context.config.conversion.commandTemplate?.trim();
    if (commandTemplate) {
      const command = interpolateCommand(commandTemplate, {
        input: context.inputPath,
        input_dir: dirname(context.inputPath),
        input_name: basename(context.inputPath),
        output: dxfPath,
        output_dir: context.outputDir,
      });

      execFileSync("sh", ["-lc", command], { stdio: "inherit" });
      context.artifacts.dxfPath = dxfPath;
      this.log(context, `Converted DWG to DXF with custom command.`);
      return;
    }

    if (commandExists("dwgread")) {
      execFileSync("dwgread", ["-O", "DXF", "-o", dxfPath, context.inputPath], {
        stdio: "inherit",
      });
      context.artifacts.dxfPath = dxfPath;
      this.log(context, `Converted DWG to DXF with LibreDWG dwgread.`);
      return;
    }

    throw new Error(
      "No DWG converter available. Install LibreDWG (dwgread), or set conversion.commandTemplate in the config to call ODA File Converter or another local DWG-to-DXF tool.",
    );
  }
}

class ParseCadAgent extends BaseAgent {
  constructor() {
    super("parse-agent");
  }

  run(context) {
    const dxfContents = readFileSync(context.artifacts.dxfPath, "utf8");
    const parser = new DxfParser();
    const dxfDocument = parser.parseSync(dxfContents);
    const insertRecords = extractInsertRecords(dxfContents);
    context.artifacts.dxfContents = dxfContents;
    context.artifacts.dxfDocument = dxfDocument;
    context.artifacts.insertRecords = insertRecords;
    context.stats.sourceEntities = dxfDocument.entities?.length ?? 0;
    context.stats.structuredInsertCount = insertRecords.length;
    this.log(
      context,
      `Parsed ${context.stats.sourceEntities} DXF entities and ${context.stats.structuredInsertCount} structured inserts from ${context.artifacts.dxfPath}.`,
    );
  }
}

class LayoutContextAgent extends BaseAgent {
  constructor() {
    super("layout-context-agent");
  }

  run(context) {
    if (!context.config.layouts.usePaperSpaceViewports) {
      return;
    }

    const scriptPath = resolve(
      process.cwd(),
      "scripts",
      "dwg-import",
      "extract-layout-windows.py",
    );

    try {
      const stdout = execFileSync("python3", [scriptPath, context.artifacts.dxfPath], {
        encoding: "utf8",
      });
      const parsed = JSON.parse(stdout);
      const layouts = (parsed.layouts ?? [])
        .map((layout) => annotateLayoutWindow(layout, context.config))
        .filter((layout) => Array.isArray(layout.bbox) && layout.bbox.length === 4);

      context.artifacts.layoutWindows = layouts;
      context.stats.layoutWindowCount = layouts.length;
      this.log(
        context,
        `Loaded ${layouts.length} paper-space layout windows from ${context.artifacts.dxfPath}.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (context.config.layouts.requireContext) {
        throw new Error(`Failed to extract DXF layout windows: ${errorMessage}`);
      }

      context.warnings.push(
        `Failed to extract DXF layout windows: ${errorMessage}`,
      );
    }
  }
}

class WallRecoveryAgent extends BaseAgent {
  constructor() {
    super("wall-recovery-agent");
  }

  run(context) {
    if (!context.config.geometry.recoverFromWalls) {
      return;
    }

    const roomAnchors = extractStructuredRoomAnchors(context, (point) => point);
    if (roomAnchors.length === 0) {
      return;
    }

    const scriptPath = resolve(
      process.cwd(),
      "scripts",
      "dwg-import",
      "recover-room-polygons.py",
    );
    const requestPath = join(context.outputDir, "wall-recovery-request.json");

    mkdirSync(context.outputDir, { recursive: true });
    writeJson(requestPath, {
      dxfPath: context.artifacts.dxfPath,
      roomAnchors,
      layoutWindows: context.artifacts.layoutWindows ?? [],
      geometry: context.config.geometry,
    });

    try {
      const stdout = execFileSync("python3", [scriptPath, requestPath], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout);

      context.artifacts.recoveredRoomPolygons = parsed.recoveredPolygons ?? [];
      context.stats.wallRecovery = parsed.stats ?? null;
      this.log(
        context,
        `Recovered ${context.artifacts.recoveredRoomPolygons.length} room polygons from wall geometry.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.warnings.push(
        `Failed to recover room polygons from wall geometry: ${errorMessage}`,
      );
    }
  }
}

class SemanticExtractionAgent extends BaseAgent {
  constructor() {
    super("semantic-extraction-agent");
  }

  run(context) {
    const transformPoint = createCoordinateTransform(context.config.transform);
    const dxfDocument = context.artifacts.dxfDocument;
    const indoorMapFeatures = [];
    const unitFeatures = [];
    const labelCandidates = [];
    const routeFeatures = [];
    const discoveredFloors = new Set();
    const featureCounts = {
      unit: 0,
      corridor: 0,
      stairs: 0,
      elevator: 0,
      door: 0,
      window: 0,
      routing: 0,
    };
    const structuredRooms = buildStructuredRoomFeatures({
      context,
      transformPoint,
      discoveredFloors,
      featureCounts,
    });

    indoorMapFeatures.push(...structuredRooms.indoorMapFeatures);
    unitFeatures.push(...structuredRooms.unitFeatures);
    const cadOverlayFeatures = buildCadOverlayFeatures({
      context,
      transformPoint,
      discoveredFloors,
    });

    for (const entity of dxfDocument.entities ?? []) {
      const floor = resolveFloor(entity, context.config);
      if (floor !== null) {
        discoveredFloors.add(floor);
      }

      const classification = classifyEntity(entity, context.config);
      if (classification === "ignore") {
        continue;
      }

      if (classification === "room-label") {
        if (structuredRooms.used) {
          continue;
        }

        const point = extractPoint(entity);
        const text = extractText(entity);
        if (!point || !text) {
          continue;
        }

        labelCandidates.push({
          text,
          floor: floor ?? context.config.floors.default,
          coordinates: transformPoint(point),
          sourceLayer: entity.layer ?? null,
        });
        continue;
      }

      const geometry = extractGeometry(entity);
      if (!geometry) {
        continue;
      }

      const commonProperties = {
        level_id: floor,
        source_layer: entity.layer ?? null,
        source_entity: entity.type,
      };

      if (classification === "route" && geometry.kind === "line") {
        routeFeatures.push(
          createLineFeature(
            nextFeatureId(context),
            geometry.points.map(transformPoint),
            {
              ...commonProperties,
              connector_type: "corridor",
            },
          ),
        );
        featureCounts.routing += 1;
        continue;
      }

      if (
        geometry.kind === "polygon" &&
        ["room", "corridor", "stairs", "elevator"].includes(classification)
      ) {
        if (structuredRooms.used) {
          continue;
        }

        const featureType = classification === "room" ? "unit" : classification;
        const polygonFeature = createPolygonFeature(
          nextFeatureId(context),
          geometry.points.map(transformPoint),
          {
            name: null,
            alt_name: null,
            category: null,
            restriction: null,
            accessibility: null,
            display_point: null,
            feature_type: featureType,
            level_id: floor,
            show: "true",
            area: 0,
            ...commonProperties,
          },
        );

        indoorMapFeatures.push(polygonFeature);
        if (featureType === "unit") {
          unitFeatures.push(polygonFeature);
        }

        featureCounts[featureType] += 1;
        continue;
      }

      if (
        geometry.kind === "line" &&
        ["door", "window"].includes(classification)
      ) {
        indoorMapFeatures.push(
          createLineFeature(
            nextFeatureId(context),
            geometry.points.map(transformPoint),
            {
              ...commonProperties,
              feature_type: classification,
            },
          ),
        );
        featureCounts[classification] += 1;
        continue;
      }

      if (
        geometry.kind === "point" &&
        ["door", "window", "stairs", "elevator"].includes(classification)
      ) {
        indoorMapFeatures.push(
          createPointFeature(
            nextFeatureId(context),
            transformPoint(geometry.point),
            {
              ...commonProperties,
              feature_type: classification,
              name: entity.name ?? null,
            },
          ),
        );
        featureCounts[classification] += 1;
      }
    }

    const pois = structuredRooms.used
      ? structuredRooms.pois
      : assignRoomLabels({
          buildingId: context.config.building.building_id,
          labelCandidates,
          unitFeatures,
          context,
        });

    context.stats.discoveredFloors = [...discoveredFloors].sort(
      (a, b) => a - b,
    );
    context.stats.featureCounts = featureCounts;
    context.artifacts.indoorMap = featureCollection(indoorMapFeatures);
    context.artifacts.pois = featureCollection(pois);
    context.artifacts.indoorRoutes = featureCollection(routeFeatures);
    context.artifacts.cadOverlay = featureCollection(cadOverlayFeatures);
    context.artifacts.cadLayouts = buildCadLayoutManifest(
      context.artifacts.layoutWindows ?? [],
    );

    this.log(
      context,
      `Built ${indoorMapFeatures.length} map features, ${pois.length} POIs, and ${routeFeatures.length} route features.`,
    );
  }
}

class CampusPlacementAgent extends BaseAgent {
  constructor() {
    super("campus-placement-agent");
  }

  run(context) {
    if (!context.config.campus.enabled) {
      return;
    }

    const placementComponentMap = context.config.campus.placementComponentMap ?? {};
    if (Object.keys(placementComponentMap).length === 0) {
      return;
    }

    const scriptPath = resolve(
      process.cwd(),
      "scripts",
      "dwg-import",
      "extract-campus-components.py",
    );
    const referenceDxfPath = resolve(
      process.cwd(),
      context.config.campus.referenceDxf,
    );

    try {
      const stdout = execFileSync(
        "python3",
        [
          scriptPath,
          referenceDxfPath,
          context.config.campus.referenceLayer,
          String(context.config.campus.componentAreaThreshold ?? 500),
        ],
        {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      const parsed = JSON.parse(stdout);
      const ignoredComponentIndexes = new Set(
        context.config.campus.ignoredComponentIndexes ?? [],
      );
      const components = (parsed.components ?? []).filter(
        (component) => !ignoredComponentIndexes.has(component.index),
      );
      const georeferenced = georeferenceCampusComponents(context, components);

      applyCampusPlacements(
        context,
        georeferenced.components,
        georeferenced.georeferenced,
      );
      this.log(
        context,
        `Applied campus-reference placement to ${Object.keys(placementComponentMap).length} building groups using ${georeferenced.components.length} reference components.`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.warnings.push(
        `Failed to apply campus placement: ${errorMessage}`,
      );
    }
  }
}

class QualityAgent extends BaseAgent {
  constructor() {
    super("quality-agent");
  }

  run(context) {
    const { indoorMap, pois, indoorRoutes } = context.artifacts;
    const warnings = [];

    if ((context.config.transform.controlPoints ?? []).length === 0) {
      warnings.push(
        "Transform is running in identity mode. This only works if the DXF is already georeferenced to map coordinates.",
      );
    }

    if ((indoorMap?.features?.length ?? 0) === 0) {
      warnings.push("No indoor-map features were generated.");
    }

    if ((pois?.features?.length ?? 0) === 0) {
      warnings.push(
        "No room-label POIs were generated. Review labels.roomNumberPatterns and layer classification.",
      );
    }

    if ((indoorRoutes?.features?.length ?? 0) === 0) {
      warnings.push(
        "No routing features were generated. Provide routing layer patterns or a dedicated centerline layer in CAD.",
      );
    }

    if ((context.stats.discoveredFloors ?? []).length <= 1) {
      warnings.push(
        "Only one floor was detected. Review floors.rules if the source drawing contains multiple levels.",
      );
    }

    context.warnings.push(...warnings);
    context.report.warnings.push(...warnings);
    this.log(context, `Recorded ${warnings.length} QA warnings.`);
  }
}

class ExportAgent extends BaseAgent {
  constructor() {
    super("export-agent");
  }

  run(context) {
    mkdirSync(context.outputDir, { recursive: true });

    const indoorMapPath = join(context.outputDir, "indoor_map.geojson");
    const poisPath = join(context.outputDir, "pois.geojson");
    const indoorRoutesPath = join(context.outputDir, "indoor_routes.geojson");
    const cadOverlayPath = join(context.outputDir, "cad_overlay.geojson");
    const campusReferencePath = join(context.outputDir, "campus_reference.geojson");
    const reportPath = join(context.outputDir, "report.json");
    const bundlePath = join(context.outputDir, "building.bundle.json");

    const bundle = buildBundle(context);

    writeJson(indoorMapPath, context.artifacts.indoorMap);
    writeJson(poisPath, context.artifacts.pois);
    writeJson(indoorRoutesPath, context.artifacts.indoorRoutes);
    writeJson(
      cadOverlayPath,
      context.artifacts.cadOverlay ?? featureCollection([]),
    );
    if (context.artifacts.campusReference) {
      writeJson(campusReferencePath, context.artifacts.campusReference);
    }
    writeJson(reportPath, {
      stats: context.stats,
      warnings: context.warnings,
      unmatchedLabels: context.report.unmatchedLabels,
      logs: context.logs,
    });
    writeJson(bundlePath, bundle);

    if (context.bundleTarget) {
      mkdirSync(dirname(context.bundleTarget), { recursive: true });
      writeJson(context.bundleTarget, bundle);
    }

    context.artifacts.output = {
      indoorMapPath,
      poisPath,
      indoorRoutesPath,
      cadOverlayPath,
      campusReferencePath: context.artifacts.campusReference
        ? campusReferencePath
        : null,
      reportPath,
      bundlePath,
    };
    this.log(context, `Wrote import artifacts to ${context.outputDir}.`);
  }
}

function assignRoomLabels({
  buildingId,
  labelCandidates,
  unitFeatures,
  context,
}) {
  const pois = [];

  for (const candidate of labelCandidates) {
    const containingUnit = unitFeatures.find((feature) => {
      const featureFloor = feature.properties?.level_id ?? null;
      if (featureFloor !== null && featureFloor !== candidate.floor) {
        return false;
      }

      return pointInsidePolygon(candidate.coordinates, feature);
    });

    if (!containingUnit) {
      context.report.unmatchedLabels.push(candidate);
      continue;
    }

    containingUnit.properties.name = candidate.text;
    const displayPoint = containingUnit.properties.display_point;
    containingUnit.properties.display_point =
      displayPoint ?? JSON.stringify(candidate.coordinates);

    const candidatePoiId = nextFeatureId(context);
    pois.push(
      createPointFeature(candidatePoiId, candidate.coordinates, {
        id: candidatePoiId,
        name: candidate.text,
        type: "room",
        floor: candidate.floor,
        metadata: {
          source_layer: candidate.sourceLayer,
          unit_id: containingUnit.id,
        },
        building_id: buildingId,
      }),
    );
  }

  for (const unitFeature of unitFeatures) {
    if (unitFeature.properties.name) {
      continue;
    }

    const centroid = polygonCentroid(unitFeature);
    const generatedPoiId = nextFeatureId(context);
    pois.push(
      createPointFeature(generatedPoiId, centroid, {
        id: generatedPoiId,
        name: `Room ${unitFeature.id}`,
        type: "room",
        floor: unitFeature.properties.level_id ?? 0,
        metadata: {
          generated: true,
          unit_id: unitFeature.id,
        },
        building_id: buildingId,
      }),
    );
  }

  return pois;
}

function buildStructuredRoomFeatures({
  context,
  transformPoint,
  discoveredFloors,
  featureCounts,
}) {
  const roomAnchors = extractStructuredRoomAnchors(context, transformPoint);
  if (roomAnchors.length === 0) {
    return {
      used: false,
      indoorMapFeatures: [],
      unitFeatures: [],
      pois: [],
    };
  }

  const polygonCandidates = extractClosedPolygonCandidates(
    context.artifacts.dxfDocument,
    context.config,
    transformPoint,
  );
  const recoveredPolygonCandidatesByAnchorId = indexRecoveredPolygonCandidates(
    context.artifacts.recoveredRoomPolygons ?? [],
    transformPoint,
  );
  const polygonCandidatesByLayout = indexPolygonCandidatesByLayout(
    polygonCandidates,
    context.artifacts.layoutWindows ?? [],
  );
  const consumedPolygonKeys = new Set();
  const indoorMapFeatures = [];
  const unitFeatures = [];
  const pois = [];

  for (const anchor of roomAnchors) {
    if (anchor.floor !== null) {
      discoveredFloors.add(anchor.floor);
    }

    const scopedPolygonCandidates =
      anchor.layoutWindowId && polygonCandidatesByLayout.has(anchor.layoutWindowId)
        ? polygonCandidatesByLayout.get(anchor.layoutWindowId)
        : polygonCandidates;
    const polygonCandidate =
      recoveredPolygonCandidatesByAnchorId.get(anchor.id) ??
      findBestPolygonCandidate(
        anchor.coordinates,
        scopedPolygonCandidates,
        consumedPolygonKeys,
      );

    let unitId = null;
    const featureType = classifyRoomUse(anchor.roomUse);

    if (polygonCandidate) {
      if (!recoveredPolygonCandidatesByAnchorId.has(anchor.id)) {
        consumedPolygonKeys.add(polygonCandidate.key);
      }

      const polygonFeature = createPolygonFeature(
        nextFeatureId(context),
        polygonCandidate.points,
        buildStructuredRoomProperties({
          campusId: context.config.building.campus_id,
          anchor,
          featureType,
          area: polygonCandidate.area,
          sourceLayer: polygonCandidate.layer,
          sourceEntity: polygonCandidate.entityType,
          displayPoint: anchor.coordinates,
          extraProperties: {
            match_mode: polygonCandidate.matchMode ?? null,
          },
        }),
      );

      indoorMapFeatures.push(polygonFeature);
      if (featureType === "unit") {
        unitFeatures.push(polygonFeature);
      }

      featureCounts[featureType] += 1;
      unitId = polygonFeature.id;
    } else {
      context.report.unmatchedLabels.push({
        text: anchor.roomNumber,
        floor: anchor.floor,
        coordinates: anchor.coordinates,
        sourceLayer: anchor.layer,
        roomUse: anchor.roomUse,
        buildingId: anchor.buildingId,
        buildingCode: anchor.buildingCode,
        buildingName: anchor.buildingName,
        floorSource: anchor.floorSource,
        layoutName: anchor.layoutName,
        source: "room_data",
      });
    }

    const poiId = nextFeatureId(context);
    pois.push(
      createPointFeature(poiId, anchor.coordinates, {
        id: poiId,
        name: anchor.roomNumber,
        type: featureType,
        floor: anchor.floor ?? 0,
        level_id: anchor.floor ?? 0,
        campus_id: context.config.building.campus_id,
        building_id: anchor.buildingId,
        building_code: anchor.buildingCode,
        building_name: anchor.buildingName,
        building_source: anchor.buildingSource,
        room_number: anchor.roomNumber,
        raw_room_number: anchor.rawRoomNumber,
        room_use: anchor.roomUse || null,
        floor_source: anchor.floorSource,
        layout_name: anchor.layoutName,
        layout_zone: anchor.layoutZone,
        source_layout_floor: anchor.sourceLayoutFloor,
        source_layout_floor_candidates: anchor.sourceLayoutFloorCandidates,
        source_layer: anchor.layer,
        source_block: anchor.blockName,
        basement_series: anchor.basementSeries,
        metadata: {
          room_number: anchor.roomNumber,
          room_use: anchor.roomUse || null,
          building_code: anchor.buildingCode,
          building_name: anchor.buildingName,
          layout_name: anchor.layoutName,
          source_layer: anchor.layer,
          source_block: anchor.blockName,
          floor_source: anchor.floorSource,
          unit_id: unitId,
        },
      }),
    );
  }

  return {
    used: true,
    indoorMapFeatures,
    unitFeatures,
    pois,
  };
}

function indexRecoveredPolygonCandidates(recoveredRoomPolygons, transformPoint) {
  const candidates = new Map();

  for (const recoveredPolygon of recoveredRoomPolygons) {
    const transformedPoints = (recoveredPolygon.cadPoints ?? []).map(transformPoint);
    if (transformedPoints.length < 3) {
      continue;
    }

    candidates.set(recoveredPolygon.anchorId, {
      key: `recovered-${recoveredPolygon.anchorId}`,
      area:
        Number.isFinite(recoveredPolygon.area) && recoveredPolygon.area > 0
          ? recoveredPolygon.area
          : polygonArea(transformedPoints),
      entityType: recoveredPolygon.sourceEntity ?? "POLYGONIZE",
      layer: recoveredPolygon.sourceLayer ?? "wall-recovery",
      rawBounds: recoveredPolygon.rawBounds ?? null,
      matchMode: recoveredPolygon.matchMode ?? null,
      points: transformedPoints,
      feature: createPolygonFeature(
        `recovered-${recoveredPolygon.anchorId}`,
        transformedPoints,
        {
          source_layer: recoveredPolygon.sourceLayer ?? "wall-recovery",
        },
      ),
    });
  }

  return candidates;
}

function buildStructuredRoomProperties({
  campusId,
  anchor,
  featureType,
  area,
  sourceLayer,
  sourceEntity,
  displayPoint,
  extraProperties = {},
}) {
  return {
    name: anchor.roomNumber,
    alt_name: anchor.roomUse || null,
    category: anchor.roomUse || null,
    restriction: null,
    accessibility: null,
    display_point: JSON.stringify(displayPoint),
    feature_type: featureType,
    level_id: anchor.floor,
    floor: anchor.floor,
    show: "true",
    area,
    campus_id: campusId,
    building_id: anchor.buildingId,
    building_code: anchor.buildingCode,
    building_name: anchor.buildingName,
    building_source: anchor.buildingSource,
    room_number: anchor.roomNumber,
    raw_room_number: anchor.rawRoomNumber,
    room_use: anchor.roomUse || null,
    floor_source: anchor.floorSource,
    layout_name: anchor.layoutName,
    layout_zone: anchor.layoutZone,
    source_layout_floor: anchor.sourceLayoutFloor,
    source_layout_floor_candidates: anchor.sourceLayoutFloorCandidates,
    source_layer: sourceLayer,
    source_block: anchor.blockName,
    source_entity: sourceEntity,
    basement_series: anchor.basementSeries,
    ...extraProperties,
  };
}

function georeferenceCampusComponents(context, components) {
  const controlPoints = context.config.campus.componentControlPoints ?? [];
  if (controlPoints.length < 3) {
    return {
      components,
      georeferenced: false,
    };
  }

  const componentIndex = new Map(
    components.map((component) => [String(component.index), component]),
  );
  const resolvedControlPoints = controlPoints
    .map((controlPoint) => {
      const component = componentIndex.get(String(controlPoint.componentIndex));
      if (!component) {
        return null;
      }

      return {
        source: component.centroid,
        target: controlPoint.geo,
      };
    })
    .filter(Boolean);

  if (resolvedControlPoints.length < 3) {
    return {
      components,
      georeferenced: false,
    };
  }

  const transformPoint = createLeastSquaresAffineTransform(resolvedControlPoints);
  const georeferencedComponents = components.map((component) => {
    const points = component.points.map(transformPoint);
    const centroid = transformPoint(component.centroid);
    const bounds = computePointBounds(points);

    return {
      ...component,
      bounds,
      centroid,
      points,
    };
  });

  context.stats.campusReference = {
    controlPointCount: resolvedControlPoints.length,
    componentCount: georeferencedComponents.length,
    georeferenced: true,
  };

  return {
    components: georeferencedComponents,
    georeferenced: true,
  };
}

function applyCampusPlacements(context, components, useGlobalReference = false) {
  const placementComponentMap = context.config.campus.placementComponentMap ?? {};
  const componentIndex = new Map(
    components.map((component) => [String(component.index), component]),
  );
  const buildingIndex = buildBuildingPlacementIndex(
    context.artifacts.pois,
    context.artifacts.indoorMap,
    placementComponentMap,
  );
  const placementPlans = new Map();
  const referenceFeatures = [];
  const skippedPlacements = [];

  for (const [buildingCode, rawComponentIndexes] of Object.entries(
    placementComponentMap,
  )) {
    const sourceBuilding = buildingIndex.get(buildingCode);
    if (!sourceBuilding) {
      continue;
    }

    const componentGroup = (rawComponentIndexes ?? [])
      .map((componentIndexValue) =>
        componentIndex.get(String(componentIndexValue)),
      )
      .filter(Boolean);
    if (componentGroup.length === 0) {
      continue;
    }

    const targetPolygons = useGlobalReference
      ? componentGroup.map((component) => component.points)
      : componentGroup.map((component) => {
          const rawGroupBounds = mergeBounds(
            componentGroup.map((groupComponent) => groupComponent.bounds),
          );
          if (!rawGroupBounds) {
            return component.points;
          }

          const rawGroupCenter = computeBoundsCenter(rawGroupBounds);
          const rawGroupDiagonal = boundsDiagonal(rawGroupBounds);
          const sourceDiagonal = boundsDiagonal(sourceBuilding.bounds);
          const placementScale =
            rawGroupDiagonal > 0 && sourceDiagonal > 0
              ? sourceDiagonal / rawGroupDiagonal
              : 1;
          const sourceCenter = computeBoundsCenter(sourceBuilding.bounds);

          return component.points.map((point) => [
            sourceCenter[0] + (point[0] - rawGroupCenter[0]) * placementScale,
            sourceCenter[1] + (point[1] - rawGroupCenter[1]) * placementScale,
          ]);
        });
    const targetBounds = mergeBounds(
      targetPolygons.map((points) => computePointBounds(points)),
    );
    if (!targetBounds) {
      continue;
    }

    const sourceAspect = normalizedBoundsAspectRatio(sourceBuilding.bounds);
    const targetAspect = normalizedBoundsAspectRatio(targetBounds);
    const aspectMismatch = computeAspectMismatch(sourceAspect, targetAspect);
    if (useGlobalReference && aspectMismatch > 3) {
      skippedPlacements.push({
        buildingCode,
        sourceAspect,
        targetAspect,
        aspectMismatch,
        componentIndexes: rawComponentIndexes,
      });
      continue;
    }

    placementPlans.set(buildingCode, {
      transformPoint: createUniformPlacementTransform(
        sourceBuilding.bounds,
        targetBounds,
      ),
      buildingId: sourceBuilding.buildingId,
      buildingName: sourceBuilding.buildingName,
      targetBounds,
    });

    for (const points of targetPolygons) {
      referenceFeatures.push(
        createPolygonFeature(nextFeatureId(context), points, {
          feature_type: "reference_outline",
          campus_id: context.config.building.campus_id,
          building_code: buildingCode,
          building_id: sourceBuilding.buildingId,
          building_name: sourceBuilding.buildingName,
          source_layer: context.config.campus.referenceLayer,
          source_entity: "CAMPUS_REFERENCE",
          component_indexes: rawComponentIndexes,
        }),
      );
    }
  }

  context.artifacts.indoorMap = featureCollection(
    context.artifacts.indoorMap.features.map((feature) =>
      transformFeatureForCampusPlacement(feature, buildingIndex, placementPlans),
    ),
  );
  context.artifacts.pois = featureCollection(
    context.artifacts.pois.features.map((feature) =>
      transformFeatureForCampusPlacement(feature, buildingIndex, placementPlans),
    ),
  );
  context.artifacts.indoorRoutes = featureCollection(
    context.artifacts.indoorRoutes.features.map((feature) =>
      transformFeatureForCampusPlacement(feature, buildingIndex, placementPlans),
    ),
  );
  context.artifacts.cadOverlay = featureCollection(
    (context.artifacts.cadOverlay?.features ?? []).map((feature) =>
      transformFeatureForCampusPlacement(feature, buildingIndex, placementPlans),
    ),
  );
  context.artifacts.campusReference = featureCollection(referenceFeatures);
  context.stats.campusPlacement = {
    placedBuildingCount: placementPlans.size,
    skippedBuildingCount: skippedPlacements.length,
    skippedPlacements,
    referenceFeatureCount: referenceFeatures.length,
    georeferencedReference: useGlobalReference,
  };

  for (const skippedPlacement of skippedPlacements) {
    context.warnings.push(
      `Skipped campus placement for building ${skippedPlacement.buildingCode} because the mapped reference outline would distort the footprint (aspect mismatch ${skippedPlacement.aspectMismatch.toFixed(2)}).`,
    );
  }
}

function buildBuildingPlacementIndex(
  poisFeatureCollection,
  indoorMapFeatureCollection,
  placementComponentMap,
) {
  const codes = new Set(Object.keys(placementComponentMap));
  const groupedBuildings = new Map();

  const collectFeature = (feature, coordinateKey) => {
    const buildingCode = feature.properties?.building_code ?? null;
    if (!buildingCode || !codes.has(buildingCode)) {
      return;
    }

    const coordinates = [];
    collectFeatureCoordinates(feature.geometry, coordinates);
    if (coordinates.length === 0) {
      return;
    }

    const existing = groupedBuildings.get(buildingCode) ?? {
      buildingId: feature.properties?.building_id ?? null,
      buildingName: feature.properties?.building_name ?? null,
      indoorCoordinates: [],
      poiCoordinates: [],
    };

    existing[coordinateKey].push(...coordinates);
    groupedBuildings.set(buildingCode, existing);
  };

  for (const feature of poisFeatureCollection.features ?? []) {
    collectFeature(feature, "poiCoordinates");
  }

  for (const feature of indoorMapFeatureCollection.features ?? []) {
    collectFeature(feature, "indoorCoordinates");
  }

  const buildingIndex = new Map();
  for (const [buildingCode, entry] of groupedBuildings.entries()) {
    // Indoor geometry is the most trustworthy source for campus placement.
    // Room-label POIs may include stray anchors outside the recovered footprint,
    // which can squash an otherwise correct building during bounds fitting.
    const coordinates =
      entry.indoorCoordinates.length > 0
        ? entry.indoorCoordinates
        : entry.poiCoordinates;
    const bounds = computePointBounds(coordinates);
    if (!bounds) {
      continue;
    }

    buildingIndex.set(buildingCode, {
      buildingId: entry.buildingId,
      buildingName: entry.buildingName,
      bounds,
    });
  }

  return buildingIndex;
}

function transformFeatureForCampusPlacement(
  feature,
  buildingIndex,
  placementPlans,
) {
  const buildingCode = resolvePlacementBuildingCode(feature, buildingIndex);
  if (!buildingCode || !placementPlans.has(buildingCode)) {
    return feature;
  }

  const placementPlan = placementPlans.get(buildingCode);
  const transformedGeometry = transformGeometryCoordinates(
    feature.geometry,
    placementPlan.transformPoint,
  );
  const properties = { ...(feature.properties ?? {}) };

  if (!properties.building_code) {
    properties.building_code = buildingCode;
    properties.building_id = placementPlan.buildingId;
    properties.building_name = placementPlan.buildingName;
  }

  return {
    ...feature,
    geometry: transformedGeometry,
    properties,
  };
}

function resolvePlacementBuildingCode(feature, buildingIndex) {
  const explicitCode = feature.properties?.building_code ?? null;
  if (explicitCode && buildingIndex.has(explicitCode)) {
    return explicitCode;
  }

  const featureBounds = computeFeatureBounds(feature.geometry);
  if (!featureBounds) {
    return null;
  }

  const featureCenter = computeBoundsCenter(featureBounds);
  for (const [buildingCode, building] of buildingIndex.entries()) {
    if (pointInsideBounds(featureCenter, building.bounds)) {
      return buildingCode;
    }
  }

  let bestBuildingCode = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [buildingCode, building] of buildingIndex.entries()) {
    const distance = distancePointToBounds(featureCenter, building.bounds);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestBuildingCode = buildingCode;
    }
  }

  return bestDistance <= 0.0015 ? bestBuildingCode : null;
}

function transformGeometryCoordinates(geometry, transformPoint) {
  if (!geometry) {
    return geometry;
  }

  if (geometry.type === "GeometryCollection") {
    return {
      ...geometry,
      geometries: geometry.geometries.map((childGeometry) =>
        transformGeometryCoordinates(childGeometry, transformPoint),
      ),
    };
  }

  return {
    ...geometry,
    coordinates: transformCoordinateArray(geometry.coordinates, transformPoint),
  };
}

function transformCoordinateArray(value, transformPoint) {
  if (!Array.isArray(value)) {
    return value;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return transformPoint([value[0], value[1]]);
  }

  return value.map((item) => transformCoordinateArray(item, transformPoint));
}

function collectFeatureCoordinates(geometry, coordinates) {
  if (!geometry) {
    return;
  }

  if (geometry.type === "GeometryCollection") {
    for (const childGeometry of geometry.geometries ?? []) {
      collectFeatureCoordinates(childGeometry, coordinates);
    }
    return;
  }

  collectCoordinateArray(geometry.coordinates, coordinates);
}

function collectCoordinateArray(value, coordinates) {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    coordinates.push([value[0], value[1]]);
    return;
  }

  for (const item of value) {
    collectCoordinateArray(item, coordinates);
  }
}

function computeFeatureBounds(geometry) {
  const coordinates = [];
  collectFeatureCoordinates(geometry, coordinates);
  return computePointBounds(coordinates);
}

function createUniformPlacementTransform(sourceBounds, targetBounds) {
  const sourceCenter = computeBoundsCenter(sourceBounds);
  const targetCenter = computeBoundsCenter(targetBounds);
  const sourceWidth = Math.max(sourceBounds[2] - sourceBounds[0], Number.EPSILON);
  const sourceHeight = Math.max(
    sourceBounds[3] - sourceBounds[1],
    Number.EPSILON,
  );
  const targetWidth = Math.max(targetBounds[2] - targetBounds[0], Number.EPSILON);
  const targetHeight = Math.max(
    targetBounds[3] - targetBounds[1],
    Number.EPSILON,
  );
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);

  return (point) => [
    targetCenter[0] + (point[0] - sourceCenter[0]) * scale,
    targetCenter[1] + (point[1] - sourceCenter[1]) * scale,
  ];
}

function normalizedBoundsAspectRatio(bounds) {
  const width = Math.max(bounds[2] - bounds[0], Number.EPSILON);
  const height = Math.max(bounds[3] - bounds[1], Number.EPSILON);
  return width >= height ? width / height : height / width;
}

function computeAspectMismatch(sourceAspect, targetAspect) {
  if (!Number.isFinite(sourceAspect) || !Number.isFinite(targetAspect)) {
    return Number.POSITIVE_INFINITY;
  }

  const smallerAspect = Math.max(
    Math.min(sourceAspect, targetAspect),
    Number.EPSILON,
  );
  const largerAspect = Math.max(sourceAspect, targetAspect);
  return largerAspect / smallerAspect;
}

function mergeBounds(boundsList) {
  const validBounds = boundsList.filter(Boolean);
  if (validBounds.length === 0) {
    return null;
  }

  const mergedBounds = [...validBounds[0]];
  for (const bounds of validBounds.slice(1)) {
    mergedBounds[0] = Math.min(mergedBounds[0], bounds[0]);
    mergedBounds[1] = Math.min(mergedBounds[1], bounds[1]);
    mergedBounds[2] = Math.max(mergedBounds[2], bounds[2]);
    mergedBounds[3] = Math.max(mergedBounds[3], bounds[3]);
  }

  return mergedBounds;
}

function computeBoundsCenter(bounds) {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

function boundsDiagonal(bounds) {
  return Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]);
}

function distancePointToBounds(point, bounds) {
  const deltaX =
    point[0] < bounds[0]
      ? bounds[0] - point[0]
      : point[0] > bounds[2]
        ? point[0] - bounds[2]
        : 0;
  const deltaY =
    point[1] < bounds[1]
      ? bounds[1] - point[1]
      : point[1] > bounds[3]
        ? point[1] - bounds[3]
        : 0;

  return Math.hypot(deltaX, deltaY);
}

function buildBundle(context) {
  const referencePoint = findReferencePoint(context);
  const buildingLocation =
    context.config.building.location ??
    (referencePoint
      ? {
          longitude: referencePoint[0],
          latitude: referencePoint[1],
        }
      : null);

  return {
    id: context.config.building.id,
    name: context.config.building.name,
    description: context.config.building.description,
    address: context.config.building.address,
    campus_id: context.config.building.campus_id,
    building_id: context.config.building.building_id,
    location: buildingLocation,
    levels: context.stats.discoveredFloors ?? [],
    buildings: summarizeBuildings(context.artifacts.pois),
    indoor_map: context.artifacts.indoorMap,
    indoor_routes: context.artifacts.indoorRoutes,
    pois: context.artifacts.pois,
    cad_overlay: context.artifacts.cadOverlay ?? featureCollection([]),
    cad_layouts: context.artifacts.cadLayouts ?? [],
    campus_reference: context.artifacts.campusReference ?? null,
  };
}

function buildCadOverlayFeatures({ context, transformPoint, discoveredFloors }) {
  const overlayGroups = new Map();
  const layoutWindows = context.artifacts.layoutWindows ?? [];

  for (const entity of context.artifacts.dxfDocument.entities ?? []) {
    const classification = classifyEntity(entity, context.config);
    const overlayType = classifyCadOverlayEntity(
      entity,
      classification,
      context.config,
    );
    if (!overlayType || overlayType === "room-label") {
      continue;
    }

    const geometry = extractGeometry(entity);
    if (!geometry || geometry.kind === "point") {
      continue;
    }

    const layoutWindow = resolveLayoutWindowForBounds(
      computeGeometryBounds(geometry),
      layoutWindows,
    );
    if (!layoutWindow) {
      continue;
    }

    const buildingMetadata = resolveBuildingMetadata(
      "",
      layoutWindow,
      context.config,
    );
    const floor = resolveCadOverlayFloor(entity, layoutWindow, context.config);
    if (floor !== null) {
      discoveredFloors.add(floor);
    }

    const commonProperties = {
      feature_type: "cad_overlay",
      cad_feature_type: overlayType,
      level_id: floor,
      floor,
      campus_id: context.config.building.campus_id,
      building_id: buildingMetadata.buildingId,
      building_code: buildingMetadata.buildingCode,
      building_name: buildingMetadata.buildingName,
      layout_name: layoutWindow?.name ?? null,
      layout_zone: layoutWindow?.layoutZone ?? null,
      source_layer: entity.layer ?? null,
      source_entity: "CAD_OVERLAY_GROUP",
    };

    const transformedSegments =
      geometry.kind === "line"
        ? [geometry.points.map(transformPoint).map(roundCoordinatePoint)]
        : [
            closeRing(geometry.points.map(transformPoint)).map(
              roundCoordinatePoint,
            ),
          ];

    const groupKey = [
      layoutWindow.id,
      overlayType,
      buildingMetadata.buildingCode ?? "",
      floor ?? "null",
    ].join("|");
    const existingGroup = overlayGroups.get(groupKey) ?? {
      properties: commonProperties,
      coordinates: [],
    };
    existingGroup.coordinates.push(
      ...transformedSegments.filter((segment) => segment.length >= 2),
    );
    overlayGroups.set(groupKey, existingGroup);
  }

  return [...overlayGroups.values()]
    .filter((group) => group.coordinates.length > 0)
    .map((group) => ({
      type: "Feature",
      id: nextFeatureId(context),
      properties: group.properties,
      geometry: {
        type: "MultiLineString",
        coordinates: group.coordinates,
      },
    }));
}

function buildCadLayoutManifest(layoutWindows) {
  return layoutWindows.map((layoutWindow) => ({
    id: layoutWindow.id,
    name: layoutWindow.name,
    building_code: layoutWindow.buildingCode ?? null,
    building_name: layoutWindow.buildingName ?? null,
    floors: layoutWindow.floors ?? [],
    layout_zone: layoutWindow.layoutZone ?? null,
    is_overview: layoutWindow.isOverview ?? false,
  }));
}

function classifyCadOverlayEntity(entity, classification, config) {
  if (classification === "ignore") {
    return null;
  }

  if (classification !== "unknown") {
    return classification;
  }

  if (anyPatternMatches(config.geometry.boundaryLayers, entity.layer ?? "")) {
    return "wall";
  }

  return null;
}

function computeGeometryBounds(geometry) {
  if (geometry.kind === "point") {
    return [
      geometry.point[0],
      geometry.point[1],
      geometry.point[0],
      geometry.point[1],
    ];
  }

  return computePointBounds(geometry.points);
}

function roundCoordinatePoint([x, y]) {
  return [Number(x.toFixed(6)), Number(y.toFixed(6))];
}

function resolveCadOverlayFloor(entity, layoutWindow, config) {
  const layoutFloors = layoutWindow?.floors ?? [];
  if (layoutFloors.length === 1) {
    return normalizeLayoutFloorForBuilding(
      layoutFloors[0],
      layoutWindow?.buildingCode ?? null,
    );
  }

  if (layoutFloors.length > 1) {
    return null;
  }

  return resolveFloor(entity, config);
}

function resolveLayoutWindowForBounds(bounds, layoutWindows) {
  if (!bounds || bounds.length !== 4) {
    return null;
  }

  const matchingWindows = layoutWindows.filter((layoutWindow) =>
    boundsIntersect(bounds, layoutWindow.bbox),
  );
  if (matchingWindows.length === 0) {
    return null;
  }

  return matchingWindows
    .map((layoutWindow) => ({
      layoutWindow,
      score: scoreLayoutWindowForBounds(layoutWindow, bounds),
    }))
    .sort((left, right) => right.score - left.score)[0]?.layoutWindow;
}

function scoreLayoutWindowForBounds(layoutWindow, bounds) {
  let score = layoutWindow.isOverview ? 0 : 100;
  const bbox = layoutWindow.bbox ?? [];
  if (bbox.length === 4) {
    const area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
    if (Number.isFinite(area) && area > 0) {
      score -= Math.log10(area);
    }
  }

  const center = computeBoundsCenter(bounds);
  if (pointInsideBounds(center, layoutWindow.bbox)) {
    score += 10;
  }

  return score;
}

function summarizeBuildings(poisFeatureCollection) {
  const groupedBuildings = new Map();

  for (const feature of poisFeatureCollection.features ?? []) {
    const buildingId = feature.properties?.building_id ?? null;
    const buildingCode = feature.properties?.building_code ?? null;
    const buildingName =
      feature.properties?.building_name ??
      feature.properties?.metadata?.building_name ??
      null;
    if (!buildingId && !buildingCode && !buildingName) {
      continue;
    }

    const key = buildingId ?? buildingCode ?? buildingName;
    const existing = groupedBuildings.get(key) ?? {
      id: buildingId,
      code: buildingCode,
      name: buildingName,
      floors: new Set(),
      featureCount: 0,
      bounds: null,
    };

    existing.featureCount += 1;
    const floor = feature.properties?.floor;
    if (Number.isFinite(floor)) {
      existing.floors.add(floor);
    }

    const [x, y] = feature.geometry.coordinates;
    if (!existing.bounds) {
      existing.bounds = [x, y, x, y];
    } else {
      existing.bounds[0] = Math.min(existing.bounds[0], x);
      existing.bounds[1] = Math.min(existing.bounds[1], y);
      existing.bounds[2] = Math.max(existing.bounds[2], x);
      existing.bounds[3] = Math.max(existing.bounds[3], y);
    }

    groupedBuildings.set(key, existing);
  }

  return [...groupedBuildings.values()]
    .map((building) => ({
      id: building.id,
      code: building.code,
      name: building.name,
      floors: [...building.floors].sort((left, right) => left - right),
      featureCount: building.featureCount,
      bounds: building.bounds
        ? [
            [building.bounds[0], building.bounds[1]],
            [building.bounds[2], building.bounds[3]],
          ]
        : null,
    }))
    .sort((left, right) => String(left.code ?? "").localeCompare(String(right.code ?? "")));
}

function findReferencePoint(context) {
  const feature =
    context.artifacts.pois.features[0] ??
    context.artifacts.indoorMap.features[0];
  if (!feature) {
    return null;
  }

  if (feature.geometry.type === "Point") {
    return feature.geometry.coordinates;
  }

  if (feature.geometry.type === "LineString") {
    return feature.geometry.coordinates[0] ?? null;
  }

  if (feature.geometry.type === "Polygon") {
    return feature.geometry.coordinates[0]?.[0] ?? null;
  }

  return null;
}

function classifyEntity(entity, config) {
  const searchableText = [entity.layer, entity.name, extractText(entity)]
    .filter(Boolean)
    .join(" ");

  const textValue = extractText(entity);
  if (
    textValue &&
    anyPatternMatches(
      config.labels.roomNumberPatterns,
      normalizeTextValue(textValue),
    )
  ) {
    return "room-label";
  }

  if (anyPatternMatches(config.layers.ignore, searchableText)) {
    return "ignore";
  }

  if (anyPatternMatches(config.layers.routing, searchableText)) {
    return "route";
  }

  if (anyPatternMatches(config.layers.room, searchableText)) {
    return "room";
  }

  if (anyPatternMatches(config.layers.corridor, searchableText)) {
    return "corridor";
  }

  if (anyPatternMatches(config.layers.stairs, searchableText)) {
    return "stairs";
  }

  if (anyPatternMatches(config.layers.elevator, searchableText)) {
    return "elevator";
  }

  if (anyPatternMatches(config.layers.door, searchableText)) {
    return "door";
  }

  if (anyPatternMatches(config.layers.window, searchableText)) {
    return "window";
  }

  return "unknown";
}

function extractStructuredRoomAnchors(context, transformPoint) {
  const roomDataBlocks = new Set(
    (context.config.anchors.roomDataBlocks ?? []).map((name) =>
      name.toLowerCase(),
    ),
  );
  const roomNumberTag = context.config.anchors.roomNumberTag ?? "ROOMNUM";
  const roomUseTag = context.config.anchors.roomUseTag ?? "ROOMUSE";
  const layoutWindows = context.artifacts.layoutWindows ?? [];

  return (context.artifacts.insertRecords ?? [])
    .filter((record) => roomDataBlocks.has(record.name.toLowerCase()))
    .map((record, recordIndex) => {
      const rawRoomNumber = normalizeTextValue(
        record.attributes[roomNumberTag] ?? "",
      );
      const roomUse = normalizeTextValue(record.attributes[roomUseTag] ?? "");

      if (!rawRoomNumber) {
        return null;
      }

      const roomNumber = rawRoomNumber.toUpperCase();
      const buildingCode = extractBuildingCodeFromRoomNumber(roomNumber);
      const roomNumberFloor = extractFloorFromRoomNumber(roomNumber, buildingCode);
      const layoutWindow = resolveLayoutWindowForAnchor(
        record.position,
        buildingCode,
        roomNumberFloor,
        layoutWindows,
      );

      const buildingMetadata = resolveBuildingMetadata(
        roomNumber,
        layoutWindow,
        context.config,
      );
      const floorMetadata = resolveStructuredRoomFloor(
        record,
        roomNumber,
        roomUse,
        buildingMetadata.buildingCode,
        layoutWindow,
        context.config,
      );

      return {
        id: record.handle ?? `room-anchor-${recordIndex + 1}`,
        blockName: record.name,
        layer: record.layer,
        cadPosition: record.position,
        coordinates: transformPoint(record.position),
        roomNumber,
        rawRoomNumber,
        roomUse,
        buildingCode: buildingMetadata.buildingCode,
        buildingId: buildingMetadata.buildingId,
        buildingName: buildingMetadata.buildingName,
        buildingSource: buildingMetadata.buildingSource,
        layoutWindowId: layoutWindow?.id ?? null,
        layoutName: layoutWindow?.name ?? null,
        layoutZone: layoutWindow?.layoutZone ?? null,
        sourceLayoutFloor: floorMetadata.sourceLayoutFloor,
        sourceLayoutFloorCandidates: floorMetadata.sourceLayoutFloorCandidates,
        floor: floorMetadata.floor,
        floorSource: floorMetadata.floorSource,
        basementSeries: floorMetadata.basementSeries,
      };
    })
    .filter(Boolean);
}

function resolveStructuredRoomFloor(
  record,
  roomNumber,
  roomUse,
  buildingCode,
  layoutWindow,
  config,
) {
  const roomNumberFloor = extractFloorFromRoomNumber(roomNumber, buildingCode);
  const layoutFloorCandidates = layoutWindow?.floors ?? [];
  const basementSeries = extractBasementSeries(roomNumber, buildingCode);
  if (roomNumberFloor !== null) {
    return {
      floor: roomNumberFloor,
      floorSource: "room_number",
      sourceLayoutFloor: null,
      sourceLayoutFloorCandidates: layoutFloorCandidates,
      basementSeries,
    };
  }

  if (layoutFloorCandidates.length === 1) {
    return {
      floor: normalizeLayoutFloorForBuilding(
        layoutFloorCandidates[0],
        buildingCode,
      ),
      floorSource: "layout",
      sourceLayoutFloor: layoutFloorCandidates[0],
      sourceLayoutFloorCandidates: layoutFloorCandidates,
      basementSeries,
    };
  }

  for (const rule of config.floors.rules ?? []) {
    const sourceValue = getStructuredFloorRuleSource(
      record,
      roomNumber,
      roomUse,
      rule.source,
    );
    if (!sourceValue) {
      continue;
    }

    const match = new RegExp(rule.pattern, "i").exec(sourceValue);
    if (!match) {
      continue;
    }

    const parsedFloor = parseFloorToken(match[1] ?? match[0]);
    if (parsedFloor === null) {
      continue;
    }

    return {
      floor: parsedFloor + (rule.offset ?? 0),
      floorSource: `${rule.source}-rule`,
      sourceLayoutFloor: null,
      sourceLayoutFloorCandidates: layoutFloorCandidates,
      basementSeries,
    };
  }

  return {
    floor: config.floors.default ?? 0,
    floorSource: "default",
    sourceLayoutFloor: null,
    sourceLayoutFloorCandidates: layoutFloorCandidates,
    basementSeries,
  };
}

function getStructuredFloorRuleSource(record, roomNumber, roomUse, source) {
  if (source === "block") {
    return record.name ?? "";
  }

  if (source === "text") {
    return `${roomNumber} ${roomUse}`.trim();
  }

  return record.layer ?? "";
}

function extractBuildingCodeFromRoomNumber(roomNumber) {
  const normalizedRoomNumber = normalizeTextValue(roomNumber).toUpperCase();

  if (/^ADM(?:[\s-]|$)/u.test(normalizedRoomNumber)) {
    return "ADM";
  }

  if (/^NHSC(?:[\s-]|$)/u.test(normalizedRoomNumber)) {
    return "09";
  }

  if (/^\d{4}[A-Z]?$/u.test(normalizedRoomNumber)) {
    return "ADM";
  }

  const match = /^(\d{2})[-\s]/u.exec(normalizedRoomNumber);
  return match ? match[1] : null;
}

function resolveBuildingMetadata(roomNumber, layoutWindow, config) {
  const roomBuildingCode = extractBuildingCodeFromRoomNumber(roomNumber);
  const buildingCode = roomBuildingCode ?? layoutWindow?.buildingCode ?? null;
  const configuredBuilding = buildingCode
    ? config.buildings.codeMap?.[buildingCode]
    : null;

  return {
    buildingCode,
    buildingId: configuredBuilding?.id ?? config.building.building_id,
    buildingName:
      configuredBuilding?.name ??
      resolveBuildingName(buildingCode, layoutWindow, config),
    buildingSource: roomBuildingCode
      ? "room_number"
      : layoutWindow?.buildingCode
        ? "layout"
        : null,
  };
}

function extractBasementSeries(roomNumber, buildingCode) {
  if (buildingCode !== "10") {
    return null;
  }

  const normalizedRoomNumber = normalizeTextValue(roomNumber).toUpperCase();
  const suffix = normalizedRoomNumber.split("-").slice(1).join("-");
  const basementSeriesMatch = /^(B\d{2,4}[A-Z]?)$/u.exec(suffix);
  return basementSeriesMatch ? basementSeriesMatch[1] : null;
}

function extractFloorFromRoomNumber(roomNumber, buildingCode) {
  const normalizedRoomNumber = normalizeTextValue(roomNumber).toUpperCase();
  if (buildingCode === "ADM" && /^\d{4}[A-Z]?$/u.test(normalizedRoomNumber)) {
    return Number(normalizedRoomNumber[0]);
  }

  const suffix = normalizedRoomNumber.split("-").slice(1).join("-");
  if (!suffix) {
    return null;
  }

  if (extractBasementSeries(normalizedRoomNumber, buildingCode)) {
    return null;
  }

  const basementMatch = /B(\d)/i.exec(suffix);
  if (basementMatch) {
    return -Number(basementMatch[1]);
  }

  const tandemSeriesMatch = /^(\d)\d{3}[A-Z]?$/u.exec(suffix);
  if (buildingCode === "10" && tandemSeriesMatch) {
    return Number(tandemSeriesMatch[1]);
  }

  const floorMatch = /(\d)/.exec(suffix);
  return floorMatch ? Number(floorMatch[1]) : null;
}

function normalizeLayoutFloorForBuilding(layoutFloor, buildingCode) {
  if (buildingCode === "14" && Number.isFinite(layoutFloor)) {
    return layoutFloor + 1;
  }

  return layoutFloor;
}

function classifyRoomUse(roomUse) {
  const normalizedUse = roomUse.toLowerCase();

  if (/stair/.test(normalizedUse)) {
    return "stairs";
  }

  if (/elev/.test(normalizedUse)) {
    return "elevator";
  }

  if (
    /(corridor|circulation|hall|hallway|lobby|vestibule|link|utilidor|atrium|rotunda|entrance|open area)/.test(
      normalizedUse,
    )
  ) {
    return "corridor";
  }

  return "unit";
}

function extractClosedPolygonCandidates(dxfDocument, config, transformPoint) {
  const candidates = [];

  for (const entity of dxfDocument.entities ?? []) {
    const geometry = extractGeometry(entity);
    if (!geometry || geometry.kind !== "polygon") {
      continue;
    }

    if (anyPatternMatches(config.layers.ignore, entity.layer ?? "")) {
      continue;
    }

    const transformedPoints = geometry.points.map(transformPoint);
    const rawBounds = computePointBounds(geometry.points);
    candidates.push({
      key: entity.handle ?? `${entity.type}-${candidates.length + 1}`,
      area: polygonArea(transformedPoints),
      entityType: entity.type,
      layer: entity.layer ?? null,
      rawBounds,
      points: transformedPoints,
      feature: createPolygonFeature(
        entity.handle ?? `${entity.type}-${candidates.length + 1}`,
        transformedPoints,
        { source_layer: entity.layer ?? null },
      ),
    });
  }

  return candidates;
}

function indexPolygonCandidatesByLayout(polygonCandidates, layoutWindows) {
  const index = new Map();

  for (const layoutWindow of layoutWindows) {
    if (layoutWindow.isOverview) {
      continue;
    }

    const scopedCandidates = polygonCandidates.filter((candidate) =>
      boundsIntersect(candidate.rawBounds, layoutWindow.bbox),
    );
    index.set(layoutWindow.id, scopedCandidates);
  }

  return index;
}

function findBestPolygonCandidate(
  point,
  polygonCandidates,
  consumedPolygonKeys,
) {
  return polygonCandidates
    .filter((candidate) => {
      if (consumedPolygonKeys.has(candidate.key)) {
        return false;
      }

      return pointInsidePolygon(point, candidate.feature);
    })
    .sort((left, right) => left.area - right.area)[0];
}

function annotateLayoutWindow(layout, config) {
  const layoutMeta = parseLayoutMetadata(layout.name, config);
  return {
    ...layout,
    ...layoutMeta,
    id: layout.name,
  };
}

function parseLayoutMetadata(layoutName, config) {
  const normalizedName = normalizeTextValue(layoutName);
  const buildingCodeMatch = /^(\d{2})\s+/u.exec(normalizedName);
  const buildingCode = buildingCodeMatch ? buildingCodeMatch[1] : null;
  const floorTokens = extractFloorTokensFromLayoutName(normalizedName);
  const layoutZone = extractLayoutZoneFromLayoutName(normalizedName);
  const isOverview =
    !buildingCode && /FULL CAMPUS|MAIN FLOOR/i.test(normalizedName);

  return {
    buildingCode,
    buildingName: resolveBuildingName(buildingCode, { name: normalizedName }, config),
    floors: floorTokens,
    layoutZone,
    isOverview,
  };
}

function extractFloorTokensFromLayoutName(layoutName) {
  const normalizedName = layoutName.toUpperCase();
  const multiLevelMatch = /\b(?:LVL|LEVEL)\s*(\d+)\s*AND\s*(\d+)\b/u.exec(
    normalizedName,
  );
  if (multiLevelMatch) {
    return [Number(multiLevelMatch[1]), Number(multiLevelMatch[2])];
  }

  const explicitLevels = [
    ...normalizedName.matchAll(/\b(?:LVL|LEVEL|FLOOR)\s*(-?\d+)/gu),
  ].map((match) => Number(match[1]));
  if (explicitLevels.length > 0) {
    return explicitLevels;
  }

  const tandemMatch = /\b(\d)\d{3}[A-Z]?\b/u.exec(normalizedName);
  if (tandemMatch) {
    return [Number(tandemMatch[1])];
  }

  if (/\bBASE(?:MENT)?\b/u.test(normalizedName)) {
    return [0];
  }

  return [];
}

function extractLayoutZoneFromLayoutName(layoutName) {
  const normalizedName = layoutName.toUpperCase();
  const zoneMatch = /\b(?:LVL|LEVEL)\s*\d+([NSECW])\b/u.exec(normalizedName);
  if (zoneMatch) {
    return zoneMatch[1];
  }

  const tandemZoneMatch = /\b\d{4}([EW])\b/u.exec(normalizedName);
  return tandemZoneMatch ? tandemZoneMatch[1] : null;
}

function resolveLayoutWindowForAnchor(
  position,
  buildingCode,
  floor,
  layoutWindows,
) {
  const matchingWindows = layoutWindows.filter((layoutWindow) =>
    pointInsideBounds(position, layoutWindow.bbox),
  );
  if (matchingWindows.length === 0) {
    return null;
  }

  const bestLayout = matchingWindows
    .map((layoutWindow) => ({
      layoutWindow,
      score: scoreLayoutWindowForAnchor(layoutWindow, buildingCode, floor),
    }))
    .sort((left, right) => right.score - left.score)[0];

  if (!bestLayout || bestLayout.score < 0) {
    return null;
  }

  return bestLayout.layoutWindow;
}

function scoreLayoutWindowForAnchor(layoutWindow, buildingCode, floor) {
  let score = layoutWindow.isOverview ? 0 : 100;

  if (buildingCode && layoutWindow.buildingCode === buildingCode) {
    score += 50;
  } else if (buildingCode && layoutWindow.buildingCode) {
    score -= 100;
  }

  if (floor !== null && (layoutWindow.floors?.length ?? 0) > 0) {
    score += layoutWindow.floors.includes(floor) ? 20 : -30;
  }

  const bbox = layoutWindow.bbox ?? [];
  if (bbox.length === 4) {
    const area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
    if (Number.isFinite(area) && area > 0) {
      score -= Math.log10(area);
    }
  }

  return score;
}

function resolveBuildingName(buildingCode, layoutWindow, config) {
  if (!buildingCode) {
    return null;
  }

  const configuredBuilding = config.buildings.codeMap?.[buildingCode];
  if (configuredBuilding?.name) {
    return configuredBuilding.name;
  }

  if (layoutWindow?.name) {
    const normalizedName = normalizeTextValue(layoutWindow.name);
    const withoutPrefix = normalizedName.replace(/^\d{2}\s+/u, "");
    const withoutFloor = withoutPrefix
      .replace(/\b(?:LVL|LEVEL|FLOOR)\b.*$/iu, "")
      .replace(/\b(FULL|BASEMENT|MAIN)\b.*$/iu, "")
      .trim();

    return withoutFloor || null;
  }

  return null;
}

function computePointBounds(points) {
  if (points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return [minX, minY, maxX, maxY];
}

function pointInsideBounds(point, bounds) {
  if (!bounds || bounds.length !== 4) {
    return false;
  }

  return (
    point[0] >= bounds[0] &&
    point[0] <= bounds[2] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[3]
  );
}

function boundsIntersect(leftBounds, rightBounds) {
  if (!leftBounds || !rightBounds) {
    return false;
  }

  return !(
    leftBounds[2] < rightBounds[0] ||
    rightBounds[2] < leftBounds[0] ||
    leftBounds[3] < rightBounds[1] ||
    rightBounds[3] < leftBounds[1]
  );
}

function resolveFloor(entity, config) {
  for (const rule of config.floors.rules ?? []) {
    const sourceValue = getFloorRuleSource(entity, rule.source);
    if (!sourceValue) {
      continue;
    }

    const match = new RegExp(rule.pattern, "i").exec(sourceValue);
    if (!match) {
      continue;
    }

    const parsedFloor = parseFloorToken(match[1] ?? match[0]);
    if (parsedFloor === null) {
      continue;
    }

    return parsedFloor + (rule.offset ?? 0);
  }

  return config.floors.default ?? 0;
}

function getFloorRuleSource(entity, source) {
  if (source === "block") {
    return entity.name ?? "";
  }

  if (source === "text") {
    return extractText(entity) ?? "";
  }

  return entity.layer ?? "";
}

function parseFloorToken(token) {
  if (!token) {
    return null;
  }

  const normalizedToken = token.toString().trim().toUpperCase();
  const basementMatch = /^B(\d+)$/.exec(normalizedToken);
  if (basementMatch) {
    return -Number(basementMatch[1]);
  }

  const prefixedMatch = /(?:LEVEL|FLOOR|L)[-_ ]?(-?\d+)/.exec(normalizedToken);
  if (prefixedMatch) {
    return Number(prefixedMatch[1]);
  }

  const numericValue = Number(normalizedToken);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return null;
}

function extractGeometry(entity) {
  if (entity.type === "LINE") {
    return {
      kind: "line",
      points: entity.vertices.map((vertex) => [vertex.x, vertex.y]),
    };
  }

  if (entity.type === "LWPOLYLINE") {
    const points = entity.vertices.map((vertex) => [vertex.x, vertex.y]);
    return {
      kind: entity.shape || isClosed(points) ? "polygon" : "line",
      points,
    };
  }

  if (entity.type === "POLYLINE") {
    const points = entity.vertices.map((vertex) => [vertex.x, vertex.y]);
    return {
      kind: entity.shape || isClosed(points) ? "polygon" : "line",
      points,
    };
  }

  if (entity.type === "INSERT") {
    const point = extractPoint(entity);
    return point ? { kind: "point", point } : null;
  }

  return null;
}

function extractPoint(entity) {
  if (entity.position) {
    return [entity.position.x, entity.position.y];
  }

  if (entity.startPoint) {
    return [entity.startPoint.x, entity.startPoint.y];
  }

  return null;
}

function extractText(entity) {
  if (entity.type === "TEXT" || entity.type === "MTEXT") {
    return normalizeTextValue(entity.text ?? "");
  }

  return null;
}

function isClosed(points) {
  if (points.length < 3) {
    return false;
  }

  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points.at(-1);
  return firstX === lastX && firstY === lastY;
}

function nextFeatureId(context) {
  const nextId = context.counters.featureId;
  context.counters.featureId += 1;
  return nextId;
}

function extractInsertRecords(dxfContents) {
  const groups = dxfContents.split(/\r?\n/u);
  const records = [];
  let index = 0;

  while (index + 1 < groups.length) {
    const code = groups[index]?.trim();
    const value = groups[index + 1] ?? "";

    if (code !== "0" || value !== "INSERT") {
      index += 2;
      continue;
    }

    const record = {
      attributes: {},
      handle: null,
      layer: "0",
      name: "",
      position: [0, 0],
    };

    index += 2;

    while (index + 1 < groups.length) {
      const groupCode = groups[index]?.trim();
      const groupValue = groups[index + 1] ?? "";

      if (groupCode === "0" && groupValue === "ATTRIB") {
        const attribute = {};
        index += 2;

        while (index + 1 < groups.length) {
          const attribCode = groups[index]?.trim();
          const attribValue = groups[index + 1] ?? "";

          if (attribCode === "0") {
            break;
          }

          if (attribCode === "1") {
            attribute.text = attribValue;
          } else if (attribCode === "2") {
            attribute.tag = attribValue;
          }

          index += 2;
        }

        if (attribute.tag) {
          record.attributes[attribute.tag] = attribute.text ?? "";
        }

        continue;
      }

      if (groupCode === "0" && groupValue === "SEQEND") {
        index += 2;
        break;
      }

      if (groupCode === "0") {
        break;
      }

      if (groupCode === "8") {
        record.layer = groupValue;
      } else if (groupCode === "5") {
        record.handle = groupValue;
      } else if (groupCode === "2") {
        record.name = groupValue;
      } else if (groupCode === "10") {
        record.position[0] = Number(groupValue);
      } else if (groupCode === "20") {
        record.position[1] = Number(groupValue);
      }

      index += 2;
    }

    records.push(record);
  }

  return records;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function interpolateCommand(template, replacements) {
  let command = template;
  for (const [key, value] of Object.entries(replacements)) {
    command = command.replaceAll(`{${key}}`, shellQuote(value));
  }

  return command;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function commandExists(command) {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
