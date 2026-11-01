# Visitor route latency (46-guide candidate), 2026-11-01

Results: `latency-results.json`. CPU profiles, screenshots and raw timing logs
are under `/home/user/unbc-work/agents/latency/` (not committed; 49 MB).

## Cause

Route-worker CPU profiles (Chromium, CDP attached to the worker before it runs):

- The admitted directions cache (`b164db25…`) had no `hydration` section. Each
  worker therefore recomputed the policy snapshot (about 6.5 s, twice, for the graph
  and the prepared-routing key), the material query (11–13 s) and the
  resolved-geometry binding (1.1 s) before it could centre one route.
  Validation did not fall back to `validateIndoorDataset`.
- Delivery integrity checks hashed the 195 MB routing asset with portable
  SHA-256: about 9.6 s per load.
- The page releases the route worker when the detailed floor is prepared
  (`progressive-visitor-page.tsx`, memory policy in `heavy-worker-schedule.ts`).
  The second request then starts a fresh worker and repeats all of the work above.
  A kept worker would answer the second journey in about 5–7 s (Node harness).

## Change

1. `progressiveSha256Async` / `verifyProgressiveAssetBytesAsync` /
   `parseVerifiedRoutingDatasetAsync`: compute the same SHA-256 digests with
   WebCrypto. Every check is kept. The display engine binding is unchanged; the
   route runtime binding is regenerated.
2. A hydrated cache was produced with the existing
   `scripts/indoor/export-published-route-hydration.ts` for the same dataset
   and the new runtime. Its receipt was admitted on this branch only, as the
   scratch candidate receipt was before. See `HYDRATED-CACHE-*.json`.

The memory policy that releases the worker was not changed.

## Reproduce

```sh
# build (worktree), then serve a root with openindoormaps/ -> build,
# data/unbc -> progressive export, data/unbc-routing/<carrier>
TZ=UTC SITE_DEMOS=indoor flock /home/user/unbc-work/agents-heavy.lock node --max-old-space-size=3072 \
  --import tsx node_modules/vite/bin/vite.js build --configLoader native --mode pages --outDir BUILD
TZ=UTC flock /home/user/unbc-work/agents-heavy.lock node tools/profile-route.mjs \
  http://127.0.0.1:PORT/openindoormaps/ http://127.0.0.1:PORT/data/unbc/manifest.json OUT desktop LABEL [--profile]
TZ=UTC flock /home/user/unbc-work/agents-heavy.lock node tools/node-worker-harness.mjs REPO OUT --sequence=a,b --fresh
node tools/attribution.mjs OUT.json label=FILE.cpuprofile ...
node tools/summarize-timings.mjs OUT.json before=DIR after=DIR
```

`tools/profile-route.mjs` uses the same UI actions and journeys as
`release-gates/proof-link-route.mjs`. It also records worker messages. With
`--profile` it collects one CPU profile per route worker and defers worker
termination until the profile is saved. Use runs without `--profile` for timing.

## Measured (minified builds, local Chromium, 2 cold runs each, medians in s)

| Journey                   | Mode    | Status shown before → after | proof "shown+ready" before → after |
| ------------------------- | ------- | --------------------------- | ---------------------------------- |
| 04-204 → 08-267 (default) | desktop | 46.4 → 10.9                 | 86.1 → 50.8                        |
| 04-204 → 08-267 (default) | mobile  | 46.5 → 10.2                 | 87.2 → 49.5                        |
| 04-255 → 08-272 (transit) | desktop | 47.4 → 13.4                 | 48.8 → 15.1                        |
| 04-255 → 08-272 (transit) | mobile  | 48.3 → 13.2                 | 50.3 → 15.2                        |

Worker responses are byte-identical in every variant: corridor `67135bb6…`,
122.05 m, 18 steps; transit `064bda84…`, 187.24 m, 26 steps.

After the first route, about 40 s of "shown+ready" comes from preparing the
detailed floor (progressive-floor worker, mostly engine-bound
`decodePreparedDisplayAsset`), not from routing. That time is unchanged here.
