# Audit room volume coverage

A room that appears lower than its neighbours can be missing a validated room block rather than have the wrong floor elevation. The detector prepares the actual visitor geometry in flat and native height modes and reports whether a block exists for every place, on every campus floor and native level.

For the interactive queue, load the master in `/projects/indoor` and choose **Room review**. Search/filter places, compare map modes, record evidence decisions and export them with the reviewed master. The interface and CLI share the same detector. See [the enclosure workflow](indoor-enclosure-review.md) for the full human/agent procedure.

Run from the OpenIndoorMaps repository:

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-volume-coverage.ts \
  /path/to/project.reviter.zip \
  /path/to/volume-coverage.json \
  /path/to/volume-coverage.md
```

The Markdown output is optional. Output paths must differ from the input. The detector hashes the input archive and dataset before and after geometry preparation and fails if either changes. It makes no corrections to the ZIP, room outlines, access rules or routing graph.

Each record is classified as:

- `block-present`: actual visitor room blocks exist in both height modes.
- `intentional-flat`: circulation, passages, stairs, restricted areas or nonwalkable areas use a different display treatment. Stair geometry is outside this room-block coverage check.
- `unsupported-room-enclosure`: the expected room block is absent in both modes. Consult its native enclosure diagnostics and selection mask evidence.
- `mode-discrepancy`: a block appears in only one height mode and requires renderer investigation.

The report includes native elevation, building, native level, block counts, selection mask sources and boundary diagnostics. Campus floors can contain several native elevations; their records also appear in the separate native-level views, so do not sum both scopes as unique room counts.

A partial wall-face selection mask is useful for picking a place but does not certify a closed room. Recover its complete enclosure from native walls, measured door closures or independently registered architectural partitions before adding a volume. Preserve actual floor apertures, circulation, neighbouring room identities and access restrictions.
