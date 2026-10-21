# Straight hallway spine

A prototype routing spine for the simplified UNBC product, built only from the gap-fixed native walkable cells (`circulationGeometry.cells`) and the existing door and opening links of a compiled routing dataset. It does not change the compiler, the production route guides or any pinned binding.

## Rules

- Each walking surface gets one centreline: the medial axis of its outline (a Voronoi diagram of the densified boundary), with short side branches pruned, pulled into the fewest straight runs that stay within 1.25 ft of the axis and clear of the walls. Every run is checked to stay inside the surface.
- A door or opening link whose two ends touch two different surfaces is a gate. Its line leaves the door straight along the door's normal and joins each side's spine, extending a spine end where that keeps the line straight.
- A vestibule, link or small space (under 450 sq ft) between gates becomes one straight door-to-door line, or straight spokes from its centre with more than two doors. A compact open area (axis shorter than three times its half-width) uses spokes from its most central point.
- Each room doorway joins its surface's spine by the shortest clear line, which meets a straight run at a right angle.

## Result on the Oct 18 compiled campus (EVIDENCE-016)

| Measure                                   | Value                                              |
| ----------------------------------------- | -------------------------------------------------- |
| Spine length                              | 7,983 m (26,191 ft)                                |
| Gate sides joined                         | 542 of 544                                         |
| Room doorways joined                      | 1,318 of 1,324 (1,571 connections at right angles) |
| Straight crossings / spoke areas          | 23 / 52                                            |
| Walking spaces ≥ 40 sq ft with no doorway | 25 (listed for review)                             |

Rooms without a native outline in the same dataset: 170 of 1,479 (104 with several room numbers in one native room, 55 with native walls that do not close, 8 overlapping a corridor or void, 3 with no native enclosure recorded).

## Running it

Both scripts need the repository's `delaunator` and `polygon-clipping`, so run them from inside the repository (for example after copying them under `node_modules/.cache/`):

```sh
node --max-old-space-size=8000 hallway-spine.mjs routing.json 694 spine-694.json
node --max-old-space-size=8000 export-simplified-geojson.mjs routing.json out-directory
```

`routing.json` is the decompressed routing asset from the EVIDENCE-016 delivery (`normal-seven-scopes/assets/df44…part` + `d35e…part`, gunzipped; SHA-256 `0762303…`).

## Routable network (`app/indoor-project/hallway-network.ts`)

The spine is now a typed module (`hallway-spine.ts`) and a routable network built from any compiled dataset with `buildHallwayNetwork(data)`, with a Dijkstra router (`createHallwayRouter`) for the walking and step-free profiles. Room interiors, door crossings and vertical links keep the compiled graph's own edges; only hallway walks are replaced.

- **Hallway part of a cell.** A gap-fixed walkable cell also holds the rooms that open onto it, so the spine runs only in the cell clipped to its hallway rooms' outlines grown by 1.25 ft (across wall gaps and into doorways). The clip is a derived display surface: outlines with spikes or seams are snapped to 0.001 ft and repaired with a zero buffer, accepted only when the repair keeps the area within 2%. Source geometry is unchanged.
- **Planes.** Cells are grouped by elevation, because one cell can carry two level ids at one height.
- **What joins the spine.** A compiled walk is replaced only when it lies wholly on one hallway part. Only nodes the compiler walks along that part (arrivals, door portals, lift and stair landings) join its spine. A door portal the compiler never walks to from the hallway, such as a closed-off room or a door into a wall gap, stays unconnected. Held links stay out.
- **No lost connections, no long way round.** When the spine does not join a replaced walk's two ends within 1.5 × its length + 3 m, under that walk's own limits (staff, steps), the compiled walk stays (`report.restoredEdges`).
- **Axis gaps.** Short wall stubs and small holes can break the sampled medial axis. Loose ends are bridged to the nearest clear vertex of another piece before trimming.
- **Policy.** Staff-only rooms and cells are flagged and never used; step-free excludes stairs, local steps and escalators.

### Audit on EVIDENCE-016 (`network-audit.json`)

Run with `node --import tsx scripts/indoor/audit-hallway-network.ts routing.json report.json [network.json]`. It exits non-zero on any parity failure.

| Measure                                              | Walking                                | Step-free                 |
| ---------------------------------------------------- | -------------------------------------- | ------------------------- |
| Room pairs checked (1,740 rooms)                     | 1,512,930                              | 1,512,930                 |
| Pairs the network loses / invents                    | 0 / 0                                  | 0 / 0                     |
| Length vs compiled shortest path (259 sampled pairs) | median 0.87, 5–95% 0.81–0.96, max 1.06 | same                      |
| Route time                                           | median 2.1 ms, p95 4.5 ms, max 8.4 ms  | median 1.9 ms, p95 3.8 ms |

The two profiles give the same numbers on this dataset because all 28 stair links are held and the one local-steps link lies on no sampled route. The network is shorter because compiled hallway walks zig-zag from portal to portal across the corridor; the spine runs down the centre (checked by drawing both routes).

| Network                                            | Value                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Nodes / edges                                      | 10,702 / 11,262 (5,011 spine, 1,782 doorway joins, 169 gate links, 2,491 kept walks)                            |
| Spine length                                       | 5,869 m over 144 hallway parts on 8 planes                                                                      |
| Restored compiled walks                            | 460                                                                                                             |
| JSON size                                          | 1.27 MB, 472 KB gzipped (deterministic: identical bytes across builds; SHA-256 `13c0cfdf…`)                     |
| Build time                                         | about 7 s in Node                                                                                               |
| Spine points off a walkable cell                   | 1,227 of 45,099 samples, all within 1.27 ft of one (99.7% within 0.5 ft): door thresholds crossed by gate lines |
| Doorways the spine could not reach by a clear line | 31 doorways and 1 gate (still routable through their compiled edges)                                            |

## Next

1. Serve the network with the simplified product (it is a static JSON beside the simplified floor GeoJSON) and route on the device.
2. Reduce the 460 restored walks by fixing the spine where it only meets itself around a loop.
3. After the attempt 006 rebuild, try it as the shared trunk for production guide preparation (`app/indoor-project/prepare-routing.ts`), keeping the existing exact physical and policy checks on every run, then re-bind the route data.
