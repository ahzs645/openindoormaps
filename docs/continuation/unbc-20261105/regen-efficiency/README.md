# Why the UNBC native regeneration takes 14 hours, and what to change

This study covers the gap-patch regeneration of November 5, 2026. It ran on
this host with 4 cores, 15 GiB of memory, 1 floor worker, 1 landing worker
and a 7 GiB parent heap. The run took **13 h 57 min of wall time and
15.3 h of CPU time**, so it used about 1.1 cores on average. Its peak child
RSS was 11.9 GiB.

It ran the October 21 producer code: OpenIndoorMaps 6993c08 and Reviter
cb140e46. The changes below are on the `claude/regen-efficiency` branches,
based on OpenIndoorMaps e55f680 and Reviter 2e7875d. They are local commits
and have not been pushed. Reviter 2e7875d makes no changes to the pipeline,
landing, plane or checkpoint code relative to cb140e46. OpenIndoorMaps
e55f680 does not change `regenerate-from-native-cache.ts` relative to
6993c08. So the producer timings apply to the dev heads.

Evidence:

- `unbc-work/gap-patches/regen/run/compile-20261105T010951Z.log`
- `regen/logs/regen-20261105T010951.execution.json`
- `regen/run/checkpoints/` (landing JSONL files, plane receipt, input snapshots)

The supervisor's memory log for this run holds only timestamps, with no RSS
samples, so it cannot attribute memory to stages.

## Stage-by-stage time

| Stage | This host, Nov 5 (1+1 workers) | Colab, Oct 21 (8 cores, 2 floor + 7 landing workers) | Threads |
| --- | ---: | ---: | --- |
| Start, reuse of private import data, source review replays, stair proofs | 26 min (01:09:51–01:35:40) | 20 + 19 min | 1 |
| Envelopes, routing interiors, walls and doors on 9 levels | 36 min | 36 min | 1 |
| Ramps and landing-approach preparation | 26 min | 25 min | 1 |
| Landing approaches: 1148 pairs, 977 evaluated, 0 reused | **3 h 45 min** (13.9 s per pair) | 2 h 07 min | 1 / 7 |
| Room presentation | 17 min | 16 min | 1 |
| 9 native physical planes | 62 min (one plane, z = 0, took 25.5 min) | 33 min | 1 / 2 |
| Reading and merging plane drafts | about 7 min (receipt written 07:49) | — | 1 |
| **Unlogged stage**: per-cell walking branches, minority-owner arrivals, source standings, reviewed links | **2 h 44 min** (07:49–10:33) | 2 h 32 min ("no progress output") | 1 |
| Final walking-branch replay and diagnostic save | 1 h 41 min | 1 h 33 min (with stair finalization) | 1 |
| Stair finalization, arrival guards, `compiled-dataset.json` | 13 min | — | 1 |
| **Export master** | **1 h 44 min** | 2 h 31 min total for all four export and import steps | 1 |
| Read master (import validation) | 24 min | (included above) | 1 |
| Export viewer | 13 min | (included above) | 1 |
| Visitor import and packaging | 16 min | (included above) | 1 |
| **Total** | **13 h 57 min** | **11 h 14 min** | |

Only the landing and plane stages use workers. Everything else runs on one
thread, which is why 8 cores gained only 2 h 43 min over 4 cores. About 9.5 h
of the Colab run was single-threaded.

## 1. The unlogged stage (07:42–10:33)

`prepareIndoorDataset` (Reviter `lib/reviter/indoor-pipeline.ts`) does the
following after the ninth plane:

1. `prepareParallelNativeCirculation` reads the 9 checkpoint drafts and calls
   `mergeNativeCirculationPlaneDrafts`. This rebuilds exact topology indexes
   and validates each cell's contained display. The plane receipt was written
   at 07:49, so this step took about 7 minutes.
