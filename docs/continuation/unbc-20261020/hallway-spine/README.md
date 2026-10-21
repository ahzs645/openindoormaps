# Straight hallway spine (prototype)

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

## Next

1. Use the spine as the simplified product's walking network.
2. After the attempt 006 rebuild, try it as the shared trunk for production guide preparation (`app/indoor-project/prepare-routing.ts`), keeping the existing exact physical and policy checks on every run, then re-bind the route data.
