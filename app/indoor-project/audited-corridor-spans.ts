import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import landingSurvey from "./unbc-stair-4-landing-span.json";
import certificate from "./unbc-corridor-strip-certificate.json";
import guideContext from "./reviewed-bend-catalog.json";
import { NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 } from "./published-route-runtime-binding";
import { matchesReviewedGuideContext } from "./reviewed-guide-bends";
import { surveyedCorridorSpans } from "./unbc-corridor-span-survey";
import type { IndoorDataset, IndoorNode } from "./contract";
import type { ProjectRoutingGraph } from "./routing-graph";
import type { PreparedRouting } from "./prepared-routing";
import type { PathwayArc } from "./shared-pathway-routing";
import {
  corridorGuideLength,
  type SharedGuidePoint as XYZ,
} from "./shared-corridor-guides";
import {
  corridorRunAvoidsOtherBranches,
  reviewedCorridorStripSupported,
} from "./native-public-corridor-strip";

type Guide = PreparedRouting["guides"][number];
type CheckStation = (
  terminal: string,
  cell: string,
  point: XYZ,
  incoming: boolean,
) => { vertex: string; admitted: () => boolean } | undefined;

/** Survey proof covers native strip clearance only. Link permissions,
 * both attached stations and intersection with live guides are checked separately. */
export function corridorSurveyCertificateMatches(
  data: IndoorDataset,
  prepared: PreparedRouting | undefined,
  surveys = surveyedCorridorSpans(data),
) {
  return (
    !!prepared &&
    certificate.version === 1 &&
    NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 ===
      certificate.nativeStripEngineSha256 &&
    guideContext.physicalBinding === certificate.physicalBinding &&
    guideContext.reviewContextSha256 === certificate.reviewContextSha256 &&
    guideContext.guideAtlasSha256 === certificate.guideAtlasSha256 &&
    bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(surveys)))) ===
      certificate.surveySha256 &&
    matchesReviewedGuideContext(data, prepared)
  );
}

const landing = landingSurvey.span as ReturnType<
  typeof surveyedCorridorSpans
>[number];

/** Stair 4's field-reviewed landing is flat circulation. Its native run,
 * treads and supporting faces were checked instead of the old stair-room
 * label outline. The proof applies only to this single original walk. */
function landingCertificateMatches(
  data: IndoorDataset,
  prepared?: PreparedRouting,
) {
  const proof = landingSurvey.certificate;
  return (
    !!prepared &&
    NATIVE_CORRIDOR_STRIP_ENGINE_SHA256 === proof.nativeStripEngineSha256 &&
    guideContext.physicalBinding === proof.physicalBinding &&
    guideContext.reviewContextSha256 === proof.reviewContextSha256 &&
    guideContext.guideAtlasSha256 === proof.guideAtlasSha256 &&
    bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(landing)))) ===
      proof.spanSha256 &&
    matchesReviewedGuideContext(data, prepared)
  );
}

/** Recover only the hallway-to-hallway portion of an enabled original walk.
 * A changed station, permission, crossing, face or supporting slab holds it. */
export function auditedCorridorSpans(
  data: IndoorDataset,
  graph: ProjectRoutingGraph,
  nodes: ReadonlyMap<string, IndoorNode>,
  eligible: ReadonlySet<string>,
  guides: ReadonlyMap<string, Guide>,
  station: CheckStation,
  prepared?: PreparedRouting,
) {
  const arcs: PathwayArc[] = [];
  const surveys = surveyedCorridorSpans(data);
  let certified: boolean | undefined;
  for (const survey of [...surveys, landing]) {
    const { cell, level, floor, from, to, via } = survey;
    const id = cell + ":walk:" + [from[0], to[0]].sort().join("|");
    if (
      !eligible.has(id) ||
      guides.has(id) ||
      nodes.get(from[0])?.levelId !== level ||
      nodes.get(to[0])?.levelId !== level
    )
      continue;
    const points: XYZ[] = [
      [from[1], from[2], floor],
      ...(via ? [[via[0], via[1], floor] as XYZ] : []),
      [to[1], to[2], floor],
    ];
    let geometry: boolean | undefined;
    for (const forward of [true, false]) {
      const first = forward ? from : to,
        last = forward ? to : from;
      const link = graph.adjacency
        .get(first[0])
        ?.find((l) => l.to === last[0] && l.edge.id === id);
      if (
        !link ||
        link.blockers.length > 0 ||
        link.requiredRooms.length > 0 ||
        link.passages.length > 0
      )
        continue;
      const edge = link.edge;
      if (
        !edge.enabled ||
        edge.kind !== "walk" ||
        edge.nativeCellId !== cell ||
        edge.from !== from[0] ||
        edge.to !== to[0] ||
        edge.pointsFeet.length === 0 ||
        edge.pointsFeet.some((p) => p[2] !== floor)
      )
        continue;
      const path = forward ? points : points.toReversed();
      const a = station(first[0], cell, path[0], true),
        b = station(last[0], cell, path.at(-1)!, false);
      if (!a || !b) continue;
      arcs.push({
        from: a.vertex,
        to: b.vertex,
        sourceFrom: first[0],
        sourceTo: last[0],
        link,
        points: path,
        metres:
          corridorGuideLength(path) * data.alignment.horizontalMetresPerFoot,
        validateReviewedRun: () => {
          if (!a.admitted() || !b.admitted()) return false;
          return (geometry ??=
            corridorRunAvoidsOtherBranches(points, guides.values(), cell) &&
            (survey === landing
              ? landingCertificateMatches(data, prepared)
              : (certified ??= corridorSurveyCertificateMatches(
                  data,
                  prepared,
                  surveys,
                )) ||
                (reviewedCorridorStripSupported(
                  data,
                  cell,
                  level,
                  floor,
                  points,
                ) &&
                  reviewedCorridorStripSupported(
                    data,
                    cell,
                    level,
                    floor,
                    points.toReversed(),
                  ))));
        },
      });
    }
  }
  return arcs;
}
