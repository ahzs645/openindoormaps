import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readIndoorProject,
  exportIndoorProject,
  reviewEdge,
} from "../../app/indoor-project/package";
import {
  findProjectRoute,
  validateIndoorDataset,
  geographicPoint,
} from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
import {
  projectConnectorMarkers,
  sourceModelConnectorMarkers,
} from "../../app/indoor-project/connector-markers";
const zip = process.env.INDOOR_RAMP_ZIP;
const project = zip
  ? await readIndoorProject(new Uint8Array(readFileSync(zip)))
  : undefined;
const start = "rm-311-86e02816d8fe",
  end = "landing:local:07:311:08:1487816:1620957:1";

test(
  "native wheelchair ramp follows both runs and turning landing in either direction",
  { skip: !project },
  () => {
    const data = project!.dataset,
      ramp = data.edges.find((e) => e.id === "ramp:1622190")!;
    for (const [a, b, direction] of [
      [start, end, "up"],
      [end, start, "down"],
    ]) {
      const route = findProjectRoute(data, a, b, "accessible")!;
      assert(route);
      assert.equal(route.unknownAccessibilityEdges, 0);
      assert.deepEqual(
        route.edges
          .filter((e) => !["walk", "opening"].includes(e.kind))
          .map((e) => e.id),
        [ramp.id],
      );
      for (const approach of route.edges.filter((e) => e.id !== ramp.id)) {
        assert.equal(approach.accessible, "yes");
        assert.equal(
          data.nodes.find((n) => n.id === approach.from)!.levelId,
          data.nodes.find((n) => n.id === approach.to)!.levelId,
        );
        assert(
          approach.pointsFeet.every(
            (p) => Math.abs(p[2] - approach.pointsFeet[0][2]) <= 0.05,
          ),
        );
      }
      const path = route.paths.find((p) => p.edgeIds.includes(ramp.id))!;
      assert.deepEqual(
        path.pointsFeet,
        direction === "up" ? ramp.pointsFeet : ramp.pointsFeet.toReversed(),
      );
      assert(
        projectNavigationSteps(data, route, a, b).some(
          (s) =>
            s.message === `Take the ramp ${direction} within Campus Floor 1`,
        ),
      );
    }
    assert(ramp.pointsFeet.some((p) => p[0] === 31 && p[1] === 461.5));
    assert(ramp.pointsFeet.some((p) => p[0] === 31 && p[1] === 466.5));
  },
);

test(
  "wheelchair mode never substitutes stairs when this ramp is disabled or unconfirmed",
  { skip: !project },
  () => {
    const disabled = reviewEdge(project!, "ramp:1622190", { enabled: false });
    assert.equal(
      findProjectRoute(disabled.dataset, start, end, "accessible"),
      null,
    );
    assert(
      findProjectRoute(disabled.dataset, start, end, "public")!.edges.some(
        (e) => e.kind === "local-steps",
      ),
    );
    const unknown = reviewEdge(project!, "ramp:1622190", {
      accessible: "unknown",
    });
    assert.equal(
      findProjectRoute(unknown.dataset, start, end, "accessible"),
      null,
    );
    assert.throws(
      () =>
        reviewEdge(project!, "local:local:07:311:08:1487816:1620957", {
          accessible: "yes",
        }),
      /Steps cannot/,
    );
  },
);

test(
  "one separate ramp icon sits on the native slope, with source height and binding checked",
  { skip: !project },
  () => {
    const data = project!.dataset,
      display = data.rampDisplay!.ramps[0];
    const markers = projectConnectorMarkers(data, [311, 1_487_816], "all");
    const ramps = markers.features.filter((f) => f.properties?.kind === "ramp");
    assert.equal(ramps.length, 1);
    assert.deepEqual(
      ramps[0].geometry.coordinates,
      geographicPoint(data, display.anchorPointFeet),
    );
    const native = sourceModelConnectorMarkers(
      data,
      markers,
      [311, 1_487_816],
    ).features.find((f) => f.properties?.kind === "ramp")!;
    const datum = Math.min(
      ...data.records
        .filter((r) => [311, 1_487_816].includes(r.levelId))
        .map((r) => r.elevationFeet),
    );
    assert(
      Math.abs(
        Number(native.properties?.heightMetres) -
          ((display.anchorPointFeet[2] - datum) *
            data.alignment.verticalMetresPerFoot +
            0.15),
      ) < 0.0001,
    );
    const stale = structuredClone(data);
    stale.rampDisplay!.sourceModelSha256 = "a".repeat(64);
    assert.throws(() => validateIndoorDataset(stale), /ramp display/);
    const foreign = structuredClone(data);
    foreign.rampDisplay!.ramps[0].edgeId =
      "local:local:07:311:08:1487816:1620957";
    assert.throws(() => validateIndoorDataset(foreign), /source connection/);
  },
);

test(
  "prepared ramp survives export with native scene and both existing elevators",
  { skip: !project },
  async () => {
    const restored = await readIndoorProject(
      await exportIndoorProject(project!),
    );
    assert.deepEqual(
      restored.dataset.rampDisplay,
      project!.dataset.rampDisplay,
    );
    assert.deepEqual(restored.dataset.connectors, project!.dataset.connectors);
    assert.equal(restored.dataset.connectors?.length, 2);
    assert.deepEqual(restored.scene, project!.scene);
    assert(findProjectRoute(restored.dataset, start, end, "accessible"));
  },
);
