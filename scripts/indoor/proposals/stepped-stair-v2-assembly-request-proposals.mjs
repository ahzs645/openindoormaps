/** Bounded REQUEST generation only. Saved operands/cap mathematics do not grant
 * original-source, physical-body, headroom, runtime or route authority. Every
 * returned request must go through the normal fresh original-source adapter. */
import {
  Rational,
  rational,
  nativeRationalOverlay,
  nativeRationalScalarToIEEE,
} from "../../../../reviter/lib/reviter/native-rational-overlay.ts";
import {
  nativeConservativeTwoFootStation,
  nativeConservativeTwoFootStrip,
  nativeSegmentInExactParts,
  nativeStairStationParallelToSourceDirection,
  inspectOriginalStairTypedRiserSequence,
} from "../../../../reviter/lib/reviter/native-source-stair-stepped-stations.ts";
import { exactClosedSourcePlanarContact } from "../../../../reviter/lib/reviter/native-source-planar-slab-envelope.ts";
import { inspectOriginalFiniteTwoFootRiserCrossing } from "../../../../reviter/lib/reviter/native-source-stair-riser-crossing.ts";

const add = (a, b) => new Rational(a.n * b.d + b.n * a.d, a.d * b.d),
  sub = (a, b) => new Rational(a.n * b.d - b.n * a.d, a.d * b.d),
  mul = (a, b) => new Rational(a.n * b.n, a.d * b.d),
  div = (a, b) => new Rational(a.n * b.d, a.d * b.n),
  abs = (a) => new Rational(a.n < 0n ? -a.n : a.n, a.d);
const cmp = (a, b) =>
  a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const plus = (a, b) => [add(a[0], b[0]), add(a[1], b[1])],
  minus = (a, b) => [sub(a[0], b[0]), sub(a[1], b[1])],
  dot = (a, b) => add(mul(a[0], b[0]), mul(a[1], b[1])),
  cross = (a, b) => sub(mul(a[0], b[1]), mul(a[1], b[0]));
const zero = rational(0),
  one = rational(1),
  negative = rational(-1),
  xy = (p) => p.slice(0, 2),
  key = (p) => p.map((q) => `${q.n}/${q.d}`).join(","),
  same = (a, b) => key(a) === key(b);
const number = (q) => nativeRationalScalarToIEEE(q),
  numbers = (p) => p.map(number),
  rounded = (p) => p.map((q) => rational(number(q)));
const square = (p) => [
  [
    [
      plus(p, [one, one]),
      plus(p, [negative, one]),
      plus(p, [negative, negative]),
      plus(p, [one, negative]),
    ],
  ],
];
const authority = {
  proposalOnly: true,
  sourceAuthorityGranted: false,
  runtimeIntegrationApproved: false,
  routeApproved: false,
};
const refused = (reason, checks) => ({
  found: false,
  reason,
  checks,
  ...authority,
});
const validId = (n) => Number.isSafeInteger(n) && n > 0;

/** Convex *original* components only, never their hull. All generated centers
 * are mere candidates; full-cap/holes/closed-uncertainty checks follow. The
 * half-plane intersections retain closed zero-area feasible center sets. */
