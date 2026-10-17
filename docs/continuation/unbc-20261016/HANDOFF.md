# UNBC: start here for the next AI

This is the consolidated continuation for the October 14–16 work in
OpenIndoorMaps and its sibling Reviter. Read both repositories' `AGENTS.md`,
this file, [the compiler handoff](https://github.com/ahzs645/reviter/blob/main/docs/UNBC-HANDOFF-2026-10-16.md),
and [the local repair loop](../../indoor-local-iteration.md).

## Current state

**The live viewer works; the new source rebuild failed. These are different
artifacts. Do not publish the failed rebuild or claim the stairs were enabled.**

| Item                         | Current identity and status                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Live Site                    | https://openindoormaps-unbc-map.ahzs6455.chatgpt.site/ ; version 10, release `5ea7856475a6`, existing private audience retained               |
| Live Site source             | `79459660625a721ce8135ae350fb07e9c8cf23e2`, in the separate Sites source repository, not either GitHub repository                             |
| Download                     | https://openindoormaps-unbc-map.ahzs6455.chatgpt.site/download/ ; 45,290,239-byte visitor ZIP                                                 |
| Publication status           | https://openindoormaps-unbc-map.ahzs6455.chatgpt.site/publication/ ; 31 ordinary live URLs and assembled ZIP checked                          |
| Published ZIP SHA-256        | `6cb0ff0f40efd478d3058da29fa2a1bcd3cb16419042f3d5b8567c9c7f7cee22`; exported 2026-10-15T15:35:28.571Z                                         |
| Published indoor JSON        | `f4761c369fd010e48b95e18a467b3adae76723220523b4cf54821f10bc2cafd8`                                                                            |
| Published preparation engine | `681e71a5b49b7ac79d914f79624be41cea860778d5732289cd2a445e7c2a0d8d`; 179 ordered modules                                                       |
| Historical authoring master  | `/workspace/scratch/unbc-review-20261014/UNBC.master.reviter.zip`; SHA-256 `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520` |
| Original RVT SHA-256         | `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`                                                                            |
| Failed rebuild               | `unbc-native-v3-r2-resume1`; code 1, no complete candidate, no new export or route approval                                                   |

The original process PID 211379/start ticks 14589601 has ended. At
2026-10-17T01:02:51Z (October 16, 6:02 p.m. Vancouver), it failed
`Existing physically admitted arrival connections must survive regeneration`
at `scripts/indoor/regenerate-from-native-cache.ts:619`. Lost arrivals:

- `rm-694-0bed6b73a3bd` (05-S204 in the saved destination inventory).
- `rm-694-504b25e5319a`.

The completion receipt says `sourceUnchanged: true`, `outputs: []`,
`completeCandidate: false`. Source replay outputs and all nine completed physical
floor checkpoint pairs exist, but they are not an accepted map. Read
[the exact completion receipt](failed-rebuild/regeneration-v3-r2-resume1-completion.json)
and [the actual log](failed-rebuild/regeneration-v3-r2-resume1.log).
Never waive the preservation assertion to obtain an export.

## Work preserved in main

Both original working trees were preserved in source snapshot commits before
consolidation: OpenIndoorMaps `e10ef50f802965e50bdaaca89e9af839c351c2e6`,
Reviter `25bd696f2a5d8085be26fa5bc84aa978a13edb40`. These recover the failed
run's source version. Main also incorporates the separately tested/published
viewer changes, without copying its older physical compiler over newer source.
Final source-validation details are in [CHECKS.md](CHECKS.md).

Completed features and investigations:

- Grey building overview, walls and windows; automatic room reveal restored,
  with a persistent overview option. Column visibility and conservative display
  simplification remain options. Display cleanup grants no route or enclosure
  authority; preserve real apertures, narrow geometry and room identities.
- Overview-first progressive delivery, per-floor prepared display, lossless
  pooled/binary metadata, compressed assets, checked caches and explicit offline
  app/map downloads. The complete full viewer still downloads the whole ZIP.
  Its decoded-floor cache bound does not bound active graph, picking or GPU RAM.
- Full viewer hallway-side endpoints by default. It tries hallway transit first,
  retains a checked ordinary-room fallback, chooses among admitted entrances,
  and supports explicit inside-room overrides. Geometry, original owners,
  directions, access and finite portal checks remain mandatory.
- Model-bound, reversible exclusions for stairs 1842431, 1460777, 1821194,
  1523099, 1844188, 1728649 and 1727059. Their source geometry remains visible;
  an exclusion cannot enable a route. 08-S401 has a labelled unconnected landing
  marker, not an approved complete upward connection.
- Resident routing-graph reuse, skipping unused inside-room alternatives for
  hallway requests, bounded centering with conservative recovery, stable floor
  layer identities, and lazy exact-hit worker initialization. Visitor review
  controls are hidden. Cold floor/loading/directions can still take minutes.
- A download-only route checks the mutable publication descriptor, each part and
  complete ZIP, then offers Save. Cancel/retry/recheck work without floor or route
  preparation. Current viewer settings are browser state, not new ZIP geometry.
  Prior UNBC assets are retained so open tabs can finish previous imports.
- Converter extraction repairs recover large records beyond the old 65,535-byte
  scan limit, avoid simultaneous real/fallback bodies and select supported
  alternatives; a header-boundary repair is also retained. Saved original-RVT
  comparisons improve 96-flight IFC correspondence. Those 96 flights are not
  the 28 held routing links, and extraction success is not clearance approval.
- Native source wall/door/column/material evidence, exact floor/support and
  source ownership guards, drawing-reference handling, local replay tools and
  strictly scoped stepped-stair proposals. The user confirmed imported DWGs
  are drawing references only; retain the model-bound reviewed evidence.

## Verified navigation and remaining limits

Actual published-calculator checks include same-floor 05-136↔05-173,
outside-door 05-173↔05-174, an inside override, exclusion equivalence and Library
east lift 05-143↔05-242. Eight moving cases and two expected refusals are saved
in [the calculator receipt](release-evidence/qa/actual-navigation.json).
The ten-case evidence contains retained completed cases and a documented resume;
do not describe it as one uninterrupted fresh run against the consolidated main.

Desktop/mobile Chromium verified the published UI, settings, lift floor previews
and downloads. [Hallway](screenshots/hallway.png),
[lift floor 1](screenshots/lift-floor-1.png),
[lift floor 2](screenshots/lift-floor-2.png) are actual accepted captures.
Early blank floor captures and older replayed route images do not establish a
new calculator/render pass. Physical-phone performance was not measured.

**All 28 held stair links remain disabled.** Some existing local steps and the
Library lift work, but they do not certify those links. 08-S401 upward routing,
every destination, all pathway combinations and broad step-free coverage are
not complete. Earlier missing-entrance/isolated-destination counts are tied to
their historical datasets; obtain a fresh accepted audit before quoting them
as current regenerated coverage.

Outdoor audit: [REPORT.md](outdoor/REPORT.md),
[seven-assembly inventory](outdoor/seven-assembly-inventory.json) and
[sealed receipt](outdoor/receipt-v2.json). All seven excluded assemblies have no
matching saved graph edge or room-bound flight. Historical review identifies
1842431/1460777 as outdoor and 1801478/1779473 as tiered seating. Other five
exclusions remain unclassified. Regeneration drops these context labels because
they lived only in derived source-flight objects. The isolated retention helper
passes eight tests and selected nine-flight geometry parity; it is not wired
into the authoring/compiler pipeline. Do not infer outdoors from nearby
buildings, level spans or exclusion preferences.

## Next work, in order

1. Diagnose the two lost arrivals using the retained source/replay/checkpoint
   evidence and the full affected cell/plane context. Compare original owners,
   source doorway/flat-landing attachment, exact support, holes, material vetoes
   and public policy. Use `candidate-arrival-loss.ts` and the relevant source
   replay predicates; do not run the entire campus flow after every edit.
2. For a demonstrated repair, test the changed predicate plus genuine positive
   and refusal cases, replay the affected current cell/physical elevation and
   related up/down/access paths, then batch stable repairs. Retain every foreign
   obstacle, real hole and original owner. A narrow diagnostic is not authority.
3. Finish reviewed stair body/terminal/clearance/current-cell qualification and
   the separately prepared stricter consumer adoption. The saved R2 coordinator
   and adoption plans are gated on a complete successful candidate; their old
   publication tail must not run over version 10. They are evidence/plans, not
   commands to execute blindly. No certificate labels or boxes substitute for
   original finite source surfaces and a complete clearance census.
4. Persist typed validated stair-context review in authoring metadata; pass it
   into both `prepareIndoorStairDisplay` calls and apply the retained helper
   inside that builder. Add authoring round-trip/compiler tests first. Adopt
   only the four previously reviewed contexts; do not classify all exclusions.
5. Once stable, perform one final coherent regeneration, preservation/source
   validation, actual navigation and production-worker/browser acceptance.
   Rebind dataset/engine/preparation/cache identities. Never reissue historical
   caches under new hashes or force old checkpoints through changed inputs.
6. Publish a new map package only after those checks. Rebuild progressive
   assets, directions cache and offline inventory against the accepted source;
   test ordinary production URLs plus desktop/mobile actual painted floors.
   Preserve existing Site identity/audience. The current Site total is close
   to its 256 MiB static limit; measure before appending larger outputs.

## What the next AI needs

- **Same workspace:** source is in the sibling repositories; existing map,
  cache, evidence and checkpoints remain under `/workspace/scratch`. No need
  to upload the large files again. Start with this handoff and the manifests.
- **A separate workspace, UI-only:** clone both main branches. The published
  visitor ZIP is enough for normal map viewing/routing investigations, but has
  no original source scene or full authoring evidence.
- **A separate workspace, compiler/stair/source repairs:** use the separately
  provided checksummed `UNBC-data-handoff-20261017.tar.gz` plus its README/manifest and
  final source commits. It includes the historical authoring master, failed-run
  input, enriched cache, reviewed dependencies and physical checkpoints. The
  failed input and historical master are not interchangeable with a new export.
  Rebuildable multi-gigabyte private import bodies and other explicitly listed
  optional caches may be omitted; the manifest names omissions and provenance.

Clone the repos as adjacent `openindoormaps` and `reviter` directories because
source tests/tools deliberately import the sibling compiler. Install from each
lockfile. Keep exact input bytes and distinguish historical snapshot hashes from
new main. Large RVT/GLB/cache/package data belongs in the transfer archive, not
Git. The public download is a visitor artifact, not the full authoring package.
