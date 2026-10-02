/** Add native run endpoints and user-reviewed outdoor/seating context without changing routes or source treads.
 * node --import tsx scripts/indoor/prepare-unbc-stair-contacts.ts input.zip native-cache.json output.zip */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  readIndoorProject,
  exportIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { validateIndoorDataset } from "../../app/indoor-project/routing";
const [input, cache, output, inventoryZip] = process.argv.slice(2);
assert(input && cache && output && input !== output);
const project = await readIndoorProject(new Uint8Array(await readFile(input))),
  d = project.dataset;
assert.equal(
  d.source.modelSha256,
  "8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178",
);
const original = structuredClone(d),
  rooms = structuredClone(project.rooms);
if (inventoryZip) {
  const inventoryProject = await readIndoorProject(
    new Uint8Array(await readFile(inventoryZip)),
  );
  const inventory = inventoryProject.dataset;
  assert.equal(inventory.source.modelSha256, d.source.modelSha256);
  assert(d.stairDisplay);
  d.stairDisplay.sourceFlights ??= structuredClone(
    inventory.stairDisplay!.sourceFlights!,
  );
  if (d.rampDisplay && inventory.rampDisplay) {
    for (const ramp of d.rampDisplay.ramps) {
      const source = inventory.rampDisplay.ramps.find(
        (r) => r.nativeElementId === ramp.nativeElementId,
      );
      if (!source) continue;
      ramp.bodyTrianglesFeet ??= structuredClone(source.bodyTrianglesFeet);
      ramp.platforms ??= structuredClone(source.platforms);
    }
    d.rampDisplay.ramps.push(
      ...structuredClone(
        inventory.rampDisplay.ramps.filter(
          (r) =>
            !d.rampDisplay!.ramps.some(
              (s) => s.nativeElementId === r.nativeElementId,
            ),
        ),
      ),
    );
  }
}
const sourceTreads = structuredClone(d.stairDisplay!.sourceFlights!);
type NativeRun = {
  elementId: number;
  stairTreads?: number[][][];
  boundsFeet?: { min: { z: number }; max: { z: number } };
  stairTreadThicknessFeet?: number;
  stairBeginWithRiser?: boolean;
  stairEndWithRiser?: boolean;
};
const model: { elementBounds: NativeRun[] } = JSON.parse(
  await readFile(cache, "utf8"),
);
const native = new Map(model.elementBounds.map((r) => [r.elementId, r]));
for (const s of d.stairDisplay!.sourceFlights!) {
  s.runs = [...new Set(s.treads.map((t) => t.runElementId))].flatMap((id) => {
    const r = native.get(id);
    if (!r?.stairTreads?.length || !r.boundsFeet) return [];
    const zs = s.treads
        .filter((t) => t.runElementId === id)
        .map((t) => t.elevationFeet),
      thickness = r.stairTreadThicknessFeet ?? 0;
    // Bounds hold the underside of the upper landing, not its finished top.
    const top = Math.max(Math.max(...zs), r.boundsFeet.max.z + thickness);
    if (top <= r.boundsFeet.min.z) return [];
    return [
      {
        runElementId: id,
        bottomElevationFeet: r.boundsFeet.min.z,
        topElevationFeet: top,
        beginWithRiser: r.stairBeginWithRiser === true,
        endWithRiser: r.stairEndWithRiser === true,
      },
    ];
  });
  // User identified these physical assemblies in the source, 2026-10-02.
  if ([1_842_431, 1_460_777].includes(s.stairElementId)) s.context = "outdoor";
  if ([1_801_478, 1_779_473].includes(s.stairElementId))
    s.context = "tiered-seating";
}
validateIndoorDataset(d);
for (const key of Object.keys(original).filter(
  (k) => k !== "stairDisplay" && !(inventoryZip && k === "rampDisplay"),
))
  assert.deepEqual(d[key], original[key]);
assert.deepEqual(project.rooms, rooms);
if (inventoryZip && original.rampDisplay) {
  for (const ramp of original.rampDisplay.ramps) {
    const current = d.rampDisplay!.ramps.find(
      (r) => r.nativeElementId === ramp.nativeElementId,
    )!;
    const expected = structuredClone(ramp);
    expected.bodyTrianglesFeet ??= current.bodyTrianglesFeet;
    expected.platforms ??= current.platforms;
    assert.deepEqual(current, expected);
  }
  for (const ramp of d.rampDisplay!.ramps.filter(
    (r) =>
      !original.rampDisplay!.ramps.some(
        (s) => s.nativeElementId === r.nativeElementId,
      ),
  ))
    assert.equal(ramp.displayOnly, true);
}
assert.deepEqual(d.stairDisplay!.flights, original.stairDisplay!.flights);
for (const s of d.stairDisplay!.sourceFlights!)
  assert.deepEqual(
    s.treads,
    sourceTreads.find((x) => x.stairElementId === s.stairElementId)!.treads,
  );
await writeFile(output, await exportIndoorProject(project));
await writeFile(
  output.replace(/\.zip$/, ".viewer.zip"),
  await exportCampusViewer(project),
);
console.log(
  JSON.stringify(
    {
      output,
      assemblies: d.stairDisplay!.sourceFlights!.length,
      runs: d.stairDisplay!.sourceFlights!.reduce(
        (n, s) => n + s.runs!.length,
        0,
      ),
      contexts: d
        .stairDisplay!.sourceFlights!.filter((s) => s.context)
        .map((s) => ({ id: s.stairElementId, context: s.context })),
      graphAndReviewsPreserved: true,
    },
    null,
    2,
  ),
);
