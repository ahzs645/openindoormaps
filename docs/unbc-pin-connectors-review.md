The consolidated pair is `/Users/ahmadjalil/Downloads/UNBC.consolidated/UNBC.master.reviter.zip` for editing and `/Users/ahmadjalil/Downloads/UNBC.consolidated/UNBC.campus-viewer.zip` for browsing. The master combines physical-floor routing with the reviewed wheelchair ramp, retaining Campus Floor 3, both lifts and their floor exits. Both packages include native slab occlusion for descending stairs. The audit covers 25 ZIPs and 12 diagnostic files; originals are retained. See `unbc-consolidation-audit.json` and the consolidated folder’s `README.txt`. Reviter-only regeneration requires reapplying native ramp preparation; the README gives the command.

The earlier `/Users/ahmadjalil/Downloads/UNBC.indoor.campus-floor-3-with-lifts.reviter.zip` predates the separate ramp. It starts from the user's newer Campus Floor 3 archive, retains both campus floor groupings and every existing source review, and adds the two lifts plus the shared-corridor native stair display. Its Campus Floor 3 combines native levels 400176 and 1487353 while retaining their actual elevations. The original archives remain unchanged. Preservation and all 18 directional lift journeys are recorded in `unbc-campus-floor-3-with-lifts-audit.json`.

Desktop and mobile browser tests also passed against this latest combined archive: all seven stops, both elevator previews, next/previous floor changes, and mobile viewport fit. Import this ZIP in the running map to replace the currently loaded project; generating the file does not change an already-open browser project.

The two user elevator pins compile into model-bound lifts. The earlier `/Users/ahmadjalil/Downloads/UNBC.indoor.pin-connectors.reviter.zip` predates the Campus Floor 3 grouping. Building 04 serves native levels 311, 694, 400176 and 402367 (campus floor 1, then floors 2–4). Agora/Conference serves levels 311, 694 and 1487353 (campus floor 1, floor 2 and native floor 3.5, now grouped into Campus Floor 3).

The model contains shafts built from walls, without elevator family objects. Each `reviewedShaft` retains the user's pin ID, model-space position and native wall IDs. Reviter checks the enclosure at each stop, the actual lobby slab and its openings, the source room, and the walking path. The lobby anchor must face an opening in the shaft, without crossing a solid shaft wall. The ground-floor Agora corridor entrance faces the opposite side from the upper Conference lobby entrances; each stop retains its own coordinate.

The shaft-supported exception permits the Agora/Conference lift to cross source Building 07/06 labels. Other connector reviews still require their native connector element and same-building served-floor associations. Roof slabs and unsupported stops remain excluded. Accessibility stays unknown, so these connections participate in public review routes and require further confirmation for step-free routing.

The separate stair pin identifies native stair #1372994, run #1373131, at tread elevation 3.937 ft. All 32 treads now display on the lower floor inside the shared 07-236 corridor, with their original elevations and thickness. The shared floor remains selectable under the overhead portion. `stairDisplayOnlyFlightIds` does not reclassify the corridor or add a stair routing edge; its landing connections still require review.

Source room outlines and original names, source model bytes, GIS reference bytes and GLB scene bytes are preserved. The audit checks 18 directional elevator journeys, per-floor arrival coordinates, ZIP export/import and regeneration. Routing now treats sub-nanometre distance differences as rounding, so a direct elevator ride is not split into redundant intermediate-floor instructions. 63 targeted tests passed (45 OpenIndoorMaps unit tests, 16 Reviter tests and two desktop/mobile browser tests), alongside both app builds and scoped type checks. See `unbc-pin-connectors-audit.json` and the desktop/mobile follow screenshots.

To regenerate from the exported ZIP, run in Reviter:

```sh
node scripts/prepare-indoor-project.ts \
  --input '/Users/ahmadjalil/Downloads/UNBC.indoor.pin-connectors.reviter.zip' \
  --out '/Users/ahmadjalil/Downloads/UNBC.indoor.pin-connectors.regenerated.reviter.zip' \
  --revit-version 2027
```

The source review already lives in `floors/rooms.json`; regeneration requires no new pin selection or external connector JSON. A standalone example is saved in Reviter at `docs/examples/unbc-pin-connectors.json` for the initial `--connectors` import.

The joined `UNBC.indoor.connectivity-reviewed.reviter.zip` originally omitted the two lifts and shared-corridor stair display. The combined output is `/Users/ahmadjalil/Downloads/UNBC.indoor.connectivity-with-lifts.reviter.zip`; the original joined archive is retained. This output was regenerated from the joined archive plus only those connector and stair-display reviews. Every joined source field, all 1,671 existing routable arrivals, all 1,544 existing non-walking transitions, and connectivity within all 134 original components were preserved. Both lifts pass 18 directional journeys with their per-floor exits; the source model, GIS references and scene remain byte-identical. Export/import preserves the source and compiled graph. See `unbc-connectivity-with-lifts-audit.json`.
