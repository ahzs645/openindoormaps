"""Physical layout regressions; run: python3 -m unittest discover -s tests/geometry."""
import sys
import unittest
from collections import defaultdict
import heapq
import math
from pathlib import Path

from shapely.geometry import LineString, box, Polygon, Point
from shapely.affinity import scale, rotate

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from walkable_mesh import build_walkable_mesh


class WalkableMeshTest(unittest.TestCase):
    def test_aisle_routes_prefer_the_buildings_rotated_right_angles(self):
        angle = 28
        area = rotate(box(0, 0, 20, 20), angle, origin=(0, 0))
        endpoints = [rotate(Point(x, y), angle, origin=(0, 0))
                     for x, y in ((2, 2), (18, 18))]
        to_geo = lambda g: scale(g, xfact=1 / 111320, yfact=1 / 111320, origin=(0, 0))
        mesh, diagnostics = build_walkable_mesh(
            {0: [to_geo(area)]}, {},
            {0: [(p.x / 111320, p.y / 111320) for p in endpoints]},
            lat_ref=0, origin=(0, 0), preferred_by_level={0: [to_geo(area)]},
            axis_preference=.6)
        adj, targets = defaultdict(list), []
        for f in mesh["features"]:
            if f["geometry"]["type"] == "Point":
                targets.append(tuple(f["geometry"]["coordinates"]))
                continue
            a, b = map(tuple, f["geometry"]["coordinates"])
            line = scale(LineString([a, b]), xfact=111320, yfact=111320, origin=(0, 0))
            self.assertTrue(area.buffer(.001).covers(line))
            cost = line.length * f["properties"].get("routing_cost_factor", 1)
            adj[a].append((b, cost)); adj[b].append((a, cost))
        queue, best = [(0, targets[0], [])], {targets[0]: 0}
        while queue:
            cost, point, path = heapq.heappop(queue)
            if point == targets[-1]:
                self.assertGreaterEqual(len(path), 2)
                for a, b in path:
                    heading = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
                    error = abs((heading - angle + 45) % 90 - 45)
                    self.assertLess(error, .1)
                break
            for b, weight in adj[point]:
                total = cost + weight
                if total < best.get(b, float("inf")):
                    best[b] = total
                    heapq.heappush(queue, (total, b, path + [(point, b)]))
        else:
            self.fail("No path through open rotated aisle")
        self.assertAlmostEqual(diagnostics[0]["preferred_axis_degrees"], angle)

    def mesh(self, obstacles, points):
        to_geo = lambda g: scale(g, xfact=1 / 111320, yfact=1 / 111320,
                                origin=(0, 0))
        self.obstacles = obstacles
        result, _ = build_walkable_mesh(
            {0: [to_geo(box(0, 0, 20, 20))]},
            {0: [to_geo(g) for g in obstacles]},
            {0: [(x / 111320, y / 111320) for x, y in points]},
            lat_ref=0, origin=(0, 0),
        )
        self.adj = defaultdict(set)
        self.targets = []
        for f in result["features"]:
            c = f["geometry"]["coordinates"]
            if f["geometry"]["type"] == "Point":
                self.targets.append(tuple(c))
                continue
            a, b = map(tuple, c)
            self.adj[a].add(b)
            self.adj[b].add(a)
            line = scale(LineString(c), xfact=111320, yfact=111320, origin=(0, 0))
            for obstacle in obstacles:
                self.assertFalse(line.intersects(obstacle), "Path enters solid material")

    def connected(self, first, last):
        seen, todo = set(), [self.targets[first]]
        while todo:
            p = todo.pop()
            if p in seen:
                continue
            seen.add(p)
            todo.extend(self.adj[p] - seen)
        return self.targets[last] in seen

    def test_narrow_doorway_remains_connected(self):
        self.mesh([box(9.8, 0, 10.2, 9.7), box(9.8, 10.3, 10.2, 20)],
                  [(3, 10), (17, 10)])
        self.assertTrue(self.connected(0, 1))

    def test_closed_partition_is_not_stitched(self):
        self.mesh([box(9.8, 0, 10.2, 20)], [(3, 10), (17, 10)])
        self.assertFalse(self.connected(0, 1))

    def test_polygon_hole_is_free_but_not_a_door(self):
        ring = Polygon(box(5, 5, 15, 15).exterior.coords,
                       [box(6, 6, 14, 14).exterior.coords])
        self.mesh([ring], [(2, 10), (8, 10), (12, 10)])
        self.assertFalse(self.connected(0, 1))
        self.assertTrue(self.connected(1, 2))

    def test_blocked_destination_is_retained_without_an_edge(self):
        self.mesh([box(9, 9, 11, 11)], [(2, 10), (10, 10)])
        self.assertEqual(len(self.targets), 2)
        self.assertFalse(self.connected(0, 1))
        self.assertFalse(self.adj[self.targets[1]])

    def test_public_aisles_are_preferred_over_department_shortcuts(self):
        # Two aisles meet at the back of an open department. The direct
        # department shortcut is physically possible, but is not its public
        # walking route. A destination in that department remains reachable.
        to_geo = lambda g: scale(g, xfact=1 / 111320, yfact=1 / 111320,
                                origin=(0, 0))
        aisle = box(0, 0, 4, 20).union(box(16, 0, 20, 20)).union(box(0, 16, 20, 20))
        points = [(2, 2), (10, 2), (18, 2)]
        mesh, _ = build_walkable_mesh(
            {0: [to_geo(box(0, 0, 20, 20))]}, {},
            {0: [(x / 111320, y / 111320) for x, y in points]},
            lat_ref=0, origin=(0, 0), preferred_by_level={0: [to_geo(aisle)]})
        adj, targets = defaultdict(list), []
        for f in mesh["features"]:
            if f["geometry"]["type"] == "Point":
                self.assertTrue(f["properties"]["is_routable"])
                targets.append(tuple(f["geometry"]["coordinates"]))
                continue
            a, b = map(tuple, f["geometry"]["coordinates"])
            line = scale(LineString([a, b]), xfact=111320, yfact=111320, origin=(0, 0))
            cost = line.length * f["properties"].get("routing_cost_factor", 1)
            adj[a].append((b, cost, line))
            adj[b].append((a, cost, line))
        queue, best = [(0, targets[0], [])], {targets[0]: 0}
        while queue:
            cost, point, path = heapq.heappop(queue)
            if point == targets[-1]:
                self.assertGreater(sum(g.length for g in path), 32)
                self.assertLess(sum(g.difference(aisle.buffer(.03)).length for g in path), 1)
                return
            if cost > best[point]:
                continue
            for end, weight, line in adj[point]:
                if cost + weight < best.get(end, float("inf")):
                    best[end] = cost + weight
                    heapq.heappush(queue, (cost + weight, end, path + [line]))
        self.fail("Public aisle route is disconnected")


if __name__ == "__main__":
    unittest.main()
