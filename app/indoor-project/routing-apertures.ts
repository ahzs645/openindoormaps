import type { IndoorDataset, IndoorEdge } from "./contract";
type XY = [number, number];
export type SourceDoorProof = {
  version: 1;
  sourceModelSha256: string;
  sourceSha256: string;
  sectionId: string;
  registrationErrorFeet: number;
  levelId: number;
  elevationFeet: number;
  nativeFloorElementIds: number[];
  wallSegmentIndices: number[];
  doorSymbolCollection: "wallSegments";
  doorSymbolSegmentIndices: number[];
  apertureFeet: XY[];
  walkingStripWidthFeet: number;
};
type NativeDoor = NonNullable<IndoorDataset["doors"]>[number];
export type RoutingAperture = Omit<NativeDoor, "nativeElementId"> & {
  nativeElementId?: number;
};

export function validatedSourceDoorProof(
  data: IndoorDataset,
  edge: IndoorEdge,
): SourceDoorProof | undefined {
  const p = (edge as IndoorEdge & { sourceDoorProof?: SourceDoorProof })
    .sourceDoorProof;
  if (
    !p ||
    edge.kind !== "door" ||
    edge.nativeElementId !== undefined ||
    p.version !== 1 ||
    p.sourceModelSha256 !== data.source.modelSha256 ||
    !data.walkingSupport ||
    data.walkingSupport.sourceModelSha256 !== p.sourceModelSha256
  )
    return;
  if (
    !Number.isFinite(p.registrationErrorFeet) ||
    p.registrationErrorFeet < 0 ||
    p.registrationErrorFeet > 0.05 ||
    !Number.isFinite(p.walkingStripWidthFeet) ||
    p.walkingStripWidthFeet < 2 ||
    !Array.isArray(p.apertureFeet) ||
    p.apertureFeet.length !== 4 ||
    !p.apertureFeet.every((x) => x.length === 2 && x.every(Number.isFinite))
  )
    return;
  const nodes = [edge.from, edge.to].map((id) =>
    data.nodes.find((n) => n.id === id),
  );
  if (
    nodes.some(
      (n) =>
        !n ||
        n.levelId !== p.levelId ||
        Math.abs(n.pointFeet[2] - p.elevationFeet) > 0.01,
    )
  )
    return;
  if (
    edge.roomKeys.length !== 2 ||
    !edge.roomKeys.every((key) => {
      const r = data.records.find((r) => r.key === key),
        dwg = r?.properties.dwg as
          | { sha256?: string; sectionId?: string }
          | undefined;
      return (
        r?.levelId === p.levelId &&
        dwg?.sha256 === p.sourceSha256 &&
        dwg?.sectionId === p.sectionId
      );
    })
  )
    return;
  if (
    !Array.isArray(p.nativeFloorElementIds) ||
    p.nativeFloorElementIds.length === 0 ||
    !p.nativeFloorElementIds.every(
      (id) =>
        Number.isInteger(id) &&
        id > 0 &&
        data.walkingSupport!.floors.some(
          (f) =>
            f.nativeElementId === id &&
            Math.abs(f.elevationFeet - p.elevationFeet) < 0.05,
        ),
    )
  )
    return;
  if (
    p.doorSymbolCollection !== "wallSegments" ||
    ![p.wallSegmentIndices, p.doorSymbolSegmentIndices].every(
      (indices) =>
        Array.isArray(indices) &&
        indices.length > 0 &&
        indices.every((i) => Number.isInteger(i) && i >= 0),
    )
  )
    return;
  return p;
}

/** Source-proved thresholds have their own identity; native inventory remains
 * unchanged and no Revit element identifier is manufactured. */
export function routingDoorApertures(
  data: IndoorDataset,
  includeUnboundDependencies = false,
): RoutingAperture[] {
  const doors: RoutingAperture[] = [...(data.doors ?? [])];
  for (const edge of data.edges) {
    const saved = (edge as IndoorEdge & { sourceDoorProof?: SourceDoorProof })
      .sourceDoorProof;
    const proof =
      validatedSourceDoorProof(data, edge) ??
      (includeUnboundDependencies &&
      edge.kind === "door" &&
      saved?.apertureFeet?.length === 4 &&
      saved.apertureFeet.every(
        (p) => p.length === 2 && p.every(Number.isFinite),
      )
        ? saved
        : undefined);
    if (!proof) continue;
    const a = edge.pointsFeet[0],
      b = edge.pointsFeet.at(-1)!,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-8) continue;
    doors.push({
      id: edge.id,
      levelId: proof.levelId,
      pointFeet: [
        proof.apertureFeet.reduce((s, p) => s + p[0], 0) / 4,
        proof.apertureFeet.reduce((s, p) => s + p[1], 0) / 4,
      ],
      footprintFeet: proof.apertureFeet,
      normalFeet: [(b[0] - a[0]) / length, (b[1] - a[1]) / length],
      roomKeys: edge.roomKeys,
      state: "connected",
    });
  }
  return doors;
}
