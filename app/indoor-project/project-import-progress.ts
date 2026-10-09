export const PROJECT_IMPORT_STAGES = {
  archive: "Opening ZIP files",
  checksums: "Checking file checksums",
  decode: "Reading project data",
  companions: "Checking review evidence",
  geometry: "Checking geometry and graph",
  materials: "Checking native materials and enclosures",
  routes: "Checking prepared routing",
  mapping: "Checking saved native floor maps",
  reviews: "Checking reviews and source bindings",
  patches: "Checking applied boundary patches",
  identity: "Checking room and connector identities",
  scene: "Checking the source model scene",
  transfer: "Loading validated project into the map",
} as const;
export type ProjectImportStage = keyof typeof PROJECT_IMPORT_STAGES;
export type ProjectImportProgress = {
  stage: ProjectImportStage;
  elapsedMs: number;
};
export type ProjectImportObserver = (progress: ProjectImportProgress) => void;
export function isProjectImportProgress(
  value: unknown,
): value is ProjectImportProgress {
  if (!value || typeof value !== "object") return false;
  const p = value as ProjectImportProgress;
  return (
    Object.hasOwn(PROJECT_IMPORT_STAGES, p.stage) &&
    Number.isFinite(p.elapsedMs) &&
    p.elapsedMs >= 0
  );
}
export function projectImportReporter(observer?: ProjectImportObserver) {
  const start = performance.now();
  return (stage: ProjectImportStage) =>
    observer?.({ stage, elapsedMs: performance.now() - start });
}