2. `attachNativeCirculationCellRoutes(dataset)` runs for each of the
   2,521 circulation cells in the campus output. For each cell it does the
   following:
   - computes an exact door-half approach union;
   - selects nodes with exact point-in-parts tests over every node;
   - builds a 0.6 ft raster grid;
   - checks each branch exactly with `nativeRationalPathSupported`;
   - where a branch fails, replans it with `nativeSupportedPull` or
     `refineNativeTerminalPath`;
   - joins disconnected pieces through closest node pairs, which rebuilds the
     grid once per candidate pair. `accept()` recomputes
     `nativeRationalOverlay("union", …)` on every cross-surface branch.

   A minority-owner arrival pass follows. This is almost all of the
   2 h 44 min, about 3.9 s per cell, and it is all exact rational overlay
   work on one thread.
3. `attachOriginalDoorDerivedStanding`, `attachOriginalStairBaseDerivedStanding`
   and `applyReviewedCirculationLinks` run last. These are small next to step 2.

**Fix, committed: Reviter 6721958.** The stage now reports:

- `Native physical planes · reading/merging/merged … cells`
- `Attaching native cell walking branches · i/N cells · E branches` (every 100 cells)
- `Recovering minority-owner native arrivals · i/N …`
- the standing and reviewed-link replays

The callback does not change results. A new test asserts that a run with
reporting produces a byte-identical dataset to a run without it.

## 2. Landing-approach reuse: why 0 of 1148 were reused

Each landing candidate line was keyed by the exact pair (endpoints, landing
flag, distance and walking-region query key). Each line also carried a
binding over the SHA-256 of the **`node:v8` serialize() bytes** of the whole
model and dataset. Those bytes record how V8 stored each number. The same
value `1` is written as a small integer (tag `I`) when it came from
`JSON.parse`, and as a heap double (tag `N`) when arithmetic produced it.

The November 4 16:03 run (same commits and same inputs, interrupted at
775/1148 pairs) and the November 5 run produced landing snapshots of
different sizes and hashes. The first differing bytes are
`boundaryElementIds` written with `I` tags in one and `N` tags in the other.
The model snapshots differ in the same way (`xDir {x: I 1}` against
`{x: N 1.0}`). With the new canonical digest, the two landing-dataset
snapshots are **identical**: `b320e108…` for both
(`abf8e5bc…bin` and `91f1f0f0…bin`). The two model snapshots, 264 MB each,
were not decoded here because of the memory limit.

All **649** pair keys checkpointed on November 4 also appear on November 5,
and all 649 candidate results are **identical**. So about 57 % of the landing
stage, roughly 2 h 10 min at 13.9 s per pair, was recomputed with no change
in any result. The Colab note "a rerun that rebuilds the import data
recomputed all landings" has the same cause. The plane checkpoints use the
same byte binding.

**Fix, committed: Reviter 17523c4.**
`scripts/indoor/canonical-value-digest.ts` computes a canonical structured-clone
digest:

- numbers as IEEE-754 bits, so 1 and 1.0 are equal while 0 and −0 differ;
- strings as UTF-16;
- object keys in order;
- holes, `Map`, `Set`, typed arrays and `BigInt`;
- shared references and cycles as back-references.

It refuses anything it cannot represent, and the byte binding then stays in
force.

`CheckpointBinding` gains a `reuseSha256` computed from the content digests
of the inputs plus the algorithm file contents, keyed by path relative to the
checkout. Landing JSONL files and plane checkpoint directories are keyed on
it. Workers still verify every byte they read.

Tests show that equal values with different V8 bytes give the same digest,
that 15 kinds of observable change each change it, and that a forged reuse
identity is refused. A rerun whose inputs differ only in representation now
reuses every landing candidate. On the 87 MB landing dataset the digest takes
about 2 s; the model should take about 6 s.

Status: **implemented and tested**. Saving: an interrupted or repeated run
with unchanged inputs skips the finished landings and planes, worth up to
3 h 45 min plus 62 min here, or 2 h 07 min plus 33 min on Colab.

### Plane-scoped per-pair keys (prototype)

**Committed: Reviter 03ba0c4. Opt-in with `scopedReuse: true`, in-process
only.** Each candidate is keyed on three things:

