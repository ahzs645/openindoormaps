# Read-only candidate pathway regression

`audit-pathway-candidate.ts` accepts regenerated candidates, including previously unseen dataset hashes. It does not import publisher receipts or install the old published routing cache. The original importer and physical validators remain mandatory.

```sh
node --max-old-space-size=8192 --expose-gc --import tsx \
  scripts/indoor/audit-pathway-candidate.ts \
  --baseline /absolute/verified-baseline.campus-viewer.zip \
  --source-baseline /absolute/original-master.reviter.zip \
  --candidate /absolute/new-candidate.campus-viewer.zip \
  --source-candidate /absolute/new-candidate.master.reviter.zip \
  --baseline-audit /absolute/verified-complete-audit-directory \
  --out /absolute/new-empty-evidence-directory \
  --review-scope /absolute/source-bound-review.json \
  --cases /absolute/affected-route-cases.json
```

`--review-scope` and `--cases` are optional. A changed arrival or existing edge field without a matching evidence-bound scope entry fails QA. A visitor candidate requires `--source-candidate`; its actual master RVT/GIS/scene bytes, source room entry and exact physical routing authority are checked independently. Only documented visitor removal of historical tread caches and authoring notes is normalized. Source room identity, public/staff access, walkability, original direction, accessibility metadata, reviewed exclusions, model and GIS guards remain strict; a scope file does not bypass them.

The sole accessibility-metadata exception is `reason: "certify-stationary-native-alias"` on an existing unknown-to-yes edge. QA requires unchanged original endpoints, owner, level, surface, native cell, exact zero XYZ movement and fresh source-cell/material support, then independently replays the source compiler's `certifiedStationaryNativeAlias` helper. Physical vetoes, disabled edges and all other permission changes remain blocking. This certifies a stationary identity relationship, not a passage or wheelchair clearance.

The baseline coverage folder must contain `endpoint-inventory.json`, both `all-pairs-{public,accessible}.bitset.gz` matrices and `all-pairs-full-oracle-audit.json` (or `all-pairs-audit.json`). Its exact routing projection, endpoint order, matrix hashes/lengths and complete every-origin oracle counts are checked before use. Use the visitor ZIP that produced those matrices. The original authoring master provides independent actual RVT/GIS byte evidence; it need not have byte-identical presentation wrappers to the baseline visitor.

The candidate undergoes the complete original `readIndoorProject` validation. Fresh physical walking/door checks and native stair/ramp qualification then run on its private routing projection. Every eligible origin is independently traversed and cross-checked against `reachableProjectDestinations` for both profiles. Matrix changes join stable source keys, handle reordered/removed identities, and fail on lost previously available pairs or arrivals. Native floor identity/geometry changes are recorded separately; removed original floor identities fail. Counts of legitimate refusals are reported rather than called successful routes.

One explicitly bounded exception permits withholding an old declared arrival that never had an admissible path. Its record scope entry must include `reason: "withhold-unsupported-original-arrival"` and bind the exact source/before/after/evidence hashes. The original node must belong to that exact room, have a nonempty enabled incident edge set consisting entirely of ordinary moving native-cell walking edges, and every such edge must be refused by a **fresh** original physical-validator calculation on the exact baseline visitor. Historical graph blockers do not substitute for that replay. Missing/noncell/reviewed links, stationary or floor aliases, doors, lifts and any unblocked incident path disqualify the exception. Both original profiles must show no available outgoing **or incoming** nonself pair for that identity. Every actual pair loss still fails QA. The original declared-arrival drop remains in `reachability-delta.json`; its evidence is additionally recorded in `original-lost-arrival-physical-replay.json` and `withheld-original-arrival-evidence.json` rather than hidden.

Actual calculations use `createWorkerRouteCalculator`, the production worker calculator function, for every enabled vertical connection in both directions/profiles, recovered entrance pairs, representative newly connected origins and explicit cases. They independently check route-policy adjacency, original arrival IDs, enabled connections, step-free restrictions, finite path coordinates, intended connector use and instruction generation. Original path generation/floor checks remain active. This executes the worker calculator function in Node; it does not reproduce browser-worker transport, a browser renderer or mobile memory behavior. Graph coverage is not all-pairs path centering.

The output folder is required to be empty. Existing archives are never rewritten. Candidate, baseline and source archives plus the candidate routing projection are rehashed on completion to detect mutation. Both-profile matrices, per-origin reachability, all comparisons, actual route cases/results and the final `candidate-regression-report.json` are saved. A nonzero exit means unresolved regression or missing review scope; unresolved preexisting missing entrances/held stairs remain visible in the report.

