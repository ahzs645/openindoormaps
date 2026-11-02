# Visitor package for the chosen candidate — November 2, 2026

The visitor package, directions cache, receipt and browser proof are all built
from the chosen candidate in
[../../unbc-20261101/candidate/](../../unbc-20261101/candidate/README.md):
exported candidate `1a127847…` (master `6e7971f8…` with the 06-388 reviewed
link, straightened catalog `3430c871…`). The distances below come from that
candidate. The campus map artifact draws the same candidate.

| Part                      | Identity                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Progressive export        | revision `bdea9eb5…`, 7 / 7 scopes, none unavailable, 187.8 MB stored                      |
| Independent visitor JSON  | `39e9fed5dde728cb42fd3511614e1d3236bc28c6cb11bdfd14532c989f2be008` (297.8 MB)              |
| Routing projection        | `c4c3ea4f6ed2398f1ccecdb9b6152681eac0aa307cfdfc87406be06f30d5b7c1`                         |
| Display engine / runtime  | `9ee1cb8c…` (213 modules) / `807394c1…`                                                    |
| Hydrated directions cache | `dec83a46…` (8,205,781 bytes, 1,188 cells), admitted in `published-route-cell-receipts.ts` |

## Steps and results

1. **Progressive export** (`export-progressive-viewer.ts --visitor --prepare
--checkpoints`, `TZ=UTC`): exit 0 in 4,605 s, child peak RSS 4.9 GB. Source
   package, dataset and engine source unchanged
   ([PROGRESSIVE-EXECUTION.json](PROGRESSIVE-EXECUTION.json),
   [PROGRESSIVE-EXPORT-SUMMARY.json](PROGRESSIVE-EXPORT-SUMMARY.json)).
2. **Hydrated cache** (`export-published-route-hydration.ts`, normal physical
   validation repeated, 5,327 original faces, 13 route cases including
   [EXTRA-CASES.json](EXTRA-CASES.json)): passed in 980 s, peak RSS 4.7 GB
   ([HYDRATED-CACHE-PROOF.json](HYDRATED-CACHE-PROOF.json),
   [HYDRATED-CACHE-RECEIPT.json](HYDRATED-CACHE-RECEIPT.json)).
3. **Receipt admitted.** The receipt (transport URL changed to
   `/data/unbc-routing/…`, all hashes unchanged) is the first entry in
   `app/indoor-project/published-route-cell-receipts.ts`; the carrier is in
   `public/data/unbc-routing/`.
4. **Publication gate.** After `vite build --mode pages` with
   `SITE_DEMOS=indoor`, `check-published-directions-cache.ts` on the built
   public root passed: `currentCompiledReceiptMatches: true`,
   `exactCarrierInventoryAndPolicyDecodePassed: true`, 64 s
   ([DIRECTIONS-CACHE-CHECK.json](DIRECTIONS-CACHE-CHECK.json)).
5. **Browser proof** with [proof-chosen-candidate.mjs](proof-chosen-candidate.mjs)
   (Chromium, cold page, desktop 1440×900 and iPhone 13): all three journeys
   shown, no page errors ([browser/](browser/)).

### Normal replay on the visitor data ([NORMAL-ROUTE-SUMMARY.json](NORMAL-ROUTE-SUMMARY.json))

| Case                     | Result                                             |
| ------------------------ | -------------------------------------------------- |
| 04-204 → 08-267, default | 120.961 m, crosses door 2311764                    |
| 06-388 → 06-364          | 34.356 m, uses the reviewed link 1780077 → 1779222 |
| 04-255 → 08-272          | 186.350 m                                          |
| Ten October 18 cases     | nine routes, step-free refusal kept                |

The October 18 case named `unavailable` (08-264 → 10-2006) returns 83.948 m
under this publisher's calculator, as it did for the earlier 46-guide
hydration. The name is historical; the visitor's default hallway-only
setting is what refuses the Building 08–10 Floor 2 journey (see
[../../unbc-20261101/connections/](../../unbc-20261101/connections/)).

### Browser timings (seconds from the request until the route is shown and the floor is ready)

| Journey                            | Setting               | Desktop      | Mobile       |
| ---------------------------------- | --------------------- | ------------ | ------------ |
| Floor ready after page load        | —                     | 7.0          | 6.1          |
| 04-204 Corridor → 08-267 Corridor  | default, hallway-only | 60.0 (121 m) | 56.1 (121 m) |
| 04-255 → 08-272                    | through other rooms   | 20.0 (186 m) | 17.6 (186 m) |
| 06-388 Vestibule → 06-364 Corridor | default               | 32.8 (34 m)  | 35.1 (34 m)  |

The first-route figure includes the detailed-floor preparation in the floor
worker (about 40 s, measured in
[../../unbc-20261101/latency/](../../unbc-20261101/latency/README.md)), not
only routing. It is down from 86 s on October 31, but it is still outside the
October 22 cold-start targets, so first-route latency is still open. The route
worker and the cache are no longer the main cost.

## Reproduce

```sh
TZ=UTC node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/export-progressive-viewer.ts CANDIDATE.zip OUT \
  --visitor --prepare --checkpoints --priority-scope=1450417,311,1487816
unzip OUT.independent-*.campus-viewer.zip viewer/indoor.json -d VISITOR
TZ=UTC node --max-old-space-size=9216 --import tsx \
  scripts/indoor/export-published-route-hydration.ts VISITOR/viewer/indoor.json \
  39e9fed5dde728cb42fd3511614e1d3236bc28c6cb11bdfd14532c989f2be008 HYDRATION \
  --cases EXTRA-CASES.json
# public root: openindoormaps/ -> build, data/unbc -> OUT, data/unbc-routing/<carrier>
node --import tsx scripts/indoor/check-published-directions-cache.ts \
  VISITOR/viewer/indoor.json 39e9fed5… PUBLIC NEW-CHECK.json
node proof-chosen-candidate.mjs APP_URL MANIFEST_URL OUT desktop|mobile
```

The progressive export (281 MB) and the visitor JSON are not committed; they
are reproducible from the candidate with the commands above.