1. an **implementation identity**: every resolved algorithm file by content,
   plus the algorithm version and the Node version;
2. the exact pair key;
3. a **plane scope digest**: the whole native model and every unscoped dataset
   field. For `walls`, `doors`, `records` and `nodes` it holds the elements on
   the pair's walking plane whole. For other elements it holds only their
   selector fields (identity, level, elevation), and each element is tagged
   whole or selectors-only.

Fresh pairs are evaluated on a **guarded view**. In that view, out-of-scope
elements are proxies that answer only their selectors. Any other read is
recorded, even when evaluation code catches the error (`supportedWalkingPath`
does catch). A recorded read taints that plane's evaluator, and the pair is
then evaluated on the complete inputs and stored under a complete-input key.
So a candidate is reused only when every input it read is the same. A wrong
selector list can lose reuse, but it cannot make a reused result stale.

Tests run on a strict native fixture with 3 planes, envelopes and patch
walls:

- output is byte-identical to `attachNativeCirculation`;
- an unchanged rerun reuses all 6 evaluated pairs;
- moving a patch wall so that it blocks plane 12 recomputes only plane 12's
  2 pairs and reuses 4, and the result changes as it should;
- changing a record outline, a node or a wall on one plane recomputes only
  that plane;
- a model change or a simulated implementation change reuses nothing;
- a deliberately narrow scope records violations, including caught ones, and
  falls back to complete keys, which are reused only for identical inputs.

Measured on this fixture: cold run 0.47–0.66 s, unchanged rerun 0.31–0.45 s,
one of three planes changed 0.33–0.48 s.

Estimated campus saving for a small source change, such as a patch on one
level: the pairs on unaffected planes are reused. In proportion to the plane
times, a one-level edit on an upper floor recomputes about 5–40 % of the
landing work, so it saves 2–3.5 h on 1 core. The November 5 patches touched
6 of 9 levels, so they would have saved little.

Open items, in order:

1. Run the scoped mode once on the campus. Check that it raises no
   violations and reproduces all 977 recorded November 5 candidates. The
   JSONL is keyed by the same pair keys. This needs about 10 GB and 3.7 h on
   1 core, or 2 h on Colab.
2. Carry scope keys into the worker pool.
3. Note that model changes still invalidate everything. The pipeline mutates
   the model by about 0.8 MB between the landing and plane stages, so check
   whether that mutation depends on the source reviews.

## 3. Export master (1 h 44 min)

`exportIndoorProject` (OpenIndoorMaps `app/indoor-project/package.ts`) does
four things:

1. **Validation**: review bundle, material sections, corner seals, frame
   returns, envelopes, boundary binding and others. The import's matching
   "materials" stage took 410 s, so this is about 7 min.
2. **`publishNativeExploreMapping`**. The Reviter compiler never sets
   `nativeExploreMapping`, so the master export always takes the cold path,
   `compileNativeExploreMapping`. That runs `deriveNativeAreas(connected,
   maxGapFeet 0)` for every native level, with both exact topologies. Earlier
   measurements put this at 1–11 min per level and 738 s for one Floor 1
   trace. **This is about 85–90 min of the 104**, and it runs on one thread.
3. `JSON.stringify` of the 300 MB dataset: seconds.
4. **ZIP**: fflate level 6. A measurement ([`zip-bench.mjs`](zip-bench.mjs)) on a 40 MB slice of this run's
   `compiled-dataset.json` gave 1.30 s at level 6, 0.79 s at level 1, and
   0.50 s / 0.25 s with Node zlib. That is about 15 s for the roughly 435 MB of
   compressible entries. The RVT and the 88 MB review companions are already
   stored at level 0.

Compression and serialization are therefore not the problem. Neither is a
duplicate full validation inside the export. The validations are repeated
deliberately across the steps that follow:

- read master spends 455 s validating the mapping;
- export viewer revalidates the mapping;
- the visitor import validates it a third time.

