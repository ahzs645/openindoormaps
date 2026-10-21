# Current original-source census for all28 held stair assemblies

The complete original3666-page RVT was freshly read once for all38 runs. The census completed in 329.7s, including 55.8s for source context creation. No station points, exact-solid certificates, served approaches or clearance queries were proposed.

All38 original face/history censuses pass:7,537 faces and605 typed treads. The source model/schema and every requested run/definition frame remain bound to the exact original bytes; comparison with the retained original-source inventory has zero differences.276 original tread UV coedge discrepancies and144 typed/physical height discrepancies remain reported. These are retained facts, not waived body gates.

| Recorded group | Actual runs | Named risers pass | Placed envelope/localization available |
| --- | --- | --- | --- |
| multi-run-landing-contract-required | 20 | 10 | 20 / 20 |
| curved-physical-source-consumer-required | 1 | 0 | 0 / 0 |
| current-axis-only-station-contract-insufficient | 5 | 5 | 5 / 5 |
| original-typed-riser-consumer-mode-required | 6 | 0 | 6 / 6 |
| flags6-vertical-side-consumer-required | 2 | 2 | 0 / 0 |
| priority-source-proof-and-current-policy-integration | 1 | 1 | 1 / 1 |
| source-derived-station-proposal-ready | 3 | 3 | 3 / 3 |

Current named-riser predicates pass21/38 runs. The17 failures are7 begin/end/ordered-riser layout refusals,7 consecutive named-index refusals and3 finite-boundary orientation refusals. The10 multi-run assemblies need more than an assembly receipt:10/20 constituent runs also retain a current named-riser refusal. All six recorded typed-mode runs still refuse.

Placed obstruction envelopes and material localization are available on35/38 runs. The curved1298203 retains unsupported original carrier/branch/primitive refusal.1693335 and2349454 retain original face/plane/hole semantic refusals. An obstruction envelope is a conservative material superset; none of these results certifies the exact physical body, floor support, full human clearance or a route.

Each module imported by this bounded replay is retained in `implementation-snapshot/`. The parent extended terminal APIs in the station module concurrently. `riser-function-equivalence.json` verifies that the executed named-riser function and its rational helpers remain byte-identical; the other four source module snapshots match the filesystem. The receipt explicitly separates imported snapshot hashes from later filesystem hashes.

Reproduce from `/workspace/reviter`:

```sh
node --max-old-space-size=4096 --experimental-strip-types \
  --import ./scripts/register-test-typescript.mjs \
  /workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/all-held-current-source/replay.mts \
  /workspace/scratch/all-held-current-source-replay/census.json
```

Set `UNBC_ORIGINAL_RVT` if the recovered original location differs. The script saves each completed row and retains unavailable outcomes. `census.json` contains every actual run, source frame hashes, native bottom/top planes, terminal layout, exact refusal messages and separate timings. All28 graph links remain held.
