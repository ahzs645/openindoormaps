# Final candidate — November 2, 2026

This candidate replaces `1a127847…`. It is the corrected master with the guide
catalog from the compiler that rejects crossed door approaches
([../approach-topology/](../approach-topology/README.md)).

| Part                                  | Identity                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Master (06-388 reviewed link)         | `6e7971f8…`; reproduces entry for entry from `d4d36d18…` ([../preservation/](../preservation/README.md))                         |
| Guide catalog                         | [PREPARED-ROUTING.json](PREPARED-ROUTING.json), `1c3011ffbda15b1f38dd0ecaee52bbbd39f3133622c3d76cff16fb87c2f4487c`, 2,728 guides |
| Exported candidate (master + catalog) | `32c395e1af62235543e69effb91645a76111a6f37cfcf6c5bfd7e7bcd0db85dd`                                                               |
| Source revision                       | `e7113f8` (engine `4a0a354a…`)                                                                                                   |

## Acceptance

`verify-shared-corridor-candidate.ts` with
[../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json](../../unbc-20261031/ROUTE-CASES-CAMPUS-0388.json)
(33 cases, normal import plus serialized production-worker replay): **PASS**,
0 failures, 2,054 s, peak RSS 5.4 GB ([acceptance/](acceptance/)). All 33
outcomes (16 routes, 17 expected refusals) and distances are identical to the
previous candidate `1a127847…`. `releaseAcceptance` is still `false`.

## Rebuild

```sh
node --import tsx scripts/indoor/verify-shared-corridor-candidate.ts \
  MASTER-6e7971f8.zip PREPARED-ROUTING.json \
  docs/continuation/unbc-20261031/ROUTE-CASES-CAMPUS-0388.json OUT
```

The candidate archive (247 MB) is not committed.
