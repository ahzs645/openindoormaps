import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readIndoorProject } from "../../app/indoor-project/package";
import { projectStairDisplay } from "../../app/indoor-project/stair-display";
import {
  sourceStairAreaKeys,
  sourceStairKind,
} from "../../app/indoor-project/source-stairs";
import { floorHeightDatum } from "../../app/indoor-project/relative-heights";
import {
  findProjectRoute,
  validateIndoorDataset,
} from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_STAIR_CONTACTS_ZIP;
const p = zip
  ? await readIndoorProject(new Uint8Array(readFileSync(zip)))
  : undefined;
const levels = [1_450_417, 311, 1_487_816];
test(
  "physical flights suppress duplicate stair room blocks while source landing polygons remain intact",
  { skip: !p },
  () => {
    const d = p!.dataset;
    const fs = projectStairDisplay(d, levels, "all", true).features;
    const keys = sourceStairAreaKeys(
      d,
      fs.map((f) => f.properties!.stairElementId),
      levels,
    );
    assert(keys.includes("rm-311-b7fa83011b32"));
    assert(keys.includes("rm-1487816-004a60afc0d8"));
    assert.equal(d.records.find((r) => r.key === keys[0])!.stair, true);
    assert(sourceStairAreaKeys(d, [], levels).length === 0);
  },
);
test(
  "terminal risers join source run endpoints without shifting treads or extruding every step to ground",
  { skip: !p },
  () => {
    const d = p!.dataset,
      datum = floorHeightDatum(d, levels),
      scale = d.alignment.verticalMetresPerFoot;
    const fs = projectStairDisplay(d, levels, "all", true).features;
    for (const id of [1_588_220, 1_620_957, 2_140_032, 2_474_568]) {
      const s = d.stairDisplay!.sourceFlights!.find(
        (s) => s.stairElementId === id,
      )!;
      for (const run of s.runs!) {
        const rs = fs.filter(
          (f) =>
            f.properties!.stairElementId === id &&
            f.properties!.runElementId === run.runElementId,
        );
        const first = Math.min(...rs.map((f) => f.properties!.elevationFeet));
        assert(
          rs
            .filter((f) => f.properties!.elevationFeet === first)
            .every(
              (f) =>
                Math.abs(
                  f.properties!.displayBaseMetres -
                    (run.bottomElevationFeet - datum) * scale,
                ) < 1e-6,
            ),
        );
        const last = Math.max(...rs.map((f) => f.properties!.elevationFeet));
        if (run.topElevationFeet > last + 0.001) {
          const caps = rs.flatMap((f) => f.properties!.endpointRisers);
          assert(caps.length > 0);
          assert(
            caps.every(
              (r) =>
                Math.abs(r.top - (run.topElevationFeet - datum) * scale) < 1e-6,
            ),
          );
        }
        assert(
          rs.some(
            (f) =>
              f.properties!.elevationFeet > first &&
              f.properties!.displayBaseMetres >
                (run.bottomElevationFeet - datum) * scale,
          ),
        );
      }
    }
    const bad = structuredClone(d);
    bad.stairDisplay!.sourceFlights![0].runs![0].topElevationFeet = Number.NaN;
    assert.throws(() => validateIndoorDataset(bad), /source stair geometry/);
  },
);
test(
  "outdoor and seating context preserves navigation, source treads and user reviews; seating rows form full-rise terraces",
  { skip: !p },
  async () => {
    const d = p!.dataset;
    const before = await readIndoorProject(
      new Uint8Array(
        readFileSync(
          process.env.INDOOR_STAIR_CONTACTS_BASELINE_ZIP ??
            "/Users/ahmadjalil/Downloads/UNBC.indoor.before-stair-contacts.reviter.zip",
        ),
      ),
    );
    assert.deepEqual(p!.rooms, before.rooms);
    assert.deepEqual(d.edges, before.dataset.edges);
    assert.deepEqual(d.records, before.dataset.records);
    const inventory = before.dataset.stairDisplay?.sourceFlights?.length
      ? before
      : await readIndoorProject(
          new Uint8Array(
            readFileSync(
              process.env.INDOOR_STAIR_CONTACTS_INVENTORY_ZIP ??
                "/Users/ahmadjalil/Downloads/UNBC.indoor.all-stairs.reviter.zip",
            ),
          ),
        );
    for (const s of d.stairDisplay!.sourceFlights!) {
      assert.deepEqual(
        s.treads,
        inventory.dataset.stairDisplay!.sourceFlights!.find(
          (t) => t.stairElementId === s.stairElementId,
        )!.treads,
      );
      if ([1_842_431, 1_460_777].includes(s.stairElementId))
        assert.equal(sourceStairKind(s), "Outdoor stairs");
      if ([1_801_478, 1_779_473].includes(s.stairElementId)) {
        assert.equal(sourceStairKind(s), "Tiered seating");
        const floor = d.floors.find((f) => f.levelIds.includes(s.levelIds[0]))!;
        const rows = projectStairDisplay(
          d,
          floor.levelIds,
          "all",
          true,
        ).features.filter(
          (f) => f.properties!.stairElementId === s.stairElementId,
        );
        assert(
          rows.every(
            (f) =>
              f.properties!.topMetres - f.properties!.displayBaseMetres > 0.3,
          ),
        );
      }
    }
    const route = findProjectRoute(
      d,
      "rm-311-86e02816d8fe",
      "landing:local:07:311:08:1487816:1620957:1",
      "accessible",
    );
    assert(route);
    assert(route.edges.some((e) => e.kind === "ramp"));
    assert(
      !route.edges.some((e) => ["stairs", "local-steps"].includes(e.kind)),
    );
  },
);
