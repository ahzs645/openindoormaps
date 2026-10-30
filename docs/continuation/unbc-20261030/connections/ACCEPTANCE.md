# Rebuilt connection acceptance — October 30, 2026

The earlier local worktrees and their patch archive were removed by workspace
maintenance. This is a new implementation on OpenIndoorMaps base
`b227739977bcc0ba9e33e8f61ad8ae31f2557bdd`. Previous outcomes are useful hypotheses;
they are not current verification evidence.

## Current status

The fresh full normal import, candidate export and serialized production-worker
replay **passed**, with supervisor exit status 0 at **22:04:30 UTC on October 30**.
The run ID is `6125723b-ff0a-4506-ade1-e09b49d2e79b`. All ten declared requests
passed both their normal guide-on/off comparison and their production-worker
comparison: **four available walking calculations and six expected refusals**.
These are ten requests checked through two execution paths, not twenty separate
connection proofs. Eighteen focused unit checks, scoped strict TypeScript and
scoped ESLint also passed in this worktree.

The connection inventory remains **INCOMPLETE**: ten of its 30 requests are
checked; twenty require source and route evidence. The inventory itself is an
incomplete campus seed. This scoped result does not claim a complete campus,
confirmed public or step-free access, or publication.

The current receipts are [CURRENT-ACCEPTANCE.json](CURRENT-ACCEPTANCE.json),
[CURRENT-CONNECTIONS.json](CURRENT-CONNECTIONS.json),
[CURRENT-ROUTE-SUMMARY.json](CURRENT-ROUTE-SUMMARY.json) and
[CURRENT-EXECUTION.json](CURRENT-EXECUTION.json).
[CURRENT-EVIDENCE.json](CURRENT-EVIDENCE.json) records the exact file hashes and
the retained candidate ZIP. Raw case and inventory bytes are unchanged.

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

| Journey | Transit policy | Current normal and worker outcome |
| --- | --- | --- |
| 08-216 ↔ 08-260 | Hallway-only | Available in both directions, 12.216 m each; original door 2311764 verified; one shared guide used |
| 04-255 → 08-272, walking | Other-room transit enabled | Available, 178.219 m; original crossing verified; three shared paths used |
| 08-272 → 04-255, walking | Other-room transit enabled | Available, 177.608 m; original crossing verified; three shared paths used |
| 04-255 ↔ 08-272, walking | Hallway-only | Two expected refusals, including unchanged full diagnostics and source witnesses |
| 04-255 ↔ 08-272, strict step-free | Both transit settings | Four expected refusals: no confirmed step-free route |

Every available case traversed exact original source edge `door:694:2311764` in
both the complete guide-enabled and guide-disabled routes and used at least one
shared guide. The serialized worker matched the complete normal calculation and
navigation instructions. Door ownership itself was not rewritten. These
hallway-arrival cases do not establish inside-room arrival acceptance.

The available Public/walking calculations retain their source review flags.
Each short crossing has eight flagged unknown-access areas and three
unknown-accessibility edges; each longer journey has seventeen and forty-one,
respectively. Those flags agree with the guide-disabled calculation. An
available walking calculation therefore does not certify that access is open to
the public or that the journey is step-free. The strict step-free refusals remain
intact.

`CONNECTION-INVENTORY.json` is an explicitly incomplete seed: six known gateway
priorities and 30 directional/profile requests. Ten are bound to these current
cases. Twenty requests for the Floor 3 04–08 link, the 08–10 links, the 07–08
ramp/alcove and the 09–07 Agora still require current source endpoint/doorway
evidence, complete options and justified expectations. Their identities and
outcomes are not invented to fill the inventory.

The fresh scoped guide compile enumerated every eligible original walk in native
cells `native-cell:14.435696:616` and `native-cell:14.435696:617`, retaining the
complete physical/policy context. It compiled **46 of 47** eligible walks: 40 of
41 in cell 616 and all six in cell 617, with 29 and five terminals respectively.
Both cells were compiled in this run; no previous checkpoint was reused. See
[SCOPED-COMPILE.json](SCOPED-COMPILE.json).

The uncompiled guide is
`native-cell:14.435696:616:walk:arrival:rm-694-3eff6106de76|door:694:1998054:1`,
refused for `sampled-graph-disconnection`. Its original physical edge remains
unchanged. The ten journey checks do not constitute a dedicated replay of every
eligible edge or every refused guide pair. This 46-guide candidate is separate
from the previously reported 2,701-guide campus candidate; it does not replace
that entire catalog or authorize deleting an obstacle or opening.

## Preservation and current bindings

The compiler verified that the source graph and geometry were unchanged. The
normal acceptance verified source graph, geometry and policy invariance after
the route replay. All five preserved source assets are byte-identical in the
candidate export: native model, room geometry, georeference, scene and binary
review companions. All 27 previously held stair transitions remain held.

