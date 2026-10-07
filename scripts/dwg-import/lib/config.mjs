import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const defaultConfig = {
  building: {
    id: 1,
    name: "Imported Building",
    description: "Generated from CAD input",
    address: "",
    campus_id: "CAMPUS_001",
    building_id: "BUILDING_001",
    location: null,
  },
  conversion: {
    commandTemplate: "",
  },
  transform: {
    mode: "identity",
    controlPoints: [],
  },
  floors: {
    default: 0,
    rules: [],
  },
  layouts: {
    usePaperSpaceViewports: false,
    requireContext: false,
    allowMissingViewportStatus: false,
  },
  buildings: {
    codeMap: {},
  },
  geometry: {
    recoverFromWalls: false,
    boundaryLayers: [],
    layoutMargin: 0,
    flattenDistance: 250,
    anchorTolerance: 250,
    minPolygonArea: 50,
    maxPolygonArea: null,
  },
  campus: {
    enabled: false,
    referenceDxf: "",
    referenceLayer: "",
    componentAreaThreshold: 500,
    componentControlPoints: [],
    placementComponentMap: {},
    ignoredComponentIndexes: [],
  },
  anchors: {
    roomDataBlocks: ["room_data"],
    roomNumberTag: "ROOMNUM",
    roomUseTag: "ROOMUSE",
  },
  layers: {
    room: [],
    corridor: [],
    stairs: [],
    elevator: [],
    door: [],
    window: [],
    routing: [],
    ignore: [],
  },
  labels: {
    roomNumberPatterns: ["^[A-Z]{0,3}-?\\d{2,4}[A-Z]?$", "^\\d{2,4}[A-Z]?$"],
  },
};

export function loadConfig(configPath) {
  const resolvedPath = resolve(configPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const fileContents = readFileSync(resolvedPath, "utf8");
  const parsedConfig = JSON.parse(fileContents);
  return mergeConfig(defaultConfig, parsedConfig);
}

export function compileMatchers(patterns = []) {
  return patterns.map((pattern) => new RegExp(pattern, "i"));
}

export function anyPatternMatches(patterns = [], value = "") {
  if (!value) {
    return false;
  }

  return compileMatchers(patterns).some((pattern) => pattern.test(value));
}

function mergeConfig(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return Array.isArray(override) ? override : base;
  }

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override ?? base;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = mergeConfig(base[key], value);
  }

  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