function centers(parts, offsets, budget) {
  const result = [];
  for (const part of parts) {
    if (part.length !== 1) continue;
    let ring = part[0];
    if (ring.length > 1 && same(ring[0], ring.at(-1))) ring = ring.slice(0, -1);
    if (ring.length < 3 || ring.length > 64) continue;
    const turns = ring
      .map((a, i) =>
        cross(
          minus(ring[(i + 1) % ring.length], a),
          minus(ring[(i + 2) % ring.length], ring[(i + 1) % ring.length]),
        ),
      )
      .filter((q) => q.n);
    if (!turns.length || !turns.every((q) => q.n > 0n === turns[0].n > 0n))
      continue;
    const sign = rational(turns[0].n > 0n ? 1 : -1),
      h = ring.map((a, i) => {
        const e = minus(ring[(i + 1) % ring.length], a),
          n = [mul(sign, new Rational(-e[1].n, e[1].d)), mul(sign, e[0])],
          c = dot(n, a);
        return {
          n,
          c: offsets
            .map((o) => sub(c, dot(n, o)))
            .reduce((a, b) => (cmp(a, b) > 0 ? a : b)),
        };
      }),
      vertices = [];
    for (let i = 0; i < h.length; i++)
      for (let j = i + 1; j < h.length; j++) {
        budget();
        const a = h[i],
          b = h[j],
          den = cross(a.n, b.n);
        if (!den.n) continue;
        const p = [
          div(sub(mul(a.c, b.n[1]), mul(b.c, a.n[1])), den),
          div(sub(mul(a.n[0], b.c), mul(b.n[0], a.c)), den),
        ];
        if (
          h.every((c) => cmp(dot(c.n, p), c.c) >= 0) &&
          !vertices.some((v) => same(v, p))
        )
          vertices.push(p);
      }
    if (vertices.length) {
      const mean = vertices
        .reduce(plus, [zero, zero])
        .map((q) => div(q, rational(vertices.length)));
      result.push(mean, ...vertices);
    }
  }
  return [...new Map(result.map((p) => [key(p), p])).values()];
}
function fullParts(s, parts) {
  return (
    nativeRationalOverlay("difference", parts, s.innerPartsFeet).length === 0 &&
    !exactClosedSourcePlanarContact(
      parts,
      s.uncertaintyPartsFeet,
      s.closedUncertaintyFeet,
    )
  );
}
function fullLine(s, p, d, intent = []) {
  const line = nativeConservativeTwoFootStation(p, d);
  return (
    nativeSegmentInExactParts(...line, s.innerPartsFeet) &&
    !exactClosedSourcePlanarContact(
      [],
      s.uncertaintyPartsFeet,
      s.closedUncertaintyFeet,
      [line],
    ) &&
    (!intent.length || nativeSegmentInExactParts(...line, intent))
  );
}
function finiteCrossing(line, a, b) {
  return inspectOriginalFiniteTwoFootRiserCrossing(line, a, b)
    .properCrossingForFullTwoFootStrip;
}
function literalGraphTerminals(receipt) {
  return receipt.terminals
    .filter((t) => t.kind !== "source-landing")
    .map((t) => ({
      originalNodeId: t.originalNodeId,
      originalLevelId: t.originalLevelId,
      originalLogicalPointFeet: t.originalLogicalPointFeet.map((q) => [
        q.n.toString(),
        q.d.toString(),
      ]),
      physicalAttachmentPointFeet: t.physicalAttachmentPointFeet.map((q) => [
        q.n.toString(),
        q.d.toString(),
      ]),
      floorSupportId: t.floorSupportId,
      approachXYFeet: t.approachFeet.map((p) => numbers(xy(p))),
    }));
}

/** Lower-level untrusted geometry operands make the finite request predicate
 * directly testable. They cannot replace actual source contexts or membership. */