**Fix, committed: OpenIndoorMaps 6c551ef.** `exportIndoorProject(project,
onProgress)` and `publishNativeExploreMapping` now report the following, and
the regeneration logs them as `Export master · …`:

- validation;
- room serialization;
- **each level of the mapping derivation**;
- dataset serialization;
- compression.

Reporting only. The package unit tests pass and the full typecheck is clean.

Proposals:

| Proposal | Estimated saving | Risk | Status |
| --- | --- | --- | --- |
| Derive explore-mapping levels in parallel worker threads (levels are independent; the browser already uses a worker for the whole mapping) | 85 → about 15 min on 8 cores (bounded by the largest level); about 30 min on 4 cores | Low: the same function per level, merged in level order; prove byte identity of `nativeExploreMapping` on one campus run | proposed |
| Content-addressed checkpoint per level, keyed by `nativeAreaGeometrySha256(level)` plus the kernel and implementation identity | Rerun after a later failure: about 85 min; a one-level source change: all other levels | Low (the key is the existing complete-geometry key) | proposed |
| Compute the mapping in Reviter's compile, or in a parallel step right after `compiled-dataset.json`, so it overlaps with nothing but avoids the cold path inside export | none alone; enables both of the above | Low | proposed |
| fflate level 1 or Node zlib for `viewer/indoor.json` and `rooms.json` | under 15 s | Changes archive bytes (but not entry bytes) | not worth it |
| Skip the repeated mapping validation in export viewer or visitor import | about 15 min | Removes an independent acceptance gate | not recommended |

## 4. Exact arithmetic

All exact work goes through `lib/reviter/vendor/native-rational-overlay-arithmetic.mjs`.

- Every `new Rational(n, d)` runs a Euclidean BigInt `gcd`.
- `add`, `sub`, `mul` and `div` always construct, so they always reduce.
- `compare` always cross-multiplies.

Original coordinates are dyadic rationals with a power-of-two denominator and
keep their `original` double.

A micro-benchmark ([`rational-bench.mjs`](rational-bench.mjs), 4,000
campus-like feet coordinates) checked every fast result against the current code before
timing:

| Operation | Current | Fast path | Speed-up |
| --- | ---: | ---: | ---: |
| Reduce a dyadic sum (power-of-two denominator; gcd = lowest set bit of \|n\|, capped by d) | 18.9 ms | 2.1 ms | **9.0×** |
| Reduce a non-dyadic quotient (the power-of-two check is added, then Euclid) | 18.6 ms | 13.1 ms | no regression |
| Compare two original coordinates (both carry `original`: an IEEE compare is exact) | 0.97 ms | 0.08 ms | **11.7×** |
| Compare generated rationals with a sign and IEEE-interval prefilter (cross-multiply only when within 1e-9 relative) | 1.93 ms | 0.53 ms | 3.6× |

Further safe options:

- an equal-denominator fast path in `compare`, `add` and `sub`;
- Knuth cross-cancellation in `mul` and `div`, which takes the gcd of smaller
  operands;
- skipping reduction of intermediates that are only compared. `orient2d`
  already does this.

Each fast path gives the same reduced `n/d`, so encoded topologies are
byte-identical.

**Not implemented.** The module is shared by OpenIndoorMaps and Reviter. Its
file hash enters the source-consumer module bindings recorded in the
regeneration receipts and every checkpoint implementation identity. The
existing tests cover results, not the speed paths, and a campus profile to
size the gain needs the heavy machine.

Estimate: earlier profiles attribute about 50 % of routing-preparation CPU
(74.6 % inclusive in one landing sample) to gcd and comparison. If half of
that is dyadic reduction or original-to-original comparison, the exact stages
save 15–30 %. Those stages are landings, planes, cell routes, final replay
and the export mapping, about 10.5 h here, so the saving is 1.5–3 h.
Proposed next steps:

1. Implement in the vendor module with property tests against the Euclid
   reference.
2. Profile one campus plane before and after.
3. Reissue the module bindings once.

## 5. Parallelism and recommended configuration

Memory facts:

