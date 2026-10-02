import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readIndoorProject,
  exportCampusViewer,
} from "../../app/indoor-project/package";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import { projectConnectorMarkers } from "../../app/indoor-project/connector-markers";
import {
  validateIndoorDataset,
  findProjectRoute,
} from "../../app/indoor-project/routing";
import { sourceStairAnchor } from "../../app/indoor-project/source-stairs";
const input = process.env.INDOOR_ALL_STAIRS_ZIP;
const project = input
  ? await readIndoorProject(new Uint8Array(readFileSync(input)))
  : undefined;
const levels = [1_450_417, 311, 1_487_816];
test(
  "all 82 source assemblies are bound once, including the pin staircase and recovered BRep steps",
  { skip: !project },
  () => {
    const d = project!.dataset,
      stairs = d.stairDisplay!.sourceFlights!;
    const native = JSON.parse(
      readFileSync(
        "/Users/ahmadjalil/github/reviter/work/unbc-folder-preview/navigation-model.json",
        "utf8",
      ),
    );
    assert.deepEqual(
      stairs.map((s) => s.stairElementId).sort((a, b) => a - b),
      native.nativeStairAssemblies
        .map((s: { stairElementId: number }) => s.stairElementId)
        .sort((a: number, b: number) => a - b),
    );
    assert.equal(stairs.length, 82);
    assert.equal(new Set(stairs.map((s) => s.stairElementId)).size, 82);
    const pin = stairs.find((s) => s.stairElementId === 1_588_220)!;
    assert.deepEqual(pin.levelIds, [311, 1_487_816]);
    assert.equal(pin.treads.length, 12);
    const anchor = sourceStairAnchor(d, pin, levels);
    assert(Math.hypot(anchor[0] + 70.8224, anchor[1] - 320.5768) < 4);
    assert.equal(
      stairs.find((s) => s.stairElementId === 1_430_244)!.treads.length,
      7,
    );
    const bad = structuredClone(d);
    bad.stairDisplay!.sourceFlights!.push(stairs[0]);
    assert.throws(() => validateIndoorDataset(bad), /source stair geometry/);
  },
);
test(
  "each assembly renders on its actual native levels, with one physical copy and finite solid risers",
  { skip: !project },
  () => {
    const d = project!.dataset;
    for (const floor of d.floors) {
      const features = projectStairDisplay(
        d,
        floor.levelIds,
        "all",
        true,
      ).features;
      const seen = new Set<string>();
      for (const f of features) {
        const p = f.properties!;
        assert(
          Number.isFinite(p.topMetres) && Number.isFinite(p.displayBaseMetres),
        );
        assert(p.topMetres > p.displayBaseMetres);
        const key = JSON.stringify([
          p.stairElementId,
          p.runElementId,
          p.elevationFeet,
          f.geometry.coordinates,
        ]);
        assert(!seen.has(key), key);
        seen.add(key);
      }
      for (const stair of d.stairDisplay!.sourceFlights!.filter((s) =>
        s.levelIds.some((id) => floor.levelIds.includes(id)),
      ))
        assert(
          features.some(
            (f) => f.properties?.stairElementId === stair.stairElementId,
          ),
          `Missing ${stair.stairElementId} on ${floor.name}`,
        );
    }
  },
);
test(
  "every visible source stair has one inspector marker, while old flat maps retain their original binding rules",
  { skip: !project },
  () => {
    const d = project!.dataset;
    for (const floor of d.floors) {
      const markers = projectConnectorMarkers(
        d,
        floor.levelIds,
        "all",
        undefined,
        true,
      ).features;
      for (const stair of d.stairDisplay!.sourceFlights!.filter((s) =>
        s.levelIds.some((id) => floor.levelIds.includes(id)),
      ))
        assert.equal(
          markers.filter(
            (m) => m.properties?.stairElementId === stair.stairElementId,
          ).length,
          1,
        );
    }
    assert(
      !projectConnectorMarkers(d, levels, "all").features.some(
        (f) => f.properties?.stairElementId === 1_588_220,
      ),
    );
  },
);
test(
  "source inventory preserves every route, ramp, review and pin without admitting stairs to the wheelchair path",
  { skip: !project },
  async () => {
    const before = await readIndoorProject(
        new Uint8Array(
          readFileSync(
            "/Users/ahmadjalil/Downloads/UNBC.indoor.before-all-stairs.reviter.zip",
          ),
        ),
      ),
      d = project!.dataset;
    for (const key of [
      "records",
      "nodes",
      "edges",
      "doors",
      "walls",
      "floors",
      "rampDisplay",
    ] as const)
      assert.deepEqual(d[key], before.dataset[key]);
    assert.deepEqual(project!.rooms, before.rooms);
    const route = findProjectRoute(
      d,
      "rm-311-86e02816d8fe",
      "landing:local:07:311:08:1487816:1620957:1",
      "accessible",
    );
    assert(route);
    assert(
      !route.edges.some((e) => ["stairs", "local-steps"].includes(e.kind)),
    );
    assert(route.edges.some((e) => e.kind === "ramp"));
    const viewer = await readIndoorProject(await exportCampusViewer(project!));
    assert.deepEqual(viewer.dataset.stairDisplay, d.stairDisplay);
  },
);
