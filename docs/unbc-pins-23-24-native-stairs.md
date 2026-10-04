# Floor 2 railing and stair connector review

The two user pins were compared with the exact-model decoded native cache and the finalized master. Model SHA-256: `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`.

| Pin | Native assembly | Existing compiled connections |
| --- | --- | --- |
| 23, `(84.7023, 752.5878)` on level 694 | Stair #2024027, run #2024037, railings #2026009 and #2026013 | None |
| 24, `(56.1483, 766.7328)` on level 694 | Descending stair #2474568, runs #2474569 and #2474572; nearby upward stair #1500191 also matches | #2474568 connects 10-S101 to 10-S201; #1500191 connects 10-S201 to 10-S301 |

Pin 23 is 2.62 ft from an actual tread polygon. Pin 24 is 2.05 ft from #2474568 and 1.93 ft from #1500191. These are measured XY distances to native tread footprints, not surveyed entrances or proof of floor support at the pin. Both pins are on landing/railing context rather than within a tread, so a point-on-tread lookup alone does not identify them.

## Why the first stair is unconnected

The native inventory already contains #2024027 and its 24 measured step elevations. Its lower surrounding area is 08-155 (Agora, reviewed as circulation), while its upper stair-place binding is 08-S203. `directoryStairs` currently pairs stair-labelled source rooms at both physical endpoints. It consequently excludes the lower Agora area. The upper 08-S203 source anchor also has no compiled arrival; the existing audit reports no precise floor at that anchor. A railing, a projected room outline, or nearby floor cannot resolve those two routing conditions automatically.

The routing correction needs exact native landing contacts, an approach on supported circulation, and barrier/entrance checks at both ends. It should support a circulation-owned landing without reclassifying the Agora as a stair or enabling a guessed straight connector. This change does not add that route.

## Display and inspection changes

Every current native stair inventory entry now supplies the same selectable source-stair marker in 2D, 3D rooms, relative heights and the source model. Room-bound markers are deduplicated against that assembly identity. Older packages without an inventory retain their existing room-bound marker fallback.

Pin context and the pin inspector now include nearby native stair IDs, source levels, measured tread proximity and existing compiled connection state. An Inspect staircase button focuses the actual flight while retaining the currently selected floor and map view. That focus takes priority over an asynchronous whole-floor fit, which previously zoomed back out and hid the marker.

The source master, room classifications, native meshes, pins' coordinates, access reviews and navigation graph remain unchanged. The test archive in `work/stair-pins-23-24/review.reviter.zip` adds the two supplied pins to a separate copy solely for repeatable desktop/mobile tests.

Validation: native-coordinate unit fixtures, stale inventory and disabled-edge guards, full unit suite, scoped type check, lint, Pages build, and desktop/mobile browser checks covering both pins in flat rooms, 3D rooms and the source model. Logs and screenshots are in `work/stair-pins-23-24/`.
