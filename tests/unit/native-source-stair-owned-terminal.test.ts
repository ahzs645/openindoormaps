import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  nativeSourceStairOwnedTerminal,
  nativeOwnedTerminalInventoryHash,
  nativeOwnedTerminalCarrierHash,
  resolveNativeSourceStairOriginalSupplements,
} from "../../app/indoor-project/native-source-stair-owned-terminal.ts";
import {
  nativeSourceStairOwnedTerminal as sourceOwned,
  resolveNativeSourceStairOriginalSupplements as sourceResolve,
} from "../../../reviter/lib/reviter/native-source-stair-owned-terminal.ts";
import { validateNativeSourceStairWidth } from "../../app/indoor-project/native-source-stair-width.ts";
import { validateNativeSourceStairWidth as sourceWidth } from "../../../reviter/lib/reviter/native-source-stair-width.ts";
import { validNativeSourceStairBody } from "../../app/indoor-project/native-source-stair-body.ts";
import { validNativeSourceStairBody as sourceBody } from "../../../reviter/lib/reviter/native-source-stair-body.ts";
import { nativeStairRiserInventoryHash } from "../../app/indoor-project/native-source-stair-riser-continuity.ts";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        "../fixtures/native-source-stair-owned-terminal-original.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
// Independently reviewed original export values stay outside mutable receipts.
const trustedOwned =
  "8821117eaf63399bd45b7315b93c8ed11be43deba1059509bd72122d8c6c4c6a";
const trustedCarrier =
  "f7b3b8da80bbdd81e2f28eeb4e05f9ed5b92a7991f2ff977ffd74aa1987e8ab9";
const trustedRiser =
  "f6da7dfb8eb906ad4f4be9fb1f1177e27cb4d372fc5c61bdf26f8e1e0ba20814";
const options = (v: any) => ({
  inventory: v.inventory,
  carrier: v.carrier,
  expectedOriginalSourceRiserInventorySha256: trustedRiser,
  ownedTerminal: {
    inventory: v.ownedInventory,
    carrier: v.ownedCarrier,
    expectedOriginalSourceInventorySha256: trustedOwned,
    expectedOriginalSourceCarrierSha256: trustedCarrier,
  },
});
const encode = (v: any): any =>
  v && typeof v.n === "bigint" && typeof v.d === "bigint"
    ? [String(v.n), String(v.d)]
    : Array.isArray(v)
      ? v.map(encode)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]))
        : v;
function rejected(v: any, o: any = options(v)) {
  for (const width of [validateNativeSourceStairWidth, sourceWidth])
    assert.equal(width(v.receipt, v.floors, true, o), false);
  for (const body of [validNativeSourceStairBody, sourceBody])
    assert.equal(body(v.walkingBody, v.receipt, v.floors, true, o), false);
}

test("original finite owned return and named slab give identical exact projections in both mirrors", () => {
  const v = fixture(),
    before = JSON.stringify(v),
    o = options(v);
  assert.equal(
    nativeOwnedTerminalInventoryHash(v.ownedInventory),
    trustedOwned,
  );
  assert.equal(nativeStairRiserInventoryHash(v.inventory), trustedRiser);
  const a = nativeSourceStairOwnedTerminal(
      o.ownedTerminal,
      v.receipt,
      v.floors,
    ),
    b = sourceOwned(o.ownedTerminal, v.receipt, v.floors);
  assert(a);
  assert.deepEqual(encode(a), encode(b));
  assert(
    a.bodyFloorContactWitness.length &&
      a.capParts.length &&
      a.finalParts.length,
  );
  assert.equal(JSON.stringify(v), before);
});

test("common explicit original options support both actual width and complete body guards; fixed probe remains rejected", () => {
  const v = fixture(),
    before = JSON.stringify(v),
    o = options(v);
  for (const width of [validateNativeSourceStairWidth, sourceWidth]) {
    assert.equal(width(v.receipt, v.floors, true), false);
    assert.equal(width(v.receipt, v.floors, true, o), true);
    assert.equal(width(v.receipt, v.floors, false, o), false);
  }
  for (const body of [validNativeSourceStairBody, sourceBody]) {
    assert.equal(body(v.walkingBody, v.receipt, v.floors, true), false);
    assert.equal(body(v.walkingBody, v.receipt, v.floors, true, o), true);
  }
  assert.equal(JSON.stringify(v), before);
});

test("a missing or changed independent export hash cannot authorize self-rehashed inventories", () => {
  const v = fixture();
  for (const key of ["expectedOriginalSourceRiserInventorySha256"] as const) {
    const o: any = options(v);
    delete o[key];
    rejected(v, o);
    o[key] = "0".repeat(64);
    rejected(v, o);
  }
  const o = options(v);
  o.ownedTerminal.expectedOriginalSourceInventorySha256 = "0".repeat(64);
  rejected(v, o);
  const w = fixture();
  w.ownedInventory.symbol.triangles[0].pointsOriginal[0][0] += 0.01;
  w.ownedCarrier.sourceInventorySha256 = nativeOwnedTerminalInventoryHash(
    w.ownedInventory,
  );
  rejected(w);
  const x = fixture();
  x.inventory.originalFrameSha256 = "0".repeat(64);
  x.inventory.geometrySha256 = nativeStairRiserInventoryHash(x.inventory);
  x.carrier.sourceInventorySha256 = x.inventory.geometrySha256;
  rejected(x);
});

