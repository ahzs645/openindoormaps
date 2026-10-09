import type { IndoorDataset, IndoorEdge } from "./contract";
import { certifyNativeRampCrossfall } from "./native-ramp-crossfall";
import { routingCalculationValue } from "./routing-cache";
/** Cheap import binding checks; full profile recovery belongs to the worker. */
export function validNativeRampSurfaceBinding(
  data: IndoorDataset,
  edge: IndoorEdge,
): boolean {
  try {
    const proof = edge.nativeRampSurface;
    if (
      !proof ||
      edge.kind !== "ramp" ||
      proof.version !== 1 ||
      proof.sourceModelSha256 !== data.source.modelSha256 ||
      proof.nativeRampId !== edge.nativeElementId ||
      !Number.isSafeInteger(proof.nativeRampId) ||
      proof.nativeRampId <= 0 ||
      !Array.isArray(proof.nativeFloorElementIds) ||
      !proof.nativeFloorElementIds.length ||
      proof.nativeFloorElementIds.length > 100 ||
      proof.nativeFloorElementIds.some(
        (id) => !Number.isSafeInteger(id) || id <= 0,
      ) ||
      new Set(proof.nativeFloorElementIds).size !==
        proof.nativeFloorElementIds.length ||
      JSON.stringify(proof.pointsFeet) !== JSON.stringify(edge.pointsFeet)
    )
      return false;
    const support = data.walkingSupport,
      display = data.rampDisplay;
    if (
      support?.sourceModelSha256 !== data.source.modelSha256 ||
      display?.sourceModelSha256 !== data.source.modelSha256
    )
      return false;
    const ramp = display.ramps.find(
        (r) =>
          r.edgeId === edge.id &&
          r.nativeElementId === proof.nativeRampId &&
          !r.displayOnly,
      ),
      certificate = proof.widthCertificate;
    if (
      !ramp ||
      !ramp.trianglesFeet.length ||
      !certificate ||
      certificate.version !== 1 ||
      certificate.halfWidthFeet !== 0.5 ||
      !Array.isArray(certificate.tracks) ||
      !certificate.tracks.length ||
      certificate.tracks.length > 3 * (edge.pointsFeet.length - 1) ||
      [
        certificate.maximumCrossfallRatio,
        certificate.maximumContinuousHeightJointFeet,
        certificate.maximumNativeJointFeet,
      ].some((v) => !Number.isFinite(v) || v < 0)
    )
      return false;
    if (
      proof.nativeFloorElementIds.some(
        (id) => !support.floors.some((f) => f.nativeElementId === id),
      )
    )
      return false;
    return certificate.tracks.every(
      (track) =>
        Number.isSafeInteger(track.segmentIndex) &&
        track.segmentIndex >= 0 &&
        track.segmentIndex < edge.pointsFeet.length - 1 &&
        [-0.5, 0, 0.5].includes(track.offsetFeet) &&
        Array.isArray(track.sections) &&
        track.sections.length > 0 &&
        track.sections.length < 100000 &&
        track.sections.every(
          (section) =>
            Number.isFinite(section.start) &&
            Number.isFinite(section.end) &&
            section.start >= 0 &&
            section.end <= 1 &&
            section.start < section.end &&
            Number.isFinite(section.startHeightFeet) &&
            Number.isFinite(section.endHeightFeet) &&
            (section.nativeTriangleIndex === undefined ||
              (Number.isSafeInteger(section.nativeTriangleIndex) &&
                section.nativeTriangleIndex >= 0 &&
                section.nativeTriangleIndex < ramp.trianglesFeet.length)) &&
            (section.nativeFloorId === undefined ||
              proof.nativeFloorElementIds.includes(section.nativeFloorId)) &&
            (section.nativeTriangleIndex !== undefined ||
              section.nativeFloorId !== undefined),
        ),
    );
  } catch {
    return false;
  }
}
/** A saved certificate is evidence to recheck, not permission to ignore native
 * geometry. Each immutable calculation independently recovers its profiles. */
export function validatedNativeRampSurface(
  data: IndoorDataset,
  edge: IndoorEdge,
): boolean {
  return routingCalculationValue(data, `native-ramp-surface:${edge.id}`, () => {
    const proof = edge.nativeRampSurface;
    if (!proof) return !(data.nativeIndoorEnvelopes && edge.kind === "ramp");
    if (!validNativeRampSurfaceBinding(data, edge)) return false;
    try {
      const ramp = data.rampDisplay!.ramps.find(
        (r) => r.edgeId === edge.id && r.nativeElementId === proof.nativeRampId,
      )!;
      const floors = proof.nativeFloorElementIds.flatMap((id) =>
        data.walkingSupport!.floors.filter((f) => f.nativeElementId === id),
      );
      const original = floors.map((f) => ({
        elementId: f.nativeElementId,
        categoryId: -2000032,
        boundsFeet: { max: { z: f.elevationFeet } },
        loops: f.ringsFeet.map((r) =>
          r.map(
            (p) => [p[0], p[1], f.elevationFeet] as [number, number, number],
          ),
        ),
      }));
      const certificate = certifyNativeRampCrossfall(
        ramp.trianglesFeet,
        original,
        edge.pointsFeet,
      );
      return (
        !!certificate &&
        JSON.stringify(certificate) === JSON.stringify(proof.widthCertificate)
      );
    } catch {
      return false;
    }
  });
}
