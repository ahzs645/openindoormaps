# Where the UNBC routing work stands — November 2, 2026

**A tested development candidate. It is not a release.** All work is on the
development branches `claude/dazzling-curie-id7wh1`:

- OpenIndoorMaps: 50+ commits ahead of `main`, last updated at this page's
  commit.
- Reviter: `2e7875d`, 6 commits ahead of `main`.

None of it is merged to `main`. Nothing is published to the live Site. The
candidate's package record is `EXPORTED_CANDIDATE_NOT_ACCEPTED_RELEASE`, with
`releaseAcceptance: false` and `published: false`.

Status words used below:

- **implemented**: in code on the development branch, with tests.
- **verified**: checked on the final candidate with recorded evidence.
- **proposed**: evidence only, nothing applied.
- **refused**: an intended refusal under a stated policy.
- **unconfirmed**: the data cannot tell.
- **published**: nothing is.

## The candidate

One candidate feeds every result below: master `6e7971f8…`, catalog
`1c3011ff…`, candidate `32c395e1…`, visitor `6abc227a…`, manifest revision
`fa6d2935…`, directions cache `3d27eaa5…`, and the progressive-floor and seven
2D-plan receipts. The app is at `233bee9` with Reviter at `2e7875d`. The
campus map artifact (version 9) shows the same candidate. See
[final-candidate/](final-candidate/README.md) and the single identity report in
[final-proof/](final-proof/README.md).

## Results

| Area                                          | State                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Building connections                          | **Verified, partly.** 08-264 ↔ 10-2006 (Buildings 08–10, Floor 2) routes under the visitor default (arrive inside the room, no shortcuts through other rooms): 83.948 m through door 1499373. Only hallway arrival without shortcuts refuses it. 08-267 ↔ 10-2066 routes at 34.019 m and 04-204 → 08-267 at 121 m. Floor 3 door 2315416 (Buildings 04–08) is still unmatched.                                       | [final-candidate/](final-candidate/README.md)                                                              |
| 06-388 island                                 | **Verified.** 8 of 16 rooms route by default through the reviewed link; the other 8 (06-372 to 06-386) need shortcuts through another room, which is an access decision. No step-free route is confirmed in the current data; that is not proof that none exists physically.                                                                                                                                          | [final-candidate/](final-candidate/README.md)                                                              |
| Test evidence                                 | **Verified.** 33 acceptance cases (16 routes, 17 expected refusals). 160 policy cases (18 room pairs × directions × settings): normal and worker agree on every recorded field and meet explicit expected outcomes (78 routes, 82 refusals). 8 browser journeys pass on the final interface, desktop and iPhone 13 emulation, 2 cold runs each, no page errors. CI covers code and map checks, not these campus runs. | [final-proof/](final-proof/README.md)                                                                      |
| Visitor speed                                 | **Verified, local only.** On the final interface, the first route has its floor ready in 16.5–20.7 s (55–57 s before plans), later routes 1–9 s, opening floor 5.0–6.3 s. Mobile is Chromium emulation on a shared 4-core host with a local server, not a physical phone. A visitor who zooms in right after opening waits about 19 s from the start of the zoom (was about 10 s).                                    | [final-proof/](final-proof/README.md), [lazy-plan/](lazy-plan/README.md)                                   |
| Compiler                                      | **Implemented.** Crossed door approaches are rejected (networks with conflicts 16 → 10; the remaining 10 also conflict in the legacy geometry; 9 self-touching guides remain). This is a safeguard, not a full cleanup: compared with reference graphs, our corridor lines still have far more turns and short runs.                                                                                                  | [approach-topology/](approach-topology/README.md), [reference-comparison/](reference-comparison/README.md) |
| Map checks                                    | **Implemented.** Exact zero-margin door clipping. 490 "display contacts to review" (116 on accepted guides, 374 on saved walks) are display-coordinate contacts, not proven wall crossings.                                                                                                                                                                                                                           | `../unbc-20261031/campus/map/regularize/`                                                                  |
| Reviter native matcher                        | **Implemented, inactive.** Explicit accepted and rejected reviews take precedence. A rejected review keeps the legacy result; it does not force an already connected door closed. Not wired into the pipeline; its 18 fills are proposals.                                                                                                                                                                            | Reviter `native-cell-owner-audit-20261101/`                                                                |
| Door 2471813 (10-1300 ↔ 10-1302)             | **Proposed.** All four frame members are found. Element 2472128 is a real 100 mm wall that the plan cut still draws across the door, so an aperture review alone will not open it.                                                                                                                                                                                                                                    | [source-evidence/](source-evidence/README.md)                                                              |
| Door 2315416 (08-360 ↔ Building 08, Floor 3) | **Proposed.** The strip is empty in the model, and the RVT holds no native room data. Ownership (08-316, an unnamed vestibule, 08-305) needs a drawing or site check. The 50 mm sill is model-derived.                                                                                                                                                                                                                | [source-evidence/](source-evidence/README.md)                                                              |
| 03-1052                                       | **Proposed.** The pocket joins cell 601 only through 4 mm slivers and point contacts. Both doors' nearest rooms are out of matcher reach; a curtain-aperture review is an option.                                                                                                                                                                                                                                     | [source-evidence/](source-evidence/README.md)                                                              |
| Preservation                                  | **Delivered to the owner, not yet stored.** The actual tested files went out as a ten-part bundle with checksums; a separate reassembly matched all 284 files. The master also reproduces entry for entry from the October 22 master.                                                                                                                                                                                 | [preservation/](preservation/README.md)                                                                    |

## Superseded pages

- [policy/](policy/README.md) and [visitor/](visitor/README.md) describe the
  earlier candidate.
- The browser proofs under [final-candidate/browser/](final-candidate/browser/)
  ran before the 2D plans and lazy loading were merged. Use
  [final-proof/](final-proof/README.md) for the final interface.

## Still open

- Source repairs, then a native rebuild, approach checks on both sides, and
  walking and step-free rechecks: 2471813 (including wall 2472128), 2315416
  (after the strip decision), 03-1052.
- Owner or site decisions: 06-207 doorway, 07-309 suite, 06-313 booth, held
  stairs, Rotunda as circulation, and shortcuts through 06-37x/38x rooms.
- Pathway quality gaps against the reference graphs: straight runs per
  corridor, right-angle door branches, fewer instructions, no out-and-backs.
- Real-phone measurements on a representative connection.
- Merging to `main`, the hosted `data/unbc-full` package,
  `check-published-project.ts`, live publication and an asserted proof on the
  host.
