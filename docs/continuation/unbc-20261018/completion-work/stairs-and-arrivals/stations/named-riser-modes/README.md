# Original named-riser index and mode diagnosis

Large frozen raw captures referenced here are preserved in the verified Drive evidence archive. See [raw evidence restoration](../../../RAW-EVIDENCE.md) before running historical replays. Small summaries and replay source remain here.

One fresh original-RVT context read all3666 pages for the17 failing actual runs
from the all-held census. No physical localization or guessed station proposal
was repeated. The imported source snapshots are historical and hash-stable in
`diagnosis.json`; subsequent parent changes to local-index binding are separate.
Source model/schema hashes and all original run/definition frame hashes are pinned.

The compact findings are in `summary.json`. `diagnosis.json` retains every typed
start/end object and descriptor, source schema/field byte spans, every ordered
riser loop/curve, all finite start/end controls and exact rational dot/cross
comparisons. No named curve was approximated, dropped or connected across a gap.

Seven upper-run failures have a supported local-index repair:
1496326,1498364,1498461,1500195,1500292,1514130 and2474572. Each satisfies the
existing begin/end/count/base/top guard. Its complete consecutive original
`m_specifiedIdx` sequence is0..N, although inherited root `m_baseRiserIndex` is
11 or12. Every typed boundary matches its exact original ordered-list position,
including its full finite controls and rational endpoint set. No riser is omitted.

This is directly confirmed in original bytes, rather than inferred by proximity:
`index-field-bytes.json` verifies every specified-index int32 pair[i,i+1] on all17
frames, along with all root base/top/begin/end bytes. Original schema ownership:

| Original field | Declaring source class | Schema field offset |
| --- | --- | --- |
|m_specifiedIdx |IntStairInfo |294898 |
|m_baseRiserIndex |StairsRunAndLanding |445657 |
|m_topRiserIndex |StairsRun |447957 |

`StairsRunInfo.m_firstRiser/m_lastRiser` also partitions each actual run into local
ranges0..typedCount. The complete source objects expose no alternate
specified-index scope flag. Left/right intersection integer fields and their
source byte spans are retained without assigning undocumented enum meanings.

The remaining original-source refusals are separate and remain necessary:

- **Six declared extent mismatches:**1294068,1296189,1779406,1972518,1988746 and
  2354663. Their local finite chains are complete, but root top/base/cardinality
  semantics are not qualified by that fact. Run-info ranges remain local. Root
  declared heights also materially differ from generated typed tread heights:
  1988746 declares14.4357..34.1207ft while its tread origins span14.8143..23.8997ft;
  2354663 declares the same34.1207ft top but tread origins span14.8831..23.8308ft.
  No safe global-extent or served-terminal interpretation is established.
- **Explicit end-without-riser mode:**1305425 has7 typed treads,7 ordered risers,
  `m_endWithRiser=0` and local typed pairs0..7. Its last finite typed boundary
  exists, but is not an eighth declared ordered riser. That source mode needs
  independent terminal/body semantics; no synthetic final riser is admitted.
- **Zero-vector/nonparallel modes:**1298203 has31 zero-vector treads in source
  runType2;1689940 has one in runType1;1779623 has two in runType2.1294068 also
  contains a runType2 zero-vector tread behind its earlier extent refusal.
  The typed `m_runNum/m_runType` fields bind these to actual matching RunInfo
  blocks. Both `m_riserDir` and `m_runDirProj` are exactly zero. Every one of
  these treads has exactly nonparallel original start/end finite boundaries;
  none supports an exact-parallel straight fallback. Curved/turning handling
  remains a separate requirement.

An independent full-page extraction retained all17 original4102 frames and the
exact502KB embedded schema under `typed-source/`. Every frame hash matches the
fresh opaque-context receipt. `run-info.json` contains exact run-info/cell/pattern
metadata and source field spans. Large unrelated decoded history/geometry tables
are retained losslessly in `run-info.full.json.gz`; all original typed primitives,
including arcs/cylindrical operands, remain in the raw frames. This is reusable
source diagnostic data, not saved route or body authority.

Reproduce the actual-context diagnostic from the Reviter root, with a new output:

```sh
node --max-old-space-size=4096 --experimental-strip-types \
  --import ./scripts/register-test-typescript.mjs \
  /workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/named-riser-modes/replay.mts \
  /workspace/scratch/new-named-mode-diagnosis/diagnosis.json
```

Use `REVITER_ROOT` and `UNBC_ORIGINAL_RVT` for another checkout/input location.
`extract-typed-source.mts NEW-DIRECTORY` independently extracts and hashes all17
raw typed frames plus the original schema. The first parser invocation used the
wrong result-property name and stopped before a receipt; that failed diagnostic
attempt is retained separately. The complete retry and all frame checks pass.
No production source, graph, source geometry, access, terminal or route was edited
by this diagnostic work.
