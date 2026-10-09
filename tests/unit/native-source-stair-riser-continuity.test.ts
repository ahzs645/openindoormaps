import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  nativeSourceStairRiserProjections,
  nativeSourceStairRiserPartsForSegment,
  nativeStairRiserInventoryHash,
  type NativeStairRiserInventory,
  type NativeStairRiserContinuity,
} from "../../app/indoor-project/native-source-stair-riser-continuity";
import { nativeSourceStairRiserProjections as sourceProjections } from "../../../reviter/lib/reviter/native-source-stair-riser-continuity";
import { nativeRationalOverlay } from "../../app/indoor-project/native-rational-overlay";
import {
  validateNativeSourceStairWidth,
  type NativeSourceStairReceipt,
} from "../../app/indoor-project/native-source-stair-width";
import { validNativeSourceStairBody } from "../../app/indoor-project/native-source-stair-body";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/native-source-stair-riser-continuity-original.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    inventory: NativeStairRiserInventory;
    carrier: NativeStairRiserContinuity;
    receipt: NativeSourceStairReceipt;
    floors: any[];
    walkingBody: any;
  };
const bind = (v: ReturnType<typeof fixture>) => {
  v.inventory.geometrySha256 = nativeStairRiserInventoryHash(v.inventory);
  v.carrier.sourceInventorySha256 = v.inventory.geometrySha256;
};
const rationalCarrier = (x: any): any =>
  x && typeof x.n === "bigint" && typeof x.d === "bigint"
    ? [x.n.toString(), x.d.toString()]
    : Array.isArray(x)
      ? x.map(rationalCarrier)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.entries(x).map(([k, v]) => [k, rationalCarrier(v)]),
          )
        : x;
const rationalJson = (v: any): string => JSON.stringify(rationalCarrier(v));
const close = (r: number[][]) => [...r, r[0]!];
const strip = (a: number[], b: number[]) => {
  const dx = b[0]! - a[0]!,
    dy = b[1]! - a[1]!,
    d = Math.hypot(dx, dy),
    nx = -dy / d,
    ny = dx / d;
  return [
    [
      [a[0]! + nx, a[1]! + ny],
      [b[0]! + nx, b[1]! + ny],
      [b[0]! - nx, b[1]! - ny],
      [a[0]! - nx, a[1]! - ny],
      [a[0]! + nx, a[1]! + ny],
    ],
  ] as [number, number][][];
};

test("original paired native controls repair twelve internal exact projected transitions without changing source profiles/stations", () => {
  const v = fixture(),
    before = JSON.stringify(v.receipt),
    ps = nativeSourceStairRiserProjections(v.inventory, v.carrier, v.receipt)!;
  assert.equal(ps.length, 12);
  let positiveOriginalResiduals = 0;
  for (let i = 1; i < 13; i++) {
    const a = v.receipt.pointsFeet[i]!,
      b = v.receipt.pointsFeet[i + 1]!,
      surfaces = v.receipt.treads
        .filter(
          (t) =>
            t.elevationFeet >= a[2] - 0.05 && t.elevationFeet <= b[2] + 0.05,
        )
        .map((t) => [close(t.ringFeet)] as [number, number][][]),
      raw = nativeRationalOverlay("union", surfaces);
    if (nativeRationalOverlay("difference", [strip(a, b)], raw).length)
      positiveOriginalResiduals++;
    const support = nativeRationalOverlay(
      "union",
      raw,
      nativeSourceStairRiserPartsForSegment(ps, a, b),
    );
    assert.equal(
      nativeRationalOverlay("difference", [strip(a, b)], support).length,
      0,
    );
  }
  assert.equal(positiveOriginalResiduals, 8);
  assert.equal(JSON.stringify(v.receipt), before);
  assert.equal(
    rationalJson(ps),
    rationalJson(sourceProjections(v.inventory, v.carrier, v.receipt)),
  );
});

test("source control mismatch and real different-riser gap cannot manufacture continuity even with recomputed metadata hashes", () => {
  for (const field of ["endLine", "endRiserCurve"] as const) {
    const v = fixture();
    v.inventory.seams[1]![field].origin[1] += 0.01;
    bind(v);
    assert.equal(
      nativeSourceStairRiserProjections(v.inventory, v.carrier, v.receipt),
      undefined,
    );
  }
});

test("unchanged raw tread/station bytes, source model/run/declaration and finite class roles are mandatory", () => {
  const mutations = [
    (v: ReturnType<typeof fixture>) => {
      v.receipt.treads[2]!.ringFeet[0]![1] += 0.01;
    },
    (v: ReturnType<typeof fixture>) => {
      v.receipt.pointsFeet[2]![0] += 0.01;
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.sourceModelSha256 = "a".repeat(64);
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.nativeRunId++;
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.completeOriginalFifoByteReplay = false as true;
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.seams[0]!.endLine.sourceClassName = "GArc" as "GLine";
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.treads[0]!.sourceFaceClassName = "ReferencePlane" as "Face";
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.sourceDeclaration.sourceDeclaredPath =
        "StairsRun.otherGeometry" as "StairsRun.m_oGeom4TreadFaces";
    },
  ];
  for (const mutate of mutations) {
    const v = fixture();
    mutate(v);
    bind(v);
    assert.equal(
      nativeSourceStairRiserProjections(v.inventory, v.carrier, v.receipt),
      undefined,
    );
  }
});

test("wrong native boundary, nonadjacent trim indices and forged stationary height fail", () => {
  const mutations = [
    (v: ReturnType<typeof fixture>) => {
      v.inventory.seams[0]!.lowerBoundaryIndices = [0, 1];
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.seams[0]!.lowerBoundaryIndices = [0, 2];
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.seams[0]!.upperTreadIndex += 1;
    },
    (v: ReturnType<typeof fixture>) => {
      v.inventory.treads[0]!.sourceOriginFeet[2] += 0.1;
    },
  ];
  for (const mutate of mutations) {
    const v = fixture();
    mutate(v);
    bind(v);
    assert.equal(
      nativeSourceStairRiserProjections(v.inventory, v.carrier, v.receipt),
      undefined,
    );
  }
});

test("positive foreign intersection is retained even for a sub-IEEE-thickness riser projection", () => {
  const v = fixture(),
    ps = nativeSourceStairRiserProjections(v.inventory, v.carrier, v.receipt)!,
    p = ps.find((p) => p.parts.length)!;
  assert(nativeRationalOverlay("intersection", p.parts, p.parts).length > 0);
  assert.equal(
    nativeSourceStairRiserPartsForSegment(ps, [0, 0, 0], [0, 0, 100]).length,
    0,
  );
  assert.equal(
    nativeSourceStairRiserPartsForSegment(
      ps,
      [0, 0, p.sourceHeightBand[0]],
      [0, 0, p.sourceHeightBand[1] + 0.001],
    ).length,
    0,
  );
});

test("internal semantic continuity alone does not approve the current width/body validator or unresolved terminal/enclosure", () => {
  const v = fixture();
  assert.equal(
    validateNativeSourceStairWidth(v.receipt, v.floors, true),
    false,
  );
  assert.equal(
    validNativeSourceStairBody(v.walkingBody, v.receipt, v.floors, true),
    false,
  );
});