After source changes are frozen, refresh the generated preparation engine binding through the existing build script. QA checks that it matches the actual source module graph before expensive work. It captures a new candidate routing cache from the same fresh original immutable validation/calculator session; it never reads or installs a historical cache. Route-case/result files and the new receipt are bound into the final report. This avoids repeating cold validation solely to produce transport-test bytes.

`build-pathway-candidate-scope.ts --help` describes the reproducible scope builder. It binds the original visitor, original authoring master, actual regenerated master/visitor, complete regeneration report, exact stationary-source evidence, and explicit drawing-reference review. It verifies the source annotation delta and records native floor/material/room-shape changes. Unsupported permission/edge changes produce `needsReview` and a failing exit; a generated scope remains evidence bookkeeping, not geometry approval.

If compilation uses a separate source input that discards the old derived `nativeExploreMapping`, keep `--source-baseline` pointed at the true canonical master and supply `--source-rebuild-receipt`. The scope builder independently compares the actual ZIPs: exactly that one dataset field may disappear, every retained top-level JSON operand and every other archive entry must be byte-identical, and only the manifest's indoor size/checksum may change. It also checks the receipt's exact canonical/working ZIP hashes and preserved entries. This is a source rebuild input derivation, not a visitor validation exception. Both original readers, physical guards and fresh output mapping validation remain mandatory. Routing invariance follows from identical retained inputs to the production projection, which omits that sole changed field; the independent proof distinguishes that structural argument from the receipt producer's directly recalculated projection hash.

After a successful fresh QA run, test the actual production client and worker:

```sh
node --expose-gc --import tsx \
  scripts/indoor/audit-candidate-route-transport.ts \
  --candidate /absolute/new-candidate.campus-viewer.zip \
  --qa-report /absolute/new-evidence/candidate-regression-report.json \
  --out /absolute/new-empty-transport-directory
```

Do **not** pass `--max-old-space-size` to this command or through `NODE_OPTIONS`: Node's process-wide flag overrides `Worker.resourceLimits` even when the worker reports the requested smaller limit. The runner refuses that flag, uses old-generation 768 MiB / young-generation 32 MiB, and independently verifies the effective V8 heap limit is at most 960 MiB on actual worker replies. The unmodified production worker is bundled into an isolated directory with only its generated publisher receipt replaced by the fresh candidate receipt. The production client performs real structured cloning; exactly one checked local cache fetch is required. All original QA cases are replayed and checked against original policies and source identities. An OOM, timeout or worker error aborts remaining cases and reports them as untested.

An optional `--resident-descriptor FLOOR.json --resident-binding EXPECTED-BINDING.json --resident-chunks DIRECTORY` run retains one newly prepared selected-floor payload in the parent realm while routes execute. Chunk files use their original `<sha256>.bin` names. The independent expected binding must match the actual full candidate viewer dataset, current engine and one selected native level. This measures Node worker memory/transport and optional floor-payload residency; it does not establish browser/WebGL/mobile/network performance. Worker heap/external/ArrayBuffer values are local to its isolate; RSS includes the whole process.

A review scope binds concrete evidence bytes and exact before/after ZIPs:

```json
{
  "format": "openindoormaps-pathway-candidate-review",
  "version": 1,
  "sourceModelSha256": "64-hex-source-model-hash",
  "baselinePackageSha256": "64-hex-verified-baseline-visitor-zip-hash",
  "candidatePackageSha256": "64-hex-candidate-zip-hash",
  "evidence": [
    {
      "id": "source-approach",
      "path": "measured-approach-proof.json",
      "sha256": "64-hex-proof-file-hash"
    }
  ],
  "records": [
    {
      "key": "exact-original-room-key",
      "fields": ["arrivalNodeId"],
      "evidenceIds": ["source-approach"]
    }
  ],
  "edges": [
    {
      "id": "exact-original-stair-edge-id",
      "fields": ["enabled"],
      "evidenceIds": ["source-approach"]
    }
  ]
}
```

This document only records what was reviewed. The importer, physical validators and actual route calculation must independently pass. An evidence hash is not clearance certification.

Explicit route cases use stable keys:

```json
[
  {
    "name": "Checked repaired entrance",
    "start": "original-key-a",
    "end": "original-key-b",
    "mode": "public",
    "expect": "route"
  },
  {
    "name": "Restricted room stays unavailable",
    "start": "original-key-a",
    "end": "original-staff-room",
    "mode": "public",
    "expect": "blocked"
  }
]
```

Run the focused regression suite with `node --import tsx --test tests/unit/pathway-candidate-audit.test.ts tests/unit/source-door-proof-crossbinding.test.ts tests/unit/candidate-routing-transport.test.ts`. It includes original source support/physical-veto tests, real production calculator calls on a synthetic qualified staircase and the actual bounded production client/worker transport on a small native fixture. Those synthetic fixtures certify no UNBC staircase or UNBC worker memory result.
