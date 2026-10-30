# Inspect the complete native pathway display

The preview exports the same saved walking and connection layers used by the
production floor worker. It keeps original doorway crossings, walking fallbacks,
floor changes, held stairs and missing-approach diagnostics beside the shared
guides. The floor worker already composed these layers before this helper was
introduced; the shared entry point keeps the exported view consistent with it.

This is source display inspection. It does not calculate a route, approve public
access, verify step-free travel, or create a publication receipt.

## Export

Use a new output directory and the complete saved dataset or the authoring master:

```sh
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/export-pathway-preview.ts \
  /absolute/path/compiled-dataset.json /absolute/path/new-preview
```

To install an explicitly bounded guide experiment for display:

```sh
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/export-pathway-preview.ts \
  /absolute/path/compiled-dataset.json /absolute/path/new-preview \
  --guides /absolute/path/prepared-routing.json
```

The optional guide catalog must match the current resolver, complete source
geometry and policy, model identity, and the production reader's original
endpoint and walking-plane checks. Shared-corridor guides require exact endpoint
and plane equality. A mismatched catalog fails the export; it is not silently
treated as an accepted experiment. All physical context remains in the binding,
including floors outside the displayed view.

Passing a `.zip` performs a normal authoring-master import through
`readIndoorProject()`, including its existing checks. It can be expensive. A
saved JSON input is explicitly reported as a display export from that dataset;
it does not acquire normal-import or route-validation authority.

## Open and inspect

```sh
python3 -m http.server 8767 --bind 127.0.0.1 --directory /absolute/path/new-preview
```

Open `http://127.0.0.1:8767/`. Choose a native physical level, focus a building,
and compare **Complete saved network** with **Shared guides only**. Search an
original edge or native door ID to inspect its source identity. Click a path or
stop for its saved direction, ownership and accessibility metadata. The plan
view supports dragging, zoom buttons, wheel zoom and keyboard `+`/`-`.

The guide-only comparison intentionally hides original saved walks, thresholds,
floor changes and unresolved-door markers. A gap in that comparison can therefore
be a missing display layer rather than a missing graph connection. The complete
view distinguishes these cases; neither view qualifies the full journey.

## Preserved context and diagnostics

- Every declared native level is exported, including levels with no saved cells.
- Native cell and room rings retain their original coordinates and all inner
  rings. The SVG uses the even-odd fill rule so holes remain visible.
- A native cell may appear in more than one level scope. The inventory reports
  unique cell identities and inner rings counted once per cell separately from
  the per-level occurrences. These are representation counts, not a census of
  distinct physical opening elements.
- Source XYZ and graph node/room identity are opt-in inspection metadata.
  Ordinary production layer output is unchanged.
- A zero-XY vertical connection retains its original stop markers and elevations;
  the exporter does not draw an invented horizontal segment.
- Held stairs remain disabled. Existing staff/nonwalkable restrictions remain in
  the display helpers and in the original source.
- An unmatched or ambiguous source door is a separate diagnostic marker. Its XY
  is the original door position; its displayed Z is explicitly the declared
  native level. The marker creates no owner, portal, approach or graph edge.
- The existing approach audit retains direction, ordinary-room requirements and
  missing-approach states. A visible landing is not step-free certification.

## Files and provenance

`data/index.json` binds the exact input bytes, source JSON value, guide catalog,
resolved implementation modules, static UI assets and each level file. It records
the experiment's accepted guide count and source cell identities. The exporter
rechecks the input files, implementation and source value before writing the
finished manifest. An output directory without a completed manifest is not a
finished export.

`data/level-<native-id>.json` contains original rings, source edge identities,
display layers and diagnostics for that native scope. `index.html`, `preview.js`
and `preview.css` are a standalone viewer. The UI does not rebuild a graph or join
coordinates by proximity.

The October 30 rebuild reuses the HTML/CSS/JS recovered from the saved October 23
preview archive. The helper, exporter and tests were rebuilt from the current
repository. Fresh input and verification evidence is recorded separately from
historical preview output.

## Focused checks

```sh
node --import tsx --test --test-isolation=none \
  tests/unit/path-network-preview.test.ts \
  tests/unit/path-network-systemic.test.ts \
  tests/unit/path-connections.test.ts
```

These checks cover default production composition parity, preserved original
crossings, exact source XYZ, zero-XY stops, held stairs, native holes and repeated
level scopes, empty levels, unresolved doorway markers, full-context guide
rejection, direction and access restrictions. Actual desktop/mobile checks of the
export remain separate from normal-calculator and production-route-worker
acceptance.

For an exported dataset, check every declared level at desktop/mobile sizes and
optionally inspect original native door IDs:

```sh
node tests/preview/check-pathway-preview.mjs \
  /absolute/path/new-preview /absolute/path/new-browser-evidence \
  2311764 2315416
```

The two example IDs belong to UNBC and are test arguments, not hardcoded UI
behavior. Install Chromium through Playwright or set
`PREVIEW_CHROMIUM_EXECUTABLE` to an existing compatible executable. The check
compares actual DOM features, original per-cell ring counts, empty-level views,
inspection metadata and horizontal overflow, and retains screenshot hashes.