- The parent peaks at about 7 GiB, and the whole process tree reached
  11.9 GiB here with 1+1 workers.
- Each floor or landing worker deserializes the 264 MB model and the 87–92 MB
  dataset (about 3–4 GiB of heap) and keeps its own region memos. The default
  cap is 4 GiB.
- On October 21–22, 9 floor workers (34.12 ft plane) and 11 landing workers
  ran out of memory even with 8 GiB heaps, while 2 floor and 7 landing
  workers at 4 GiB passed.
- The code limits floor workers to 1 or 2.
- The landing stage scaled only 1.8× with 7 workers. Its waves speculate on
  2 × workers pairs, and pairs are grouped by walking region per worker, so a
  few expensive plane-0 regions serialize.

The stages are strictly ordered by data: landings → presentation → planes →
cell routes → final replay → export. The plane snapshot is bound to the
dataset after landing edges and presentation, so landings, planes and the
final replay cannot run at the same time without an audit of what each plane
reads. Two overlaps are possible:

- cell routes and the final replay for plane *k* could start once plane *k* is
  merged (proposed, see 6);
- the explore-mapping levels can run in parallel inside export (see 3).

### Local machine

Use the `claude/regen-efficiency` heads for resumable reuse and progress
output. Their algorithm files differ from the producer's, so the first run
reuses none of the existing checkpoints. Note also that the module hashes
recorded in the output receipts change.

| Machine | `NATIVE_WORKERS` | `NATIVE_WORKER_HEAP_MIB` | `LANDING_WORKERS` | `LANDING_WORKER_HEAP_MIB` | `PARENT_HEAP_MIB` | Expected total |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 4 cores, 16 GB (this host) | 1 | 4096 | 1 | — | 7168 | 14 h (measured) |
| 8 cores, 32 GB | 2 | 4096 | 3 | 4096 | 8192 | about 11.5 h: landings about 2.5 h, planes about 33 min |
| 8+ cores, 64 GB | 2 | 4096 | 7 | 4096 | 8192 | about 11 h (like Colab) |

Never exceed 2 floor workers or 7 landing workers. Keep 3 GiB free beyond
`parent + workers × 4 GiB`.

### Colab Pro (8 cores, 50 GB, High-RAM CPU runtime)

```sh
NATIVE_WORKERS=2 NATIVE_WORKER_HEAP_MIB=4096 \
LANDING_WORKERS=7 LANDING_WORKER_HEAP_MIB=4096 \
PARENT_HEAP_MIB=8192 SYNC_DIR=/content/drive/MyDrive/UNBC-recompile \
bash openindoormaps/docs/continuation/unbc-20261021/recompile/run.sh WORK
```

This is `run.sh`'s own default for that machine, with the heaps set
explicitly. Peak memory is about 8 + 7 × 4 = 36 GiB while the landings run,
and about 8 + 2 × 4 GiB while the planes run.

Expected times per stage on the current code (October 21 measurements):

| Stage | Time |
| --- | ---: |
| Start and review replays | 39 min |
| Interiors, walls and doors | 36 min |
| Landing preparation | 25 min |
| Landings | 2 h 07 min |
| Presentation | 16 min |
| Planes | 33 min |
| Cell routes | 2 h 32 min |
| Final replay | 1 h 33 min |
| Exports and imports | 2 h 31 min |
| **Total** | **11 h 15 min** |

With the dev heads, a disconnected session that reruns with the Drive
checkpoints no longer repeats finished landings or planes. Before this fix it
repeated them whenever the import data were rebuilt.

With the proposed changes:

| Proposal | Saving |
| --- | --- |
| Parallel cell routes and final replay over 7 workers | about 4 h → about 1 h |
| Parallel export mapping | about 1.5 h → about 15 min |
| Exact-arithmetic fast paths | a further 15–30 % on all exact stages |

Together the projected Colab total is **about 6 h** for a full run, and
**2–3 h** for a one-level source change once scoped reuse covers landings,
planes and cells.

## 6. Incremental regeneration

What already exists:

