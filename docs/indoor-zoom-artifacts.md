# Building 10 zoom rendering repair

The false grey triangle over 10-1014 and strips crossing Building 10 were reproduced in the visitor 3D map. Hiding the exposed-wall extrusion layer removed them; hiding room blocks or floor surfaces did not. The boolean wall/room subtraction output contained microscopic shells and backtracking spurs alongside real walls. Vector-tile rounding of that combined wall collection produced false polygon faces. Fine striping also appeared where room and wall side faces competed in the depth buffer.

`stableWallGeometry` isolates each wall shell with its own holes and removes numerical debris at a ten-micrometre display precision. Ordinary measured millimetre-wide components are retained. Native wall records, room boundaries, door cuts, routing obstacles and exported model data are not edited.

Visitor 3D walls use `precisionWallLayer`: a single merged local mesh, without vector-tile clipping or quantization. It uses the shared map depth buffer and polygon depth bias for adjacent wall/room faces, rather than moving their measured footprints. Flat 2D wall surfaces and the architectural review keep the cleaned GeoJSON; the native source-model renderer is unchanged. Relative wall base and top elevations are retained. Surfaces fade with the existing detail-zoom controls.

Validation: ten unit tests passed, including wall-shell separation, holes and doorway gap preservation, sub-millimetre debris rejection, retained millimetre-wide geometry, and native stair material/openings. Four browser tests passed: desktop/mobile Building 10 zoom checks and desktop/mobile Building 6 stairwell checks in 2D and 3D. Desktop Building 10 tests check actual screenshot pixels inside 10-1014 against the prior false grey triangle. Two floors are captured at zooms 20.5, 21 and 22 on desktop and 20.5 and 21 on mobile. Scoped typecheck and Pages build passed.

Before/after images and diagnostic layer-isolation screenshots are in `work/zoom-artifacts/browser`; logs and source captures are in `work/zoom-artifacts`. This update is local and has not been published.

A repeatable all-floor detector now reports cleanup events, remaining topology problems and adjacent-face risks. See [the rendering audit](indoor-rendering-audit.md) for commands, coverage and the current unresolved findings.
