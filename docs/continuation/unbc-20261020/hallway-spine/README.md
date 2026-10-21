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
- **What joins the spine.** A compiled walk, or an opening longer than 2 m (a walk across a hall typed as an opening), is replaced only when it lies wholly on one hallway part. Only nodes the compiler walks along that part (arrivals, door portals, lift and stair landings) join its spine. A door portal the compiler never walks to from the hallway, such as a closed-off room or a door into a wall gap, stays unconnected. Held links stay out.
- **No lost connections, no long way round.** When the spine does not join a replaced walk's two ends within 1.5 × its length + 3 m, under that walk's own limits (staff, steps), the compiled walk stays (`report.restoredEdges`).
- **Axis gaps.** Short wall stubs and small holes can break the sampled medial axis. Loose ends are bridged to the nearest clear vertex of another piece before trimming, and after straightening separate spine pieces of one part are bridged by clear straight lines up to 12 ft long (0.1 ft from walls: breaks sit at pinches by columns). Pieces shorter than 3 ft that no bridge reaches are scraps in recesses and are dropped, so doorways there join the real spine.
- **Gates.** A door between two hallway parts becomes a gate through a centre point; its two compiled portals stay linked to that centre, because rooms and lifts may still end at them. A gate side with no straight entry along the door's normal steps out where it is clear (a bent entry).
- **Bent joins.** A doorway with no clear straight line to a spine (set in a recess or behind a column) first steps out 0.75–3.5 ft in whichever direction is clear, then joins.
- **Hops.** Two doors on one part at most 15 ft apart get a direct link when even the shortest way through the spine is longer than 1.4 × the hop + 2 ft: each end steps out along its own join only as far as the crossing needs to clear the walls. Hops are thinned shortest-first into a chain, not a clique.
- **Policy.** Staff-only rooms and cells are flagged and never used; step-free excludes stairs, local steps and escalators.
- **Drawing.** `drawHallwayRoute` draws a route per level and straightens a turn sharper than 35° on a leg under 8 ft (a doorway join meeting the spine beside the next one). Display only: the route's length and links are unchanged.

### Audit on EVIDENCE-016 (`network-audit.json`)

Run with `node --import tsx scripts/indoor/audit-hallway-network.ts routing.json report.json [network.json]`. It exits non-zero on any parity failure.

| Measure                                              | Walking                                | Step-free                 |
| ---------------------------------------------------- | -------------------------------------- | ------------------------- |
| Room pairs checked (1,740 rooms)                     | 1,512,930                              | 1,512,930                 |
| Pairs the network loses / invents                    | 0 / 0                                  | 0 / 0                     |
| Length vs compiled shortest path (259 sampled pairs) | median 0.86, 5–95% 0.81–0.97, max 1.12 | same                      |
| Route time                                           | median 1.7 ms, p95 3.8 ms              | median 2.0 ms, p95 4.1 ms |

The two profiles give the same numbers on this dataset because all 28 stair links are held and the one local-steps link lies on no sampled route. The network is shorter because compiled hallway walks zig-zag from portal to portal across the corridor; the spine runs down the centre (checked by drawing both routes).

| Network                                                                   | First version       | Now                                                                                 |
| ------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| Restored compiled walks                                                   | 460                 | 138                                                                                 |
| Doorways that reach no spine                                              | 31 doorways, 1 gate | 25 doorways, 2 gates                                                                |
| Real out-and-backs drawn in 1,573 sample routes (turn < 35°, leg 0.6–6 m) | 194                 | 36                                                                                  |
| Hops / spine bridges                                                      | –                   | 349 / 18                                                                            |
| Nodes / edges                                                             | 10,702 / 11,262     | 10,367 / 11,257                                                                     |
| JSON size, gzipped                                                        | 472 KB              | 457 KB (identical bytes across builds)                                              |
| Spine and hop points off a walkable cell                                  | –                   | 1,164 of 47,628 samples, all within 1.28 ft (door thresholds crossed by gate lines) |

What the restores were: half came from gates whose portals were left isolated, so every hallway walk to them was put back; most of the rest were doors on one wall whose only way through the spine was an out-and-back (now hops), doorways in recesses that joined a scrap of axis (now dropped scraps and bent joins), and a long "opening" fan from a ramp landing (now replaced as walks). The remaining 138 are mostly the doorways that reach no spine and pieces of spine that no clear bridge joins.

Drawing smoothing adds 21 samples more than 1.3 ft outside any cell or room in 1,573 routes (94 against 73 in 2.97 million): a few short corner cuts, in the drawing only.

### Simplified product routing file (`indoor-routes-export.json`)

`hallwayNetworkToIndoorRoutes` (`app/indoor-project/hallway-network-routes.ts`) writes the network as a venue `indoorRoutes` GeoJSON, the routing file every simplified venue (the BC Children's hospital example, Eaton Centre, …) hands to the app's directions engine. Every network point keeps its own coordinate so split levels on one floor never merge; each line carries `routing_cost` from the network's own length; staff-only links and destinations are left out (the engine has no staff rule); stairs, steps and escalators are `is_accessible: false` for its step-free option; `level_id` is the floor's index in `data.floors`.

`node --import tsx scripts/indoor/export-hallway-routes.ts routing.json indoor-routes.geojson report.json` writes it and loads it through the engine's own `loadMapData` and pathfinder. On EVIDENCE-016: 11,255 lines and 1,739 destinations, 4.6 MB raw and 387 KB gzipped; across 1,198 sampled pairs (walking and step-free) the engine finds a route exactly when the network does, at the same cost (largest difference 1.6 × 10⁻¹⁵).

The app's current `app/data/unbc` venue is an older IFC import (no rooms, a 110-line stair skeleton, a hand-placed anchor, IFC storey numbers). Serving this file there means replacing its map and POIs with the compiled export at the same time, so floors and destinations match.

## Next

1. Re-run both scripts on the attempt 006 output. Native 006 finished on Oct 21 at 07:21 UTC (exit 0, postflight passed), but its compiled dataset is not on Drive yet (`nativeInputOutputPayloadBackup: false`), so it could not be audited here.
2. Replace `app/data/unbc` with the compiled export: map and POIs from `export-simplified-geojson.mjs` and this routing file, with floor numbers to match.
3. After the attempt 006 rebuild, try it as the shared trunk for production guide preparation (`app/indoor-project/prepare-routing.ts`), keeping the existing exact physical and policy checks on every run, then re-bind the route data.
