import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { buildReviewedPrintPreRoom } from "../../app/indoor-project/reviewed-print-entrance";
import { projectRoutingGraph } from "../../app/indoor-project/routing-graph";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import { reviewedPrintBridgeMatches } from "../../app/indoor-project/reviewed-print-door-bridge";
import { createSharedPathwayNetwork } from "../../app/indoor-project/shared-pathway-routing";

const input = process.env.UNBC_PRINT_ENTRANCE_DATASET;
test(
  "the shared Print pre-room runs between real office doors without using annotation anchors",
  { skip: !input },
  async () => {
    await initializeNativeExactGeosOverlay();
    const data: IndoorDataset = JSON.parse(readFileSync(input!, "utf8"));
    createImmutableRoutingSession(data)(() => {
      const bridge = data.edges.find((e) => e.id === "door:694:1996013")!;
      assert.ok(reviewedPrintBridgeMatches(data, bridge, [1513404]));
      assert.equal(reviewedPrintBridgeMatches(data, bridge, []), false);
      assert.equal(
        reviewedPrintBridgeMatches(data, bridge, [1513404, 1513686]),
        false,
      );
      const [first, ...rest] = bridge.pointsFeet;
      assert.equal(
        reviewedPrintBridgeMatches(
          data,
          {
            ...bridge,
            pointsFeet: [[first![0] + 0.01, first![1], first![2]], ...rest],
          },
          [1513404],
        ),
        false,
      );
      const network = createSharedPathwayNetwork(data, "public");
      const key = (number: string) =>
        data.records.find((r) => r.levelId === 694 && r.number === number)!.key;
      const options = {
        endpointMode: "pathway" as const,
        allowOtherRoomTransit: false,
      };
      const inside = ["08-245", "08-247", "08-249"].map(
        (n) => data.nodes.find((v) => v.id === "arrival:" + key(n))!.pointFeet,
      );
      // Moving the obsolete arrival anchors must leave every office-branch
      // vertex and length identical. Keep access evidence and real doors fixed.
      const graph = projectRoutingGraph(data, "public");
      const nodes = new Map(data.nodes.map((n) => [n.id, n]));
      const shifted = new Map(nodes);
      for (const number of ["08-245", "08-247", "08-249"]) {
        const node = nodes.get("arrival:" + key(number))!;
        shifted.set(node.id, {
          ...node,
          pointFeet: [
            node.pointFeet[0] + 38,
            node.pointFeet[1] - 21,
            node.pointFeet[2],
          ],
        });
      }
      const original = buildReviewedPrintPreRoom(
        data,
        graph,
        nodes,
        network.stopForRoom,
      );
      assert.equal(original.branches.size, 3);
      assert.deepEqual(
        buildReviewedPrintPreRoom(data, graph, shifted, network.stopForRoom),
        original,
      );
      assert.ok(network.journey(key("08-202"), key("08-244"), options));
      assert.equal(
        network.journey(key("08-244"), key("08-202"), options),
        null,
      );
      const lower = (number: string) =>
        data.records.find((r) => r.levelId === 311 && r.number === number)!.key;
      const corridor = lower("04-126");
      const lowerOffice = lower("07-165");
      const departure = network.stopForRoom(corridor, true);
      assert.ok(departure);
      assert.equal(departure.entranceEdgeId, "door:311:1032161");
      assert.deepEqual(
        network.journey(corridor, lowerOffice, options)?.departure?.pointFeet,
        departure.pointFeet,
      );
      assert.equal(network.stopForRoom(corridor, false), null);
      assert.equal(network.journey(lowerOffice, corridor, options), null);
      assert.equal(network.branchForRoom(corridor), null);
      for (const [n, door] of [
        ["08-244", "door:694:2491634"],
        ["08-246", "door:694:1995965"],
        ["08-248", "door:694:1996013"],
      ]) {
        const room = key(n!),
          branch = network.branchForRoom(room);
        assert.ok(branch);
        assert.equal(branch.roomKey, room);
        assert.equal(branch.entranceId, door);
        assert.deepEqual(
          branch.pathToHallway.at(-1),
          network.stopForRoom(room, true)?.pointFeet,
        );
        for (const departure of [true, false]) {
          const trip = departure
            ? network.journey(room, key("08-241"), options)
            : network.journey(key("08-241"), room, options);
          assert.ok(trip);
          assert.equal(
            (departure ? trip.departure : trip.arrival)?.entranceEdgeId,
            door,
          );
          assert.ok(trip.edges.every((e) => e.kind === "walk"));
          assert.ok(trip.distanceMetres < 10);
          for (const point of trip.paths.flatMap((p) => p.pointsFeet))
            assert.ok(
              !inside.some((a) => JSON.stringify(a) === JSON.stringify(point)),
            );
        }
      }
      for (const n of ["08-245", "08-249", "08-211"]) {
        assert.equal(network.branchForRoom(key(n)), null);
        assert.equal(network.stopForRoom(key(n), true), null);
      }
      for (const [start, end] of [
        ["08-243", "08-244"],
        ["08-244", "08-243"],
      ]) {
        const trip = network.journey(key(start!), key(end!), options);
        assert.ok(trip);
        assert.ok(trip.distanceMetres < 0.74);
        assert.equal(trip.departure!.pointFeet[0], trip.arrival!.pointFeet[0]);
        assert.equal(trip.edges.length, 1);
        assert.equal(trip.edges[0]?.kind, "walk");
      }
      const north = "door:694:1996146:1",
        south = "door:694:2491634:0";
      const adjacency = new Map(graph.adjacency);
      adjacency.set(
        north,
        adjacency.get(north)!.filter((link) => link.to !== south),
      );
      const oneWay = buildReviewedPrintPreRoom(
        data,
        { ...graph, adjacency },
        nodes,
        network.stopForRoom,
      );
      assert.ok(
        oneWay.arcs.some(
          (arc) => arc.sourceFrom === south && arc.sourceTo === north,
        ),
      );
      assert.ok(
        !oneWay.arcs.some(
          (arc) => arc.sourceFrom === north && arc.sourceTo === south,
        ),
      );
      adjacency.set(
        south,
        adjacency.get(south)!.map((link) =>
          link.to === north
            ? {
                ...link,
                requiredRooms: [...link.requiredRooms, key("08-242")],
              }
            : link,
        ),
      );
      const forbidden = buildReviewedPrintPreRoom(
        data,
        { ...graph, adjacency },
        nodes,
        network.stopForRoom,
      );
      assert.ok(
        !forbidden.arcs.some(
          (arc) =>
            (arc.sourceFrom === south && arc.sourceTo === north) ||
            (arc.sourceFrom === north && arc.sourceTo === south),
        ),
      );
      assert.deepEqual(
        [...forbidden.branches.keys()].sort(),
        [...original.branches.keys()].sort(),
      );
      const between = network.journey(key("08-244"), key("08-246"), options);
      assert.ok(between);
      assert.ok(between.edges.every((e) => e.kind === "walk"));
      assert.notDeepEqual(
        between.departure?.pointFeet,
        between.arrival?.pointFeet,
      );
    });
  },
);
