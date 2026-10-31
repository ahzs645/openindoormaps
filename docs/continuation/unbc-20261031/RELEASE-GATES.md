# Release gates attempted on October 31, 2026

These steps follow the release gates in
[the October 22 handoff](../unbc-20261022/HANDOFF.md#release-gates-still-open),
applied to the October 30 two-cell candidate
(`c757704fc5b40087a1ede7061a062292675258e7f03918c6b2d3d2546f7a1c11`) under the
committed engine on this branch. They were run in a 4-core, 16 GB cloud
container with Node 22.22.0. **Nothing was published.** The live private Site
still serves version 14.

Whether this 46-guide candidate, the earlier 2,701-guide campus candidate or a
later regenerated master becomes the release input is still a decision for the
project owner. These runs show that the new engine's release tooling works on
real UNBC data; they do not choose the release dataset.

## Summary

| Gate                                  | Status here                                                            | Evidence                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Source epoch                       | Branch `claude/dazzling-curie-id7wh1` (not yet on `main`)              | [INDEPENDENT-REPLAY.md](INDEPENDENT-REPLAY.md)                           |
| 2. Progressive export and pages build | **Passed**                                                             | [PROGRESSIVE-EXECUTION.json](release-gates/PROGRESSIVE-EXECUTION.json)   |
| 3. Directions cache                   | **Candidate built and official check passed**; receipt not committed   | [DIRECTIONS-CACHE-CHECK.json](release-gates/DIRECTIONS-CACHE-CHECK.json) |
| 4. Compiled-map admission receipt     | Blocked: no generator exists                                           | —                                                                        |
| 5. Floor-plan carriers                | Blocked on gate 4                                                      | —                                                                        |
| 6. Candidate scope and audit          | Blocked on missing 09d baseline inputs                                 | —                                                                        |
| 7. Further checks                     | Desktop/mobile directions proof passed; cold-start timing fails target | [screenshots](release-gates/screenshots/)                                |
| 8. Pair, restore and verify           | Not run; depends on the release dataset                                | —                                                                        |
| 9. Publish                            | Not possible here: needs the ChatGPT Sites tooling                     | —                                                                        |

## Gate 2: progressive export

Command (supervised, `TZ=UTC`):

```sh
node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/export-progressive-viewer.ts CANDIDATE.zip NEW_DIR \
  --visitor --prepare --checkpoints --priority-scope=1450417,311,1487816
```

- Exit 0 in 4,368 s (73 min); child peak RSS 5.91 GB.
- The committed engine binding was accepted (`3ed1eca9…`, 212 modules);
  source package, dataset and engine source were verified unchanged.
- 124 assets, 248 representations, 187.4 MB stored, all seven scopes, revision
  `61a21d81895778c817eb4e7bcd2a41e4902cf62edadf7ebdfc3cb8f580b1008f`.
- The independent visitor JSON is
  `61c805ba77eeb781b9888d2ff329917d1438b88a541ecf98fac070b3b172ef73`
  (296,590,266 bytes); the routing asset is `f7778395…`.
- `TZ=UTC` avoided the October 22 `date not in range 1980-2099` failure. The
  exporter still needs the code fix for non-UTC machines.

`npm run build:pages` and the indoor pages build (`SITE_DEMOS=indoor`) both
passed on this branch, and the regenerated bindings equalled the committed ones.

## Gate 3: directions cache

`scripts/indoor/prepare-directions-candidate.ts` on the independent visitor
JSON with 21 cases ([DIRECTIONS-CACHE-CASES.json](release-gates/DIRECTIONS-CACHE-CASES.json)):
the eight October 18 cases, the nine corridor-link cases and four 04-255 ↔
08-272 variants.

- Exit 0 in 475 s; child peak RSS 4.25 GB (11 GB heap cap).
- All 21 outcomes match their expectations. Distances equal the bound
  acceptance runs (12.216, 122.051, 122.040, 118.788, 118.631 and 178.219 m).
- The October 18 case `08-10-floor2` (08-264 → 10-2006) is still refused: the
  known Building 08–10 hallway gap.
- Carrier `b164db258857db3d314bbc97ad7101fc9baa0f5048fa58431b7fbb7a47af2a73.json.gz`
  (2,634,560 bytes, 1,188 cells); receipt in
  [DIRECTIONS-CACHE-RECEIPT.json](release-gates/DIRECTIONS-CACHE-RECEIPT.json).

The receipt was added to `app/indoor-project/published-route-cell-receipts.ts`
**only in a scratch worktree**, with the carrier at `/data/unbc-routing/` and
the progressive export at `/data/unbc/` under a local public root.
`scripts/indoor/check-published-directions-cache.ts` then passed:
`currentCompiledReceiptMatches: true` and
`exactCarrierInventoryAndPolicyDecodePassed: true`. The receipt is not
committed, because it would admit a cache for a dataset that has not been
chosen for release. To adopt it, add the receipt object with
`url: "/data/unbc-routing/<compressedSha256>.json.gz"` and publish the carrier.

## Gate 7: browser proof

`release-gates/proof-link-route.mjs` drove the built visitor app (Chromium,
desktop 1440×900 and iPhone 13) against the new export and cache:

| Journey                           | Setting                           | Desktop         | Mobile          |
| --------------------------------- | --------------------------------- | --------------- | --------------- |
| 04-204 Corridor → 08-267 Corridor | default, hallway-only             | 122 m, 18 steps | 122 m           |
| 04-255 → 08-272                   | "Allow paths through other rooms" | 187 m           | 187 m, 26 steps |

Both match the bound acceptance runs. Floors were ready in about 6 s; the
first route appeared about 86 s after the request and the second about 52 s
later. That is far outside the October 22 cold-sample targets (5/10/15/2/10 s),
so first-route performance remains a release blocker. Access warnings ("Public
access is unknown…") remain visible.

## Blocked gates

- **Gate 4.** Nothing in `scripts/indoor` writes
  `published-project-receipts.ts`; scripts only read it, and
  `data/unbc-full/project.json` has no producer. This needs a new, reviewed
  generator that admits a receipt only after a successful normal import under
  the unchanged engine.
- **Gate 5.** `export-published-visitor-plans.ts` and
  `admit-published-visitor-plans.ts` require gate 4.
- **Gate 6.** The 09d baseline visitor, its oracle directory,
  `stationary-alias-evidence.json` and four algorithm-binding files are still
  missing, as recorded on October 22.
- **Gate 9.** Publication uses the ChatGPT/OpenAI Sites project; those tools
  are not available from this environment.

## Large artifacts not committed

The progressive export (280 MB), the independent visitor checkpoint and the
cache carrier were produced in this container only. All are reproducible from
the Drive candidate with the commands above; the carrier and its receipt hash
are recorded here.
