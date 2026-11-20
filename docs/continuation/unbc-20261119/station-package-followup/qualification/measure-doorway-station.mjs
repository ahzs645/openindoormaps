import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Run from the OpenIndoorMaps repository root with node --import tsx.
const inspectorPath = path.resolve("app/indoor-project/corridor-chain-fit.ts");
const { corridorChainTopologyContacts } = await import(pathToFileURL(inspectorPath).href);

const read = (relative) => {
  const url = new URL(relative, import.meta.url);
  const bytes = fs.readFileSync(url);
  return {
    path: relative,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    data: JSON.parse(bytes.toString("utf8")),
  };
};
const control = read("cell-918-control/prepared-routing.json");
const candidate = read("cell-918-retained/prepared-routing.json");
const controlReport = read("cell-918-control/report.json");
const candidateReport = read("cell-918-retained/report.json");
const checkpoint = (directory) => {
  const names = fs.readdirSync(new URL(directory + "/cells/", import.meta.url));
  assert.equal(names.length, 1);
  return read(directory + "/cells/" + names[0]);
};
const controlCell = checkpoint("cell-918-control");
const candidateCell = checkpoint("cell-918-retained");
assert.deepEqual(controlCell.data.scope, candidateCell.data.scope);
for (const key of [
  "inputZipSha256", "inputJsonSha256", "sourceModelSha256", "sourceGeometryKey",
  "compilerBinding", "resolverVersion",
]) assert.equal(controlReport.data.binding[key], candidateReport.data.binding[key]);
assert.equal(controlReport.data.binding.parameters.compiler.straightRuns, false);
assert.equal(candidateReport.data.binding.parameters.compiler.straightRuns, true);
assert.deepEqual(
  { ...controlReport.data.binding.parameters.compiler, straightRuns: false },
  { ...candidateReport.data.binding.parameters.compiler, straightRuns: false },
);
const before = new Map(control.data.guides.map((guide) => [guide.edgeId, guide]));
const after = new Map(candidate.data.guides.map((guide) => [guide.edgeId, guide]));
assert.equal(before.size, control.data.guides.length);
assert.equal(after.size, candidate.data.guides.length);
assert.deepEqual([...before.keys()].sort(), [...after.keys()].sort());
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const length = (points) => points.slice(1).reduce(
  (sum, p, i) => sum + Math.hypot(...p.map((n, axis) => n - points[i][axis])), 0,
);
const turns = (points) => {
  const unique = points.filter((p, i) => i === 0 || !equal(p, points[i - 1]));
  return unique.slice(2).map((c, i) => {
    const a = unique[i], b = unique[i + 1];
    const u = [b[0] - a[0], b[1] - a[1]];
    const v = [c[0] - b[0], c[1] - b[1]];
    return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI;
  });
};
const metrics = (guides) => {
  const paths = guides.map((guide) => guide.pointsFeet.slice(guide.hallwayJoins[0], guide.hallwayJoins[1] + 1));
  const angles = paths.flatMap(turns);
  return {
    vertices: paths.reduce((sum, p) => sum + p.length, 0),
    guidePathLengthFeet: paths.reduce((sum, p) => sum + length(p), 0),
    bendsOver5Degrees: angles.filter((value) => value > 5).length,
    turnbacksAtLeast145Degrees: angles.filter((value) => value >= 145).length,
    maximumTurnDegrees: Math.max(0, ...angles),
  };
};
const changed = [];
for (const [id, old] of before) {
  const next = after.get(id);
  assert.deepEqual(old.pointsFeet[0], next.pointsFeet[0]);
  assert.deepEqual(old.pointsFeet.at(-1), next.pointsFeet.at(-1));
  if (!equal(old, next)) changed.push({ edgeId: id, before: old, after: next });
}
const cell = candidateReport.data.cells[0];
assert.equal(cell.straightRunsWithdrawn, false);
assert.deepEqual(cell.straightRunsComparison.missingGuideIds, []);
assert.equal(cell.straightRunsComparison.newContactCount, 0);
const junctions = (cell.recoveredDoorwayJunctions ?? []).map((receipt) => {
  const terminal = receipt.terminalId;
  const originalPoint = receipt.approachFeet[0];
  const nodePoints = new Map([[terminal, originalPoint]]);
  const sourceIds = (id) => {
    const prefix = cell.cellId + ":walk:";
    assert.ok(id.startsWith(prefix));
    const ids = id.slice(prefix.length).split("|");
    assert.equal(ids.length, 2);
    return ids;
  };
  const branch = (guide) => {
    if (equal(guide.pointsFeet[0], originalPoint))
      return guide.pointsFeet.slice(0, guide.hallwayJoins[0] + 1);
    assert.deepEqual(guide.pointsFeet.at(-1), originalPoint);
    return guide.pointsFeet.slice(guide.hallwayJoins[1]).toReversed();
  };
  for (const id of receipt.incidentGuideIds) {
    const guide = after.get(id);
    const ids = sourceIds(id);
    assert.ok(ids.includes(terminal));
    const other = ids.find((id) => id !== terminal);
    const point = equal(guide.pointsFeet[0], originalPoint)
      ? guide.pointsFeet.at(-1) : guide.pointsFeet[0];
    if (nodePoints.has(other)) assert.deepEqual(nodePoints.get(other), point);
    nodePoints.set(other, point);
    assert.deepEqual(branch(guide), receipt.approachFeet);
  }
  const memberIds = [...new Set([...receipt.incidentGuideIds, ...receipt.throughGuideIds])].sort((a, b) => a.localeCompare(b));
  const edgeIdentity = new Map(memberIds.map((id) => {
    const guide = after.get(id);
    const ids = sourceIds(id);
    const from = ids.find((id) => equal(nodePoints.get(id), guide.pointsFeet[0]));
    const to = ids.find((id) => equal(nodePoints.get(id), guide.pointsFeet.at(-1)));
    assert.ok(from && to && from !== to);
    return [id, { from, to }];
  }));
  const contacts = (map) => corridorChainTopologyContacts(memberIds.map((id) => ({
    id,
    ...edgeIdentity.get(id),
    points: map.get(id).pointsFeet.map(([x, y]) => [x, y]),
  }))).map(({ pair, at }) => ({ edgeIds: pair.map((index) => memberIds[index]), at }));
  const oldContacts = new Set(contacts(before).map((contact) => JSON.stringify(contact)));
  const newRawContacts = contacts(after).filter((contact) => !oldContacts.has(JSON.stringify(contact)));
  const stations = (map) => [...new Map(receipt.incidentGuideIds.map((id) => {
    const point = branch(map.get(id)).at(-1);
    return [JSON.stringify(point), point];
  })).values()];
  const oldStations = stations(before), newStations = stations(after);
  assert.equal(oldStations.length, 2);
  assert.equal(newStations.length, 1);
  assert.deepEqual(newStations[0], receipt.pointFeet);
  const separation = length(oldStations);
  return {
    receipt,
    originalDoorPointUnchanged: true,
    sourceIdentityMethod: "Original IDs from declared source walk edge IDs; orientation anchored by the compiler receipt's original doorway point and exact endpoint agreement. No historical source context is used.",
    controlStations: oldStations,
    candidateStations: newStations,
    stationCount: { control: oldStations.length, candidate: newStations.length },
    stationSeparationFeet: { control: separation, candidate: 0 },
    stationSeparationMetres: { control: separation * 0.3048, candidate: 0 },
    candidateSharedApproachFeet: receipt.approachFeet,
    candidateSharedApproachLengthMetres: length(receipt.approachFeet) * 0.3048,
    changedMemberGuideIds: memberIds.filter((id) => !equal(before.get(id), after.get(id))),
    throughGuideGeometryUnchanged: receipt.throughGuideIds.every((id) => equal(before.get(id), after.get(id))),
    newRawContactCountWithinReceiptMembers: newRawContacts.length,
    newRawContactsWithinReceiptMembers: newRawContacts,
    note: "These exact station/shared-approach contacts are legitimate compiler-replayed junction contacts. They are distinct from the production guard's zero unapproved contacts. This analysis does not recreate live receipt authority or run a journey.",
  };
});
const output = {
  status: "fresh full-source compiler geometry comparison only",
  analysisScriptSha256: createHash("sha256").update(fs.readFileSync(new URL(import.meta.url))).digest("hex"),
  contactInspectorSha256: createHash("sha256").update(fs.readFileSync(inspectorPath)).digest("hex"),
  navigationAuthority: false,
  actualWorkerOrBrowserReplayPerformed: false,
  inputFiles: [control, candidate, controlReport, candidateReport, controlCell, candidateCell].map(({ path, sha256 }) => ({ path, sha256 })),
  compilerBinding: candidateReport.data.binding.compilerBinding,
  sourceBinding: {
    inputZipSha256: candidateReport.data.binding.inputZipSha256,
    inputJsonSha256: candidateReport.data.binding.inputJsonSha256,
    sourceModelSha256: candidateReport.data.binding.sourceModelSha256,
    sourceGeometryKey: candidateReport.data.binding.sourceGeometryKey,
  },
  inventory: {
    sameSourceScope: true,
    scopeSha256: candidateCell.data.scope.scopeSha256,
    originalEligibleEdges: candidateCell.data.scope.edgeIds.length,
    originalTerminalIds: candidateCell.data.scope.terminalIds.length,
    controlGuides: before.size,
    candidateGuides: after.size,
    sameGuideIds: true,
    changedGuideCount: changed.length,
    unchangedOriginalGuideEndpoints: true,
    controlRefusedEdges: controlReport.data.cells[0].refusedEdges,
    candidateRefusedEdges: cell.refusedEdges,
  },
  coreGeometry: { control: metrics(control.data.guides), candidate: metrics(candidate.data.guides) },
  reportedProductionChecks: {
    sourceGraphAndGeometryUnchanged: candidateReport.data.sourceGraphAndGeometryUnchanged,
    straightRunsWithdrawn: cell.straightRunsWithdrawn,
    missingGuideIds: cell.straightRunsComparison.missingGuideIds,
    unapprovedContactCount: cell.straightRunsComparison.newContactCount,
    fullPackageImportPerformed: candidateReport.data.fullPackageImportPerformed,
    actualNavigationAcceptancePerformed: candidateReport.data.actualNavigationAcceptancePerformed,
  },
  junctions,
  changedGuides: changed,
};
fs.writeFileSync(new URL("doorway-station-geometry-comparison.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ inventory: { ...output.inventory, controlRefusedEdges: output.inventory.controlRefusedEdges.length, candidateRefusedEdges: output.inventory.candidateRefusedEdges.length }, coreGeometry: output.coreGeometry, junctions: junctions.map((j) => ({ terminalId: j.receipt.terminalId, stationCount: j.stationCount, stationSeparationMetres: j.stationSeparationMetres, changedMemberGuideIds: j.changedMemberGuideIds, newRawContactCountWithinReceiptMembers: j.newRawContactCountWithinReceiptMembers })), checks: output.reportedProductionChecks }, null, 2));
