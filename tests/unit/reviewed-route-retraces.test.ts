import assert from "node:assert/strict";
import test from "node:test";
import proof from "../../app/indoor-project/reviewed-route-retraces.json";
import { trimReviewedRouteRetraces } from "../../app/indoor-project/reviewed-route-retraces";
import {
  corridorGuideLength,
  type SharedGuidePoint as Point,
} from "../../app/indoor-project/shared-corridor-guides";
import type { PathwayArc } from "../../app/indoor-project/shared-pathway-routing";

const scale = 0.3048;
function fixture(which: number) {
  const pattern = proof.patterns[which];
  return pattern.segments.map((seg, i) => {
    const p = structuredClone(seg.before) as Point[];
    return {
      from: String(i),
      to: String(i + 1),
      sourceFrom: "source-" + i,
      sourceTo: "source-" + (i + 1),
      points: p,
      metres: corridorGuideLength(p) * scale,
      link: {
        edge: {
          id: seg.edgeId ?? "walk-" + i,
          kind: "kind" in seg ? seg.kind : "walk",
          nativeCellId: seg.cell,
        },
        passages: [],
        blockers: [],
        requiredRooms: [],
      },
    } as unknown as PathwayArc;
  });
}
function reverse(arcs: PathwayArc[]) {
  const ordered = arcs.toReversed();
  return ordered.map((arc) => ({
    ...arc,
    from: arc.to,
    to: arc.from,
    points: arc.points.toReversed(),
  }));
}
for (const [i, p] of proof.patterns.entries()) {
  test(
    p.review + " preserves both directions and every source dependency",
    () => {
      const src = fixture(i),
        before = structuredClone(src);
      const expected = p.segments.map((s) => s.after);
      const walked = trimReviewedRouteRetraces(src, scale, () => true);
      const back = trimReviewedRouteRetraces(reverse(src), scale, () => true);
      assert.deepEqual(
        walked.arcs.map((a) => a.points),
        expected,
      );
      assert.deepEqual(
        reverse(back.arcs).map((a) => a.points),
        expected,
      );
      assert(walked.removedMetres > 0);
      assert(Math.abs(walked.removedMetres - back.removedMetres) < 1e-9);
      for (const [j, arc] of walked.arcs.entries()) {
        assert.strictEqual(arc.link, src[j].link);
        assert.equal(arc.metres, corridorGuideLength(arc.points) * scale);
      }
      assert.deepEqual(walked.arcs[0].points[0], src[0].points[0]);
      assert.deepEqual(
        walked.arcs.at(-1)!.points.at(-1),
        src.at(-1)!.points.at(-1),
      );
      assert.deepEqual(src, before);
    },
  );
}
test("missing witness, lost permission, changed geometry or construction blocks a trim", () => {
  const a = fixture(0);
  for (const denied of [
    a.slice(1),
    a.slice(0, -1),
    [a[0], { ...a[1], from: "different" }, a[2]],
    [
      a[0],
      { ...a[1], link: { ...a[1].link, requiredRooms: ["restricted"] } },
      a[2],
    ],
    [a[0], a[1], { ...a[2], points: a[2].points.toReversed() }],
  ]) {
    assert.equal(
      trimReviewedRouteRetraces(denied, scale, () => true).removedMetres,
      0,
    );
  }
  assert.equal(
    trimReviewedRouteRetraces(a, scale, () => false).removedMetres,
    0,
  );
});
test("returning past the 10-3066 station as an intermediate point retains its path", () => {
  const a = fixture(1);
  const prefix = {
    ...a[0],
    from: "outside",
    to: a[0].from,
    points: [a[0].points[0]],
  };
  assert.equal(
    trimReviewedRouteRetraces([prefix, ...a], scale, () => true).removedMetres,
    0,
  );
});

test("only the two explicitly measured horizontal openings can be trimmed", () => {
  const accepted = proof.patterns
    .map((p, i) => ({ p, i }))
    .filter(({ p }) =>
      p.segments.some((s) => "kind" in s && s.kind === "opening"),
    );
  assert.equal(accepted.length, 2);
  for (const { p, i } of accepted) {
    const parts = fixture(i),
      ix = p.segments.findIndex((s) => "kind" in s && s.kind === "opening");
    const old = parts[ix];
    for (const edge of [
      { ...old.link.edge, id: old.link.edge.id + "-other" },
      { ...old.link.edge, kind: "stairs" as const },
    ]) {
      const unexpected = parts.slice();
      unexpected[ix] = { ...old, link: { ...old.link, edge } };
      assert.equal(
        trimReviewedRouteRetraces(unexpected, scale, () => true).removedMetres,
        0,
      );
    }
    const differentPlane = parts.slice();
    differentPlane[ix] = {
      ...old,
      points: old.points.map((q, j) => (j === 0 ? [q[0], q[1], q[2] + 1] : q)),
    };
    assert.equal(
      trimReviewedRouteRetraces(differentPlane, scale, () => true)
        .removedMetres,
      0,
    );
  }
});