- `prepareNativeCirculationPlaneDraft(model, data, z)` computes one plane
  independently, and plane drafts are checkpointed per plane.
- `attachNativeCirculationCellRoutes` works per cell. Apart from the final
  minority-owner pass and edge-ID uniqueness, the only cross-cell coupling is
  that edge IDs include the cell ID.
- `docs/indoor-local-iteration.md` scopes local checks to the affected
  elevation.

What is still global:

- `mergeNativeCirculationPlaneDrafts` numbers cells and faces with a running
  count across planes in elevation order (`native-cell:z:<global index>`).
  If a plane gains or loses a cell, every plane **above** it is renumbered,
  along with every walking-branch ID and review that names those cells.
  Planes below it keep their IDs.
- `nativeCirculationGeometryKey`, the plane and landing snapshot bindings,
  and all global assembly guards bind the complete dataset:
  - the arrival-loss guard;
  - lift and ramp preservation;
  - final edge-review replay;
  - component counts;
  - `boundaryPatchState`;
  - the explore-mapping hash.

Steps for a sound incremental run:

1. Scope keys for plane drafts, like the landing prototype: a plane digest
   over the plane's walls, doors, records, nodes, envelopes and material
   sections, with a guarded view.
2. Make cell indexes local to each plane (`native-cell:z:<index within the
   plane>`). This is a one-time ID migration that existing reviews must
   follow.
3. Per-plane cell-route and final-replay tasks that are checkpointed with the
   same scope keys and run in workers.
4. Per-level explore-mapping checkpoints (see 3).
5. Always rerun the cheap global assembly and every acceptance gate on the
   complete candidate. That costs about 1.5 h on one thread: arrival guards,
   export validation, read master, export viewer and visitor import.

Estimate for a one-level change on Colab:

| Step | Time |
| --- | ---: |
| Fixed single-thread front matter (import reuse, review replays, interiors, landing preparation, presentation) | about 2 h 15 min |
| Affected landings | 10–40 min |
| One plane | 2–25 min |
| Its cells and replay | 15–60 min |
| Its explore-mapping level | 1–11 min |
| Gates | about 1.5 h |
| **Total** | **about 4–5 h**, against 11 h |

The front matter itself (envelopes, interiors and walls are per level) is the
next target: per-level checkpoints with the same scope keys would bring a
one-level change to **about 2–3 h**.

Effort: about 1–2 weeks of careful work. The parts are the ID migration,
the scope keys and guarded views for planes and cells, and one campus
equivalence run per step.

## Summary of proposals

| # | Proposal | Estimated saving (this host / Colab) | Risk | Status |
| --- | --- | --- | --- | --- |
| 1 | Progress in the unlogged stage and in export | 0 (diagnosis) | none | **implemented, tested** (Reviter 6721958, OpenIndoorMaps 6c551ef) |
| 2a | Value-based (canonical) checkpoint identity | rerun after interruption or import rebuild: up to 4 h 47 min / 2 h 40 min | low | **implemented, tested** (Reviter 17523c4) |
| 2b | Plane-scoped landing keys with a guarded view | one-level change: 2–3.5 h / 1–2 h of landings | low (sound by guard); campus equivalence pending | **prototyped, fixture-tested** (Reviter 03ba0c4, opt-in) |
| 3a | Parallel per-level explore mapping in export | 1 h 10 min / 1 h 15 min | low | proposed |
| 3b | Per-level mapping checkpoints | up to 85 min per rerun | low | proposed |
| 4 | Exact-arithmetic fast paths (dyadic gcd, IEEE compare of originals, equal denominators, cross-cancellation) | 15–30 % of exact stages: 1.5–3 h / 1–2 h | medium (shared kernel, binding reissue) | **benchmarked**, proposed |
| 5 | Per-plane or per-chunk worker parallelism for cell routes and final replay | 0 here (memory-bound) / about 3 h | medium (ID order, merge) | proposed |
| 6 | Incremental per-plane regeneration | one-level change: 11 h → 4–5 h, then 2–3 h | medium | proposed |