| Bound artifact | SHA-256 |
| --- | --- |
| Original master | `d4d36d188dd635cae7d4225abdb1a3707eed6427180e072f64fc59f4ea006dfc` |
| Raw case bytes | `17050ea9a57f1a0e7095e53f915e9d1307458da797958a6ab6e7babe5a06a9f0` |
| Raw inventory bytes | `fada61e37d3bf6838ccd835d05cc1f2e9d70242c999f56449082915a5e98cf58` |
| Prepared guide catalog | `0b0ab0b1b003eff07cb4b04fab4b63a7b69b1630458a9380c9bdb03e40a05936` |
| Compiler implementation graph | `b99447af5eb944a8accbc8fd3ddd600082bbb097cdade1789eeed39c988625b0` |
| Acceptance implementation graph | `65fd6159dea6c3ae51dbb040a5265555da191e2261c111efef71356ad7517b42` |
| Exported candidate ZIP | `c757704fc5b40087a1ede7061a062292675258e7f03918c6b2d3d2546f7a1c11` |

The candidate ZIP is 247,153,509 bytes. The prepared guide catalog is 22,117
bytes. Final acceptance independently rechecked the original archive, guide
bytes, case bytes, inventory bytes and resolved implementation graph. No
compiled trust root or publication receipt was changed.

[SOURCE-FREEZE.json](SOURCE-FREEZE.json) records the initial resolved graphs and
explicit generated-binding hashes. After the completed compile, a local commit
hook reformatted whitespace in the cases, inventory and a copied browser
receipt. The exact original bytes were restored before normal replay. An
independent audit rechecked all 241 recorded files, both full input files and
both complete dependency bindings; see
[SOURCE-FREEZE-REVALIDATION.json](SOURCE-FREEZE-REVALIDATION.json). The completed
compile was retained because those exact bindings matched. No historical result
was relabeled as a current run.

## Measured execution

Node was v24.22.1. Compilation and normal acceptance ran serially, after all
other heavy checks had stopped. The supervisor used real subprocess execution;
the restricted executor's observed subprocess-output suppression was not used
as evidence of a completed run.

| Phase | Measured seconds |
| --- | ---: |
| Two-cell compile, including startup and final checks | 53.04 |
| Full normal source import | 571.61 |
| Normal export and transport/source-member verification | 26.41 |
| First cold normal guide-on/off comparison | 273.91 |
| Remaining nine normal guide-on/off comparisons, combined | 33.74 |
| First cold production-worker request | 294.10 |
| Remaining nine requests using the same worker, combined | 8.42 |
| Entire supervised normal acceptance, including final checks | 1,226.69 |

The main JavaScript heap was capped at 4 GiB and the production worker's
old-generation heap at 4 GiB. The shared task cgroup was capped at 8 GiB. The
kernel child peak RSS, collected after `wait()`, was **6,960,356 KiB (6.638 GiB)**.
The shared cgroup, which also includes cache and other task processes, reached
**8,589,934,592 bytes**. There were **7,842 memory-limit pressure/reclaim events**
and **zero OOM events or killed processes**. These are distinct measurements;
the shared peak must not be reported as this child's RSS. The supervisor exited
0 without a timeout or interruption, after the worker and main process closed.

## Extending the coverage

For each remaining gateway, first establish the current native doorway or
opening identity, its endpoint ownership and physical support. Then bind exact
room endpoints, both directions, each requested mode, the arrival mode and
ordinary-room-transit choice. An expected available case must name the original
crossing edge it should traverse; adding a forced waypoint is not evidence that
an ordinary journey uses that crossing. Expected refusals must retain their
complete current diagnostics.

Compile every eligible walk and terminal in the affected native cells, with the
full physical and access context. Add the justified cases to the raw case file,
update the inventory's case hash, freeze the resulting implementation and input
bytes, and perform a fresh normal import/export plus serialized worker replay.
Only that run may promote its own bound requests from untested to checked. Do
not add invented doorway identities or copy this run's PASS status into a new
scope. Completing the other twenty seed requests still requires a separate
review of whether the campus inventory itself is complete.

## Reproduction

From the OpenIndoorMaps worktree, with dependencies installed, use a new output
directory and the verified run-1 master. Set paths for your machine:

```sh
SOURCE_MASTER=/absolute/path/UNBC.master.reviter.zip
RUN_ROOT=/absolute/path/new-connected-campus-run
CASE_ROOT=docs/continuation/unbc-20261030/connections

TZ=UTC python3 "$CASE_ROOT/run-supervised.py" \
  --log "$RUN_ROOT/guides.log" \
  --memory-log "$RUN_ROOT/guides.memory.jsonl" \
  --execution-report "$RUN_ROOT/guides.execution.json" \
  --timeout-seconds 3600 -- \
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
