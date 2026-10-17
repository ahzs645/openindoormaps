# Portable development download and source connection inspection

The download page `/openindoormaps/#/projects/download?package=%2Fdata%2Funbc-full%2Fproject.json`
now discovers an optional development snapshot from the published map descriptor.
It downloads no geometry merely to show this offer. On request it verifies both
source archives and reuses the existing checksummed visitor parts, then assembles
a ZIP locally. No package import, floor preparation or direction workers start.

The snapshot contains complete tracked source trees from both repositories,
exact commits/branches/public repository URLs, the current 45,519,753-byte visitor,
README, release/checksum manifest and Python restore script. Git history,
reinstallable node_modules, scratch caches and credentials are excluded. Source
trees use XZ compression and content-addressed 20 MiB transport parts; the outer
ZIP stores already-compressed inputs. The map remains stored only once on the
site. The verified combined download is 116,526,015 bytes (116.53 MB). The deployed
manifest is authoritative for source/input bytes; outer ZIP timestamps may vary. Personal browser preferences are not
part of the published map.

**This is not the missing complete native-authoring backup.** The latest
1,271,906,669-byte handoff archive, original RVT bytes, enriched native cache and
failed-build checkpoints remain absent. The visitor has only four entries and
contains none of those authoring inputs. `nativeRebuildReady` is false and the
missing-input identities/recovery reference are included in every snapshot.
Viewer/app development can resume elsewhere; source geometry repairs need actual
native inputs restored. The historical October 14 Drive master is identified as
historical, not silently substituted for the missing newer master.

## Paired publication procedure

Keep the repositories adjacent. Finish targeted tests and the production build;
commit and push both source branches. In the private Sites checkout, replace
`dist/openindoormaps` with that build and record the same source commit in
`.openai/source.json`. Then run from OpenIndoorMaps:

```sh
python3 scripts/indoor/package-development-snapshot.py \
  --site-root /workspace/unbc-site \
  --reviter-root /workspace/reviter \
  --cache /workspace/scratch/unbc-development-cache \
  --gzip-only-progressive
```

This archives both clean exact HEADs, writes source parts and the development
manifest, attaches it to the visitor descriptor, and checks all map/source bytes.
The optional gzip-only migration removes raw Brotli duplicates from the legacy
progressive export while retaining every logical asset, its gzip alternative,
provenance and genuine historical engine identity. It does not regenerate native
floors, relabel obsolete preparations or reduce current geometry precision.
The full viewer and binary preview are unaffected by that transport cleanup.

Generate normal-URL publication checks including the new manifest and every
source part. Test the actual development download and `python3 restore.py` in a
fresh directory, compare restored source files and map SHA, then run:

```sh
python3 scripts/indoor/package-development-snapshot.py \
  --site-root /workspace/unbc-site \
  --reviter-root /workspace/reviter \
  --cache /workspace/scratch/unbc-development-cache \
  --verify-only --archive /workspace/scratch/unbc-paired-site.tar
```

The final guard refuses dirty or changed repository HEADs, mismatched map/source
parts, hashes, sizes and hosting-budget excess. Commit and push the private Site
source, save that exact archive/commit through Sites, and deploy privately.
Repeat pairing after every source/publication change. Never publish a new viewer
with a stale development offer. Native deployment success and signed-in content
verification are separate: do not claim a successful anonymous check when the
owner-private site returns 403. Browser-control tooling was unavailable for this
iteration; new rendering and mobile screenshots remain pending.

## Connection inspection and remaining pathway work

`paths=1` retains teal centerlines and amber dotted **room** door approaches.
Internal passage/vestibule thresholds and their saved branches are solid teal.
Purple original-source lines and labelled stops add saved lift/ramp/local-stair
and cross-building connections. Zero-XY lift edges get floor-labelled markers
instead of invented horizontal lines. `heldPaths=1`, also an optional checkbox,
shows held stair links for inspection only; it never enables them for directions.
Unknown access is not certified by any of these layers. Scope changes empty the
new source with the other floor sources. The complete value survives bounded
resident-floor caching and new preparation fingerprints invalidate old outputs.

The reproducible source audit is:

```sh
node --import tsx scripts/indoor/audit-path-network.ts \
  /path/to/visitor-indoor.json /path/to/topology-report.json
```

[PORTABLE-CONNECTION-AUDIT.json](PORTABLE-CONNECTION-AUDIT.json) binds the exact
unchanged indoor SHA. It inspects all five floor scopes, source direction,
walkability, owner access, original vertical edges and cross-building links.
There are four enabled ramps, 43 enabled elevator edges, one enabled local-steps
edge, 28 disabled full stair edges and 40 saved cross-building edges. These are
source edge counts, not unique staircases or newly calculated navigation tests.

The all-walkable saved graph has 207 strongly connected components. Its largest
has 4,775 nodes spanning buildings 03–10 and Floors 1–4; other destinations remain
separate. This mode permits ordinary-room transit and unknown access. The
conservative passage-only diagnostic has 1,396 components: it requires **all**
edge owners to be passage/stair areas, and therefore omits many shared-cell edges
with mixed owners. This is not the runtime's reviewed-through policy graph and
must not be presented as a count of actual failed journeys. Neither diagnostic
runs native clearance, source review, access zones or step-free validation.

Continue with a concrete disconnected original chain/connector at a time, retain
its complete physical/policy context, repair supported source evidence and rerun
that route up/down where relevant. Restore the missing native inputs before
trying to admit held stairs. Floor 4 step-free coverage and all-building physical
connectivity remain unresolved. Preserve both lost admitted arrivals and the
failed rebuild guard. This publication changes inspection/transport, not route
authority or source geometry.

Focused verification: 43 Node tests cover current source/download hashes,
publication mismatch/tamper/cancellation refusal, lift/ramp/held/source filtering,
independent URL flags, scope cleanup, resident-floor round trip and shared-guide
regressions. A Python fixture additionally exercises real paired Git archives,
fresh restore, overwrite refusal and dirty-source/map-drift publication guards.
Typecheck and production build are required again after substantive edits; do not
repeat complete native imports merely for these display/transport changes.

Published as private Site version 13 from Site source `991048d32c3b9d61c4b8868456afee1d9602cad1`.
The 37 authenticated normal-URL checks passed, including same-origin canonical
redirects. See publication-v13.json and publication-v13-checks.json. The source
snapshot contains the exact published runtime commits; these documentation-only
publication receipts were recorded afterward. Browser rendering remains unchecked.
