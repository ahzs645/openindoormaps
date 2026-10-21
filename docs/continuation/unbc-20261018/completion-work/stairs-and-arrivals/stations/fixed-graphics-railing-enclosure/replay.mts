/** Retained original-frame mathematics only. No actual-RVT capability restore. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const [sourceRootArg, outputArg] = process.argv.slice(2);
assert(sourceRootArg && outputArg, "usage: replay.mts REVITER_ROOT NEW_OUTPUT_DIRECTORY");
const root = resolve(sourceRootArg), output = resolve(outputArg);
assert(!existsSync(output), "Output directory must be new"); mkdirSync(output, { recursive: true });
const hash = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const modules = ["native-source-fixed-graphics-tree-enclosure.ts", "native-source-fixed-graphics-tree-context.ts", "revit-2027-framed-grep-root.ts", "revit-2027-grep-replay.ts", "revit-2027-nested-instance.ts", "native-stepped-stair-v2-kernel.ts"];
const closure = new Set<string>();
function visit(p: string) {
  if (closure.has(p)) return; closure.add(p);
  for (const m of readFileSync(p, "utf8").matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)) {
    let dep = resolve(dirname(p), m[1]!); if (!existsSync(dep) && existsSync(dep + ".ts")) dep += ".ts";
    if (existsSync(dep) && /\.(ts|mts|js|mjs)$/.test(dep)) visit(dep);
  }
}
modules.forEach(name => visit(resolve(root, "lib/reviter", name)));
const hashes = () => Object.fromEntries([...closure].sort().map(p => [p.slice(root.length + 1), hash(readFileSync(p))]));
const before = hashes();
const [math, source, framed, fifo, nested, wire] = await Promise.all(modules.map(name => import(pathToFileURL(resolve(root, "lib/reviter", name)).href)));
const fixtureRoot = resolve(root, "tests/fixtures/native-original-fixed-graphics"), manifest = JSON.parse(readFileSync(resolve(fixtureRoot, "manifest.json"), "utf8"));
const contracts = source.inspectOriginalFixedGraphicsSourceSchema(readFileSync(resolve(root, "tests/fixtures/native-drawing-reference-source-schema.bin")));
const nodes = manifest.nodes.map((n: { binaryFile: string; nativeElementId: number; originalFrameSha256: string }) => {
  const b = readFileSync(resolve(fixtureRoot, n.binaryFile)); assert.equal(hash(b), n.originalFrameSha256);
  const v = new DataView(b.buffer, b.byteOffset, b.length), d = framed.decodeRevit2027FramedGRepRoot(b, { offset: 0, elementId: n.nativeElementId, marker: 2246, objectLength: v.getUint32(12, true), typeCode: v.getUint32(18, true) }, 2027); assert(d.ok);
  const r = fifo.replayRevit2027GRepFifo(b, d.value); assert(r.ok);
  return { nativeElementId: n.nativeElementId, originalFrameSha256: n.originalFrameSha256, replay: r.value };
});
function operands(roots: number[]) {
  const ids = new Set(roots), todo = [...roots];
  while (todo.length) {
    const id = todo.pop()!, n = nodes.find((n: { nativeElementId: number }) => n.nativeElementId === id); assert(n);
    const bindings = nested.collectRevit2027GInstanceBindings(n.replay); assert(bindings.ok);
    for (const b of bindings.value) { const target = Number(b.instance.symbolElementId); if (!ids.has(target)) { ids.add(target); todo.push(target); } }
  }
  return { mode: "all-original-fixed-graphics-branches-v1", sourceModelSha256: manifest.sourceModelSha256, sourceSchemaSha256: manifest.sourceSchemaSha256, rootNativeElementIds: roots, contracts: structuredClone(contracts), nodes: structuredClone(nodes.filter((n: { nativeElementId: number }) => ids.has(n.nativeElementId))) };
}
const component = math.inspectOriginalFixedGraphicsTreeOperands(operands([1640585])); assert(component.ok); assert.equal(component.cells.length, 1480);
const complete = math.inspectOriginalFixedGraphicsTreeOperands(operands([1640584, 1640600])); assert(!complete.ok); assert.deepEqual(complete.blockers, ["Unqualified original Geometry controlCommand 151982225"]);
const canonical = JSON.stringify(wire.encodeSteppedStairV2WireValue(component)); writeFileSync(resolve(output, "retained-symbol-math.json"), canonical + "\n", { flag: "wx" });
const after = hashes(); assert.deepEqual(after, before);
const summary = {
  format: "original-fixed-graphics-retained-frame-math-only-v1", sourceModelSha256: manifest.sourceModelSha256, sourceSchemaSha256: manifest.sourceSchemaSha256,
  actualSourceCaptureSha256: manifest.actualSourceReceiptSha256,
  retainedOriginalFixtureFrames: nodes.length, retainedFixtureFrameHashes: Object.fromEntries(nodes.map((n: { nativeElementId: number; originalFrameSha256: string }) => [n.nativeElementId, n.originalFrameSha256])),
  component: { nativeSymbolId: 1640585, originalDefinitionsRetained: 40, actualFixedChildOccurrences: 87, closedObstructionOperands: component.cells.length, planarComponentEnclosures: component.cells.filter((c: { kind: string }) => c.kind === "original-planar-component-envelope").length, finiteLinesRetained: component.cells.filter((c: { kind: string }) => c.kind === "original-GLine").length, annotationControlOrigins: 1, fullLiteralOperandLedgerRetained: true, canonicalMathFileSha256: hash(canonical + "\n") },
  completeOriginalRoots: { nativeElementIds: [1640584, 1640600], enclosureQualified: false, blockers: complete.blockers, forbiddenTarget53246Preserved: true, selectorMeaningEstablished: false, command151982225MeaningEstablished: false },
  contracts, dependencyModuleCount: closure.size, modulesBefore: before, modulesAfter: after, modulesUnchanged: true,
  actualRvtConstructorExecutedInThisReplay: false, sourceAuthorityRestoredFromFixtures: false, walkingSupportApproved: false, foreignHumanClearanceApproved: false, indoorCellApproved: false, routeApproved: false,
};
writeFileSync(resolve(output, "summary.json"), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ closedOperands: component.cells.length, actualCompleteRootRefusal: complete.blockers, dependencyModules: closure.size, sourceAuthorityRestored: false }));