test("changed native station, physical floor hole and missing return face remain failures", () => {
  const a = fixture();
  a.receipt.pointsFeet.at(-1)[0] += 0.001;
  rejected(a);
  const b = fixture(),
    cap = b.receipt.terminalCaps[1],
    f = b.floors.find(
      (f: any) => f.nativeElementId === cap.nativeFloorElementId,
    ),
    [x, y] = cap.pointFeet;
  f.partsFeet[0].push([
    [x - 0.005, y - 0.1],
    [x + 0.005, y - 0.1],
    [x + 0.005, y + 0.1],
    [x - 0.005, y + 0.1],
  ]);
  rejected(b);
  const c = fixture();
  c.ownedInventory.symbol.triangles = c.ownedInventory.symbol.triangles.filter(
    (t: any) => t.sourceFaceToken !== 63,
  );
  rejected(c);
});

test("owned source symbol, floor body, original terminal and source model roles cannot be substituted", () => {
  for (const mutate of [
    (v: any) => (v.ownedInventory.symbol.sourceClassName = "ImportSymbol"),
    (v: any) => (v.ownedInventory.floor.closedLiveCurveLoop = false),
    (v: any) => (v.ownedInventory.run.endWithRiser = false),
    (v: any) => (v.ownedInventory.sourceModelSha256 = "0".repeat(64)),
    (v: any) => (v.ownedInventory.floor.topElevationFeet += 0.01),
  ]) {
    const v = fixture();
    mutate(v);
    const o = options(v);
    const h = nativeOwnedTerminalInventoryHash(v.ownedInventory);
    o.ownedTerminal.expectedOriginalSourceInventorySha256 = h;
    o.ownedTerminal.carrier.sourceInventorySha256 = h;
    o.ownedTerminal.expectedOriginalSourceCarrierSha256 =
      nativeOwnedTerminalCarrierHash(o.ownedTerminal.carrier);
    assert.equal(
      nativeSourceStairOwnedTerminal(o.ownedTerminal, v.receipt, v.floors),
      null,
    );
    assert.equal(sourceOwned(o.ownedTerminal, v.receipt, v.floors), null);
  }
});

test("an invented terminal cap depth cannot replace the separately checked source carrier", () => {
  const v = fixture(),
    o = options(v);
  o.ownedTerminal.carrier.upperCapHalfDepth = ["1", "1000000"];
  rejected(v, o);
  const missing: any = options(fixture());
  delete missing.ownedTerminal.expectedOriginalSourceCarrierSha256;
  rejected(fixture(), missing);
});

const originalAuthority = {
  riserInventorySha256:
    "f6da7dfb8eb906ad4f4be9fb1f1177e27cb4d372fc5c61bdf26f8e1e0ba20814",
  ownedInventorySha256:
    "8821117eaf63399bd45b7315b93c8ed11be43deba1059509bd72122d8c6c4c6a",
  sourceSchemaSha256:
    "d961c44726fe7fc32bce4425639481a5d5e91acecec7b7fd897610fc369f046f",
  originalRunFrameSha256:
    "2239c7dc8ed659b0cc5180a901b4340916efed911630beefdb47e3753548823c",
  authoredRoleGeometrySha256:
    "2ef5f39523cc9efc2adab93b35e1c0f36f6563a2e647714d7934e2d9d6c3e2f4",
  sourceModelSha256:
    "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
  ownedCarrierSha256:
    "f7b3b8da80bbdd81e2f28eeb4e05f9ed5b92a7991f2ff977ffd74aa1987e8ab9",
};

const sourcePacket = (v: any) => ({
  sourceModelSha256: v.receipt.sourceModelSha256,
  authoredTreadRoles: v.roles,
  originalRiserInventories: [v.inventory],
  originalOwnedTerminalInventories: [v.ownedInventory],
  sourceFlights: [
    {
      stairElementId: v.receipt.nativeStairId,
      authoredTreadRolesSha256: v.roles.geometrySha256,
    },
  ],
});
const supplementedReceipt = (v: any) => ({
  ...v.receipt,
  riserContinuity: v.carrier,
  ownedTerminal: v.ownedCarrier,
});
test("one independently bound resolver supplies identical operands to both production guards", () => {
  const v = fixture(),
    before = JSON.stringify(v),
    r = supplementedReceipt(v);
  for (const resolve of [
    resolveNativeSourceStairOriginalSupplements,
    sourceResolve,
  ]) {
    const o = resolve(sourcePacket(v), r, v.floors, originalAuthority);
    assert(o);
    assert.equal(validateNativeSourceStairWidth(r, v.floors, true, o), true);
    assert.equal(
      validNativeSourceStairBody(v.walkingBody, r, v.floors, true, o),
      true,
    );
  }
  assert.equal(JSON.stringify(v), before);
});
test("common resolver rejects absent authority, substituted source roles, duplicate inventories and altered carrier depth", () => {
  for (const resolve of [
    resolveNativeSourceStairOriginalSupplements,
    sourceResolve,
  ]) {
    const v = fixture(),
      r = supplementedReceipt(v);
    assert.equal(
      resolve(sourcePacket(v), r, v.floors, undefined as any),
      undefined,
    );
    const source = sourcePacket(v);
    source.originalRiserInventories.push(structuredClone(v.inventory));
    assert.equal(resolve(source, r, v.floors, originalAuthority), undefined);
    const w = fixture();
    w.roles.geometrySha256 = "0".repeat(64);
    assert.equal(
      resolve(
        sourcePacket(w),
        supplementedReceipt(w),
        w.floors,
        originalAuthority,
      ),
      undefined,
    );
    const x = fixture();
    x.ownedCarrier.upperCapHalfDepth = ["1", "1000000"];
    assert.equal(
      resolve(
        sourcePacket(x),
        supplementedReceipt(x),
        x.floors,
        originalAuthority,
      ),
      undefined,
    );
  }
});