export function proposeUntrustedFiniteRunRequests({
  nativeStairId,
  nativeRunId,
  originalEdgeId,
  supports,
  receipt,
  treadRelations,
  orderedRisers,
  maxCandidatesPerStation = 6,
  maxTransitionChecks = 20000,
}) {
  let checks = 0;
  const budget = () => {
    if (++checks > maxTransitionChecks) throw Error("request-budget-exhausted");
  };
  try {
    if (
      !validId(nativeStairId) ||
      !validId(nativeRunId) ||
      receipt.nativeStairId !== nativeStairId ||
      receipt.nativeRunId !== nativeRunId ||
      receipt.originalEdgeId !== originalEdgeId ||
      receipt.widthFeet !== 2 ||
      receipt.headroomFeet !== 6 ||
      !Number.isSafeInteger(maxCandidatesPerStation) ||
      maxCandidatesPerStation < 1 ||
      maxCandidatesPerStation > 32 ||
      !Number.isSafeInteger(maxTransitionChecks) ||
      maxTransitionChecks < 1 ||
      maxTransitionChecks > 200000 ||
      !Array.isArray(supports) ||
      supports.length > 10000 ||
      !Array.isArray(receipt.stations) ||
      !receipt.stations.length ||
      receipt.stations.length > 1000 ||
      receipt.terminals.length !== 2
    )
      return refused("invalid-untrusted-run-request", checks);
    const bySupport = new Map(supports.map((s) => [s.id, s]));
    if (bySupport.size !== supports.length)
      return refused("aliased-cap-support-id", checks);
    if (
      !Array.isArray(treadRelations) ||
      !treadRelations.length ||
      !Array.isArray(orderedRisers) ||
      orderedRisers.length !== treadRelations.length + 1 ||
      receipt.stations[0].typedIndex !== 0 ||
      receipt.stations.at(-1).typedIndex !== treadRelations.length - 1 ||
      new Set(receipt.stations.map((s) => s.typedIndex)).size !==
        treadRelations.length
    )
      return refused("incomplete-local-riser-request", checks);
    const stationSupports = receipt.stations.map((s) =>
      bySupport.get(s.supportId),
    );
    if (
      stationSupports.some(
        (s, i) =>
          !s ||
          s.role !== "tread" ||
          s.nativeOwnerId !== nativeRunId ||
          s.typedIndex !== receipt.stations[i].typedIndex ||
          !same([s.elevationFeet], [receipt.stations[i].pointFeet[2]]),
      )
    )
      return refused("foreign-or-stale-tread-operand", checks);
    const terminalOptions = receipt.terminals.map((terminal, side) => {
      const support = bySupport.get(
          terminal.floorSupportId ?? terminal.boundarySupportId,
        ),
        old = terminal.approachFeet.map(xy),
        last = old.at(-1),
        line =
          orderedRisers[side ? orderedRisers.length - 1 : 0]?.originalCurve,
        d = terminal.lateralDirectionFeet;
      if (
        !support ||
        !line ||
        !old.length ||
        !d ||
        !nativeStairStationParallelToSourceDirection(
          terminal,
          line.m_dirVec.slice(0, 2),
        ) ||
        terminal.approachFeet.some(
          (p) => !same([p[2]], [support.elevationFeet]),
        )
      )
        throw Error("foreign-or-stale-terminal-operand");
      if (terminal.kind !== "source-landing") {
        if (
          support.role !== "floor" ||
          !fullLine(support, last, d) ||
          old.slice(0, -1).some((p) => !fullParts(support, square(p))) ||
          old
            .slice(1)
            .some(
              (p, i) =>
                same(p, old[i]) ||
                !fullParts(support, nativeConservativeTwoFootStrip(old[i], p)),
            )
        )
          return [];
        return [{ point: last, path: old, changed: false, terminal, support }];
      }
      if (
        support.role !== "landing" ||
        terminal.nativeLandingId !== support.nativeOwnerId ||
        terminal.nativeDefinitionId !== support.sourceGeometryOwnerElementId ||
        terminal.originalCapFaceToken !== support.physicalFaceToken
      )
        throw Error("foreign-landing-cap-request");
      const vector = line.m_dirVec.slice(0, 2).map(rational),
        origin = line.m_origin.slice(0, 2).map(rational),
        middle = rational((line.m_endParams[0] + line.m_endParams[1]) / 2),
        center = plus(
          origin,
          vector.map((q) => mul(q, middle)),
        ),
        normal = [new Rational(-vector[1].n, vector[1].d), vector[0]],
        scale =
          cmp(abs(normal[0]), abs(normal[1])) > 0
            ? abs(normal[0])
            : abs(normal[1]),
        sign = rational(dot(minus(last, center), normal).n < 0n ? -1 : 1),
        depth = rational(
          treadRelations[side ? treadRelations.length - 1 : 0]
            .originalActualDepthFeet,
        );
      if (depth.n <= 0n || !scale.n)
        throw Error("invalid-original-terminal-depth");
      const endpoints = [last];
      for (const fraction of [
        new Rational(1n, 8n),
        new Rational(1n, 4n),
        new Rational(1n, 2n),
        new Rational(3n, 4n),
      ])
        endpoints.push(
          rounded(
            plus(
              center,
              normal.map((q) =>
                mul(div(q, scale), mul(sign, mul(depth, fraction))),
              ),
            ),
          ),
        );
      const starts = [
          old[0],
          ...centers(
            support.innerPartsFeet,
            [
              [one, one],
              [negative, one],
              [negative, negative],
              [one, negative],
            ],
            budget,
          ).slice(0, 8),
        ].map(rounded),
        options = [];
      for (const endpoint of endpoints) {
        budget();
        if (!fullLine(support, endpoint, d)) continue;
        const dist = cross(minus(endpoint, origin), vector);
        if (
          cmp(mul(dist, dist), mul(mul(depth, depth), dot(vector, vector))) > 0
        )
          continue;
        for (const start of starts) {
          if (!fullParts(support, square(start))) continue;
          const lat = d.map(rational),
            t = div(dot(minus(endpoint, start), lat), dot(lat, lat)),
            corner = rounded(
              plus(
                start,
                lat.map((q) => mul(q, t)),
              ),
            );
          for (const candidate of [
            [start, endpoint],
            [start, corner, endpoint],
          ]) {
            budget();
            const path = candidate.filter(
              (p, i) => !i || !same(p, candidate[i - 1]),
            );
            if (
              path.length > 1 &&
              path.slice(0, -1).every((p) => fullParts(support, square(p))) &&
              path
                .slice(1)
                .every((p, i) =>
                  fullParts(
                    support,
                    nativeConservativeTwoFootStrip(path[i], p),
                  ),
                )
            ) {
              options.push({
                point: endpoint,
                path,
                changed: !same(endpoint, last),
                terminal,
                support,
              });
              break;
            }
          }
          if (options.some((o) => same(o.point, endpoint))) break;
        }
        if (options.length >= 3) break;
      }
      return options;
    });
    if (terminalOptions.some((x) => !x.length))
      return refused("no-full-cap-terminal-approach-request", checks);
    const candidates = receipt.stations.map((station, i) => {
      const support = stationSupports[i],
        relation = treadRelations[station.typedIndex];
      if (!relation) throw Error("missing-named-tread-relation");
      const dirs = [
          station.lateralDirectionFeet,
          relation.originalFiniteStartLine.m_dirVec.slice(0, 2),
          relation.originalFiniteEndLine.m_dirVec.slice(0, 2),
        ],
        result = [];
      const append = (p, d, original) => {
        budget();
        if (
          !d ||
          !dirs
            .slice(1)
            .some((source) =>
              nativeStairStationParallelToSourceDirection(
                { lateralDirectionFeet: d },
                source,
              ),
            )
        )
          return;
        p = rounded(p);
        if (
          fullLine(support, p, d, relation.originalIntentPlanPartsFeet) &&
          !result.some(
            (c) =>
              same(c.point, p) &&
              JSON.stringify(c.direction) === JSON.stringify(d),
          )
        )
          result.push({ point: p, direction: d, original, station, support });
      };
      append(xy(station.pointFeet), dirs[0], true);
      for (const d of dirs.slice(1)) {
        if (result.length >= maxCandidatesPerStation) break;
        for (const p of centers(
          support.innerPartsFeet,
          nativeConservativeTwoFootStation([zero, zero], d),
          budget,
        )) {
          if (result.length >= maxCandidatesPerStation) break;
          append(p, d, false);
        }
      }
      return result;
    });
    if (candidates.some((c) => !c.length))
      return refused("no-supported-station-request-within-budget", checks);
    const firstUnsupported = receipt.stations.findIndex(
      (s, i) =>
        !fullLine(
          stationSupports[i],
          xy(s.pointFeet),
          s.lateralDirectionFeet,
          treadRelations[s.typedIndex].originalIntentPlanPartsFeet,
        ),
    );
    let states = [];
    for (const [startIndex, start] of terminalOptions[0].entries())
      for (const c of candidates[0]) {
        budget();
        if (
          finiteCrossing(orderedRisers[0].originalCurve, start.point, c.point)
        )
          states.push({
            path: [c],
            cost: Number(!c.original) + 10 * Number(start.changed),
            startIndex,
          });
      }
    for (let i = 1; i < candidates.length && states.length; i++) {
      const next = new Map();
      for (const state of states)
        for (const [candidateIndex, c] of candidates[i].entries()) {
          budget();
          const a = state.path.at(-1),
            ai = a.station.typedIndex,
            bi = c.station.typedIndex;
          if (bi !== ai && bi !== ai + 1) continue;
          if (
            bi === ai
              ? !fullParts(
                  c.support,
                  nativeConservativeTwoFootStrip(a.point, c.point),
                )
              : !finiteCrossing(
                  orderedRisers[bi].originalCurve,
                  a.point,
                  c.point,
                )
          )
            continue;
          if (state.path.length >= 2) {
            const previous = state.path.at(-2),
              pi = previous.station.typedIndex;
            if (pi === ai || ai === bi) {
              const u = minus(a.point, previous.point),
                v = minus(c.point, a.point);
              if (
                (cross(u, v).n || dot(u, v).n < 0n) &&
                !fullParts(a.support, square(a.point))
              )
                continue;
            }
          }
          const candidate = {
              ...state,
              path: [...state.path, c],
              cost: state.cost + Number(!c.original),
            },
            id = `${state.startIndex}:${candidates[i - 1].indexOf(a)}:${candidateIndex}`;
          if (!next.has(id) || next.get(id).cost > candidate.cost)
            next.set(id, candidate);
        }
      states = [...next.values()];
    }
    let selected;
    for (const state of states)
      for (const [endIndex, end] of terminalOptions[1].entries()) {
        budget();
        if (
          !finiteCrossing(
            orderedRisers.at(-1).originalCurve,
            state.path.at(-1).point,
            end.point,
          )
        )
          continue;
        const cost = state.cost + 10 * Number(end.changed);
        if (!selected || cost < selected.cost)
          selected = { ...state, endIndex, cost };
      }
    if (!selected)
      return refused(
        "no-complete-finite-transition-request-within-budget",
        checks,
      );
    const terminals = [
      terminalOptions[0][selected.startIndex],
      terminalOptions[1][selected.endIndex],
    ];
    return {
      found: true,
      nativeStairId,
      nativeRunId,
      originalEdgeId,
      stations: selected.path.map((c) => ({
        typedIndex: c.station.typedIndex,
        pointFeet: numbers(c.point),
        lateralDirectionFeet: [...c.direction],
      })),
      landingRequests: terminals
        .filter((t) => t.terminal.kind === "source-landing")
        .map((t) => ({
          nativeLandingId: t.terminal.nativeLandingId,
          nativeDefinitionId: t.terminal.nativeDefinitionId,
          originalCapFaceToken: t.terminal.originalCapFaceToken,
          approachXYFeet: t.path.map(numbers),
          lateralDirectionFeet: [...t.terminal.lateralDirectionFeet],
        })),
      originalGraphTerminals: literalGraphTerminals(receipt),
      physicalPlanes: supports
        .filter((s) => s.role !== "auxiliary")
        .map((s) => ({
          supportId: s.id,
          nativeOwnerId: s.nativeOwnerId,
          sourceGeometryOwnerElementId: s.sourceGeometryOwnerElementId,
          physicalFaceToken: s.physicalFaceToken,
          elevationFeet: [
            s.elevationFeet.n.toString(),
            s.elevationFeet.d.toString(),
          ],
        })),
      firstUnsupportedOriginalTypedIndex:
        firstUnsupported < 0
          ? null
          : receipt.stations[firstUnsupported].typedIndex,
      changedStationOrdinals: selected.path.flatMap((c, i) =>
        c.original ? [] : [i],
      ),
      checks,
      ...authority,
    };
  } catch (error) {
    return refused(
      error instanceof Error ? error.message : String(error),
      checks,
    );
  }
}

/** Convenience wrapper on bounded run/partition/support operands. Physical
 * body arrays are neither iterated nor retained by this helper. */
export function proposeUntrustedAssemblyRunRequests({
  index,
  receipt,
  ...budgets
}) {
  try {
    if (index.sourceModelSha256 !== receipt.sourceModelSha256)
      return refused("foreign-request-model", 0);
    const count = index.supports.filter((s) => s.role === "tread").length,
      sequence = inspectOriginalStairTypedRiserSequence(
        index.run,
        count,
        index.riserPartition,
        index.capBackedTurns,
      );
    if (!sequence.completeNamedSourceRiserSequence)
      return refused(sequence.blockers.join(";"), 0);
    return proposeUntrustedFiniteRunRequests({
      nativeStairId: index.nativeStairId,
      nativeRunId: index.nativeRunId,
      originalEdgeId: receipt.originalEdgeId,
      supports: index.supports,
      receipt,
      treadRelations: sequence.treadRelations,
      orderedRisers: sequence.orderedRisers,
      ...budgets,
    });
  } catch (error) {
    return refused(error instanceof Error ? error.message : String(error), 0);
  }
}
