# Repeatable indoor rendering audit

The Building 10 cleanup and precision wall renderer apply to every prepared visitor floor. The audit runs the same `stableWallGeometry` function and records where that cleaner intervenes. It checks the exact visitor walls before and after cleanup, including native wall subtraction, room blocks and stair openings; it never writes source geometry or routing data.

```sh
npm run indoor:audit-rendering -- /path/to/current.reviter.zip /path/to/report.json
```

A master Reviter ZIP or campus-viewer ZIP is accepted. Every campus floor and native level is prepared in ordinary and relative-height modes with detailed geometry, hidden pillars and default visitor options. Empty native levels are reported explicitly, not treated as evidence that their source model was checked.

The JSON ties its findings to the model, rooms and dataset hashes. Cleanup events include microscopic shells, collapsed rings, backtracking tips, redundant vertices and winding repairs. Topology checks flag non-finite coordinates, proper self-crossings above ten-micrometre precision, holes outside their shells and invalid vertical ranges. Large discarded invalid components remain review findings: disappearance from the renderer is not proof of a safe repair.

Each finding includes a level, component reference and geographic location when available. Exposed walls can be a union per level without individual native wall IDs. The audit uses synthetic component IDs only on copies and adds native coordinates plus nearby source contours as proximity hints. It does not invent a verified native attachment. Repeated findings across campus/native views and height modes are deduplicated in the summary.

Shared wall/room faces and positive-area overlaps with overlapping vertical ranges are counted separately. These are possible depth-buffer competition sites, not automatically source errors. The precision mesh and shared depth bias address normal wall/room adjacency. The report records a count and up to 200 examples per campus view.

Exit status 0 means no unresolved geometry findings; status 2 means review is needed. The tool asserts that the dataset remains unchanged. It cannot certify every GPU, camera angle or the separate native source-model renderer.

`tests/e2e/indoor-all-floor-rendering.spec.ts` complements this with desktop/mobile checks on every campus floor, in ordinary and relative 3D at zooms 20.5, 21.5 and 22. It asserts precision wall-layer use, shell isolation and room-interior screenshot samples while saving 60 views. Supply `INDOOR_PROJECT_ZIP` and optionally `INDOOR_SCREENSHOT_DIR` using a configured Playwright Chromium installation.

The current UNBC results are in `work/all-floor-render-audit/report.json` and `report.md`. They include remaining self-crossing components near 04-S103 and 06-342; these remain review findings. No map ZIP needs regeneration to run this audit.
