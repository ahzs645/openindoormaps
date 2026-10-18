import type { FeatureCollection } from "geojson";
export type PublishedVisitorPlan = {
  format: "openindoormaps-visitor-plan-v1";
  version: 1;
  revisionSha256: string;
  engineSha256: string;
  datasetSha256: string;
  scopeId: string;
  levelIds: number[];
  bindingSha256: string;
  pooledJsonSha256: string;
  display: {
    nativeIndoorEnvelopes: boolean;
    nativeMaterialSections: boolean;
    windowMode: "native" | "simplified" | null;
  };
  layers: Record<
    | "areas"
    | "rooms"
    | "walls"
    | "doors"
    | "stairs"
    | "windows"
    | "labels"
    | "connectors"
    | "portals"
    | "selection",
    FeatureCollection
  >;
  native?: {
    fills: FeatureCollection;
    overview: FeatureCollection;
    outlines: FeatureCollection;
    partitions: FeatureCollection;
    walls: FeatureCollection;
    regions: { id: string; levelId: number; roomKeys: string[] }[];
  };
};
export type PublishedVisitorPlanReceipt = {
  id: string;
  revisionSha256: string;
  engineSha256: string;
  datasetSha256: string;
  scopeId: string;
  bindingSha256: string;
  pooledJsonSha256: string;
  runtimeSha256: string;
  logicalSha256: string;
  logicalBytes: number;
  compressedSha256: string;
  compressedBytes: number;
  url: string;
  delta?: {
    baseScopeId: string;
    baseLogicalSha256: string;
    logicalSha256: string;
    logicalBytes: number;
  };
};
