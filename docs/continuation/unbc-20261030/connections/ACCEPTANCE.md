# Rebuilt connection acceptance — October 30, 2026

The earlier local worktrees and their patch archive were removed by workspace
maintenance. This is a new implementation on OpenIndoorMaps base
`b227739977bcc0ba9e33e8f61ad8ae31f2557bdd`. Previous outcomes are useful hypotheses;
they are not current verification evidence.

## Current status

The strict case, parity and coverage helpers are implemented. Eighteen focused
unit checks passed in this new worktree. Full normal import/export and production
worker replay are **pending** the recovered immutable input and final source
freeze. No new campus connectivity, source correction or publication is claimed.

## What the implementation checks

`scripts/indoor/verify-shared-corridor-candidate.ts` retains its complete normal
authoring-master import and normal candidate export, including original source
member byte comparisons. It installs only a valid, source-bound shared-corridor
guide catalog. It does not restore validation authority from a diagnostic JSON
or borrow a previous receipt.

The new `shared-corridor-acceptance.ts` helper requires explicit arrival and
ordinary-room-transit choices, rejects unsupported policy fields, and compares
guide-enabled and guide-disabled calculations. Complete diagnostics, reachable
sets, arrival availability and refusal messages must agree. Available routes
must keep their original edge values and sequence, node traversal, doorway list,
unknown-access areas and unknown-accessibility count. A configured required
original edge must occur in both complete routes. No forced waypoint is added.
Walking guides cannot establish strict step-free clearance.

The unchanged production route worker is bundled with a Node message adapter,
receives the actual serialized `routeWorkerDataset`, and is compared against
each complete normal calculation and its navigation instructions. Request IDs
must agree; worker failure, timeout or early exit cannot pass as a result.

The new `connection-acceptance.ts` helper binds exact source master/model/room
hashes, raw case bytes, the inventory and current implementation. Each request
embeds the exact executable case, direction, source endpoints, profile and
options. One case or identical renamed journey cannot count for multiple
connections. Current normal **and** production-worker evidence is required.
Each invocation has a fresh run ID; historical results are rejected. Available,
expected-refusal, failed, not-tested and evidence-required outcomes are separate.

## Explicit scope

`ROUTE-CASES.json` contains ten Floor 2 cases, all with `endpointMode: "hallway"`:

| Journey | Transit policy | Expected outcome to verify |
| --- | --- | --- |
| 08-216 ↔ 08-260 | Hallway-only | Two available journeys through original door 2311764 |
| 04-255 ↔ 08-272, walking | Other-room transit enabled | Two available journeys through that original crossing |
| 04-255 ↔ 08-272, walking | Hallway-only | Two refusals |
| 04-255 ↔ 08-272, strict step-free | Both transit settings | Four refusals |

Every expected available case requires exact source edge `door:694:2311764` and
at least one actually used shared guide. Door ownership itself is not rewritten.
These hallway-arrival cases do not establish inside-room arrival acceptance.

`CONNECTION-INVENTORY.json` is an explicitly incomplete seed: six known gateway
priorities and 30 directional/profile requests. Ten are bound to these current
cases. Twenty requests for the Floor 3 04–08 link, the 08–10 links, the 07–08
ramp/alcove and the 09–07 Agora still require current source endpoint/doorway
evidence, complete options and justified expectations. Their identities and
outcomes are not invented to fill the inventory.

The scoped guide compile will enumerate every eligible original walk in native
cells `native-cell:14.435696:616` and `native-cell:14.435696:617` while retaining
the complete physical/policy context. This is separate from the previously
reported 2,701-guide campus candidate. One omitted or refused guide still needs
its original fallback; it does not authorize deleting an obstacle or opening.

## Reproduction

From the OpenIndoorMaps worktree, with dependencies installed, use a new output
directory and the verified run-1 master. Set paths for your machine:

```sh
SOURCE_MASTER=/absolute/path/UNBC.master.reviter.zip
RUN_ROOT=/absolute/path/new-connected-campus-run
CASE_ROOT=docs/continuation/unbc-20261030/connections

node --max-old-space-size=4096 --import tsx \
  scripts/indoor/compile-corridor-candidates.ts \
  "$SOURCE_MASTER" "$RUN_ROOT/guides" \
  --cell native-cell:14.435696:616 --cell native-cell:14.435696:617

TZ=UTC python3 "$CASE_ROOT/run-supervised.py" \
  --log "$RUN_ROOT/normal.log" \
  --memory-log "$RUN_ROOT/normal.memory.jsonl" \
  --execution-report "$RUN_ROOT/normal.execution.json" \
  --timeout-seconds 3600 -- \
  node --max-old-space-size=4096 --expose-gc --import tsx \
  scripts/indoor/verify-shared-corridor-candidate.ts \
  "$SOURCE_MASTER" "$RUN_ROOT/guides/prepared-routing.json" \
  "$CASE_ROOT/ROUTE-CASES.json" "$RUN_ROOT/normal" \
  --connection-inventory "$CASE_ROOT/CONNECTION-INVENTORY.json"
```

Freeze affected implementation and input bytes before compilation and leave them
unchanged until acceptance completes. The final checks reject a changed source,
guide input, cases, inventory or dependency binding. Use one heavy process at a
time at the task's 8 GiB memory limit. The route worker has a separate 4 GiB
old-generation cap; that is not a combined RSS limit.

The supervisor records kernel child peak RSS after `wait()` separately from the
shared cgroup peak and event deltas. Cgroup memory includes other processes and
cache. Cold first-worker preparation and warm reused-worker requests must be
reported separately. A successful scoped replay is not whole-campus release
acceptance and does not admit new progressive, route or plan publication assets.
