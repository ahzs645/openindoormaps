/** REQUESTS ONLY. No source authority, clear-material claim, or route admission. */
import { proposeUntrustedFiniteRunRequests } from "./stepped-stair-v2-assembly-request-proposals.mjs";
import {
  rational,
  nativeRationalScalarToIEEE,
} from "../../../../reviter/lib/reviter/native-rational-overlay.ts";
/** Keep native graph/floor approaches and every other typed station unchanged.
 * A concave turning cap can require distinct entrance and exit stations.
 * Anchors are requests sampled from ORIGINAL finite-riser midpoints and inward
 * directions; the existing exact finite/cap/uncertainty/intent helper rechecks
 * the COMPLETE chain. No sample or numeric rounding grants source authority. */
/** @param {any} input
 * @param {{typedIndex?: number, depthsFeet?: number[], maxAttempts?: number}} [options]
 */
export function proposeRepeatedOriginalTurnRequests(
  input,
  { typedIndex, depthsFeet = [1.5, 2, 2.5, 3, 3.5, 4], maxAttempts = 36 } = {},
) {
  try {
    if (
      !Number.isSafeInteger(typedIndex) ||
      typedIndex < 0 ||
      !Number.isSafeInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > 256 ||
      !Array.isArray(depthsFeet) ||
      !depthsFeet.length ||
      depthsFeet.length > 16 ||
      depthsFeet.some((d) => !Number.isFinite(d) || d <= 0 || d > 16)
    )
      return {
        found: false,
        reason: "invalid-bounded-turn-request",
        sourceAuthorityGranted: false,
        routeApproved: false,
      };
    const refused = (reason, extra = {}) => ({
      found: false,
      reason,
      ...extra,
      sourceAuthorityGranted: false,
      runtimeIntegrationApproved: false,
      routeApproved: false,
    });
    if (
      !input ||
      !input.receipt ||
      !Array.isArray(input.receipt.stations) ||
      !Array.isArray(input.receipt.terminals) ||
      input.receipt.terminals.length !== 2 ||
      input.receipt.terminals.some((t) => t.kind === "source-landing") ||
      !Array.isArray(input.treadRelations) ||
      !Array.isArray(input.orderedRisers)
    )
      return refused("missing-original-single-run-request-operands");
    const old = input.receipt.stations,
      ordinals = old.flatMap((s, i) =>
        s.typedIndex === typedIndex ? [i] : [],
      );
    if (
      ordinals.length !== 1 ||
      ordinals[0] === 0 ||
      ordinals[0] === old.length - 1
    )
      return {
        found: false,
        reason: "not-one-interior-original-turn-station",
        sourceAuthorityGranted: false,
        routeApproved: false,
      };
    const i = ordinals[0],
      station = old[i],
      relation = input.treadRelations[typedIndex];
    if (
      !relation ||
      relation.typedIndex !== typedIndex ||
      !Number.isSafeInteger(relation.startRiserIndex) ||
      !Number.isSafeInteger(relation.endRiserIndex) ||
      relation.startRiserIndex < 0 ||
      relation.endRiserIndex < 0
    )
      return refused("missing-original-finite-turn-relation");
    const start = input.orderedRisers[relation.startRiserIndex]?.originalCurve,
      end = input.orderedRisers[relation.endRiserIndex]?.originalCurve;
    const validLine = (line) =>
      line &&
      Array.isArray(line.m_origin) &&
      line.m_origin.length === 3 &&
      Array.isArray(line.m_dirVec) &&
      line.m_dirVec.length === 3 &&
      Array.isArray(line.m_endParams) &&
      line.m_endParams.length === 2 &&
      [...line.m_origin, ...line.m_dirVec, ...line.m_endParams].every(
        Number.isFinite,
      ) &&
      line.m_dirVec[2] === 0 &&
      (line.m_dirVec[0] !== 0 || line.m_dirVec[1] !== 0) &&
      line.m_endParams[0] !== line.m_endParams[1];
    if (
      !validLine(start) ||
      !validLine(end) ||
      !validLine(relation.originalFiniteStartLine) ||
      !validLine(relation.originalFiniteEndLine)
    )
      return refused("unsupported-original-finite-turn-boundaries");
    if (!start || !end)
      return {
        found: false,
        reason: "missing-original-finite-turn-boundaries",
        sourceAuthorityGranted: false,
        routeApproved: false,
      };
    const num = nativeRationalScalarToIEEE,
      origin = station.pointFeet.slice(0, 2).map(num);
    const anchor = (line, depth) => {
      const t = (line.m_endParams[0] + line.m_endParams[1]) / 2,
        center = line.m_origin
          .slice(0, 2)
          .map((q, k) => q + line.m_dirVec[k] * t),
        normal = [-line.m_dirVec[1], line.m_dirVec[0]],
        scale = Math.max(...normal.map(Math.abs));
      if (!scale) throw Error("degenerate-source-riser");
      const dot = normal.reduce(
          (q, n, k) => q + n * (origin[k] - center[k]),
          0,
        ),
        sign = dot < 0 ? -1 : 1;
      return center.map((q, k) =>
        rational(q + (normal[k] / scale) * depth * sign),
      );
    };
    const attempts = [];
    for (const a of depthsFeet)
      for (const b of depthsFeet) {
        if (attempts.length >= maxAttempts)
          return {
            found: false,
            reason: "bounded-turn-request-budget-exhausted",
            attempts,
            sourceAuthorityGranted: false,
            routeApproved: false,
          };
        const first = {
            ...station,
            pointFeet: [...anchor(start, a), station.pointFeet[2]],
            lateralDirectionFeet:
              relation.originalFiniteStartLine.m_dirVec.slice(0, 2),
          },
          last = {
            ...station,
            pointFeet: [...anchor(end, b), station.pointFeet[2]],
            lateralDirectionFeet: relation.originalFiniteEndLine.m_dirVec.slice(
              0,
              2,
            ),
          },
          stations = [...old.slice(0, i), first, last, ...old.slice(i + 1)],
          receipt = { ...input.receipt, stations };
        const result = proposeUntrustedFiniteRunRequests({
          ...input,
          receipt,
          maxCandidatesPerStation: 1,
          maxTransitionChecks: 2000,
        });
        attempts.push({
          entryDepthFeet: a,
          exitDepthFeet: b,
          found: result.found,
          reason: result.reason,
          checks: result.checks,
        });
        if (result.found) {
          const same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
            literal = (s) => ({
              typedIndex: s.typedIndex,
              pointFeet: s.pointFeet.slice(0, 2).map(num),
              lateralDirectionFeet: s.lateralDirectionFeet,
            }),
            unexpected = [];
          for (let original = 0; original < old.length; original++)
            if (original !== i) {
              const target = original < i ? original : original + 1;
              if (!same(result.stations[target], literal(old[original])))
                unexpected.push(original);
            }
          const expectedTerminals = input.receipt.terminals.map((t) => ({
            originalNodeId: t.originalNodeId,
            originalLevelId: t.originalLevelId,
            originalLogicalPointFeet: t.originalLogicalPointFeet.map((q) => [
              q.n.toString(),
              q.d.toString(),
            ]),
            physicalAttachmentPointFeet: t.physicalAttachmentPointFeet.map(
              (q) => [q.n.toString(), q.d.toString()],
            ),
            floorSupportId: t.floorSupportId,
            approachXYFeet: t.approachFeet.map((p) => p.slice(0, 2).map(num)),
          }));
          if (
            unexpected.length ||
            !same(result.originalGraphTerminals, expectedTerminals) ||
            result.landingRequests.length
          )
            return refused(
              "strict-proposer-changed-unselected-original-request",
              { unexpectedOriginalStationOrdinals: unexpected, attempts },
            );
          return {
            ...result,
            mode: "two-original-boundary-turn-station-requests-v1",
            repeatedTypedIndex: typedIndex,
            attempts,
            replacedOriginalStationOrdinal: i,
            insertedStationOrdinal: i + 1,
            changedStationOrdinals: [i, i + 1],
            allOtherOriginalStationLiteralsUnchanged: true,
            unchangedOriginalStationSupportIds: old.flatMap((s, index) =>
              index === i
                ? []
                : [{ originalStationOrdinal: index, supportId: s.supportId }],
            ),
            originalTerminalApproachesAndIdentityUnchanged: true,
            sourceAuthorityGranted: false,
            routeApproved: false,
          };
        }
      }
    return {
      found: false,
      reason: "no-strict-complete-two-station-turn-request-within-budget",
      attempts,
      sourceAuthorityGranted: false,
      routeApproved: false,
    };
  } catch (error) {
    return {
      found: false,
      reason: "unsupported-original-turn-request-operands",
      detail: error instanceof Error ? error.message : String(error),
      sourceAuthorityGranted: false,
      runtimeIntegrationApproved: false,
      routeApproved: false,
    };
  }
}
