# Actual original flag6 vertical stair faces

Large frozen raw captures referenced here are preserved in the verified Drive evidence archive. See [raw evidence restoration](../../../RAW-EVIDENCE.md) before running historical replays. Small summaries and replay source remain here.

Fresh exact source context: original RVT SHA-256
`8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`,
schema `d961c44726fe7fc32bce4425639481a5d5e91acecec7b7fd897610fc369f046f`,
all3666 pages, no missing requested records. `diagnosis.json` retains every
original face plane/loop and every directed UV coedge for the two unusual faces.
`summary.json` provides the compact findings.

| Actual run / definition | Faces / edges / components | Sole flag6 face | Exact raw plane normal | Flag6 exact UV endpoint mismatches |
| --- | --- | --- | --- | --- |
| 1693335 /1693336 | 296 /594 /49 |148, tag849 |(0,+1,0) |0 |
| 2349454 /2349455 | 188 /378 /31 |76, tag377 |(0,-1,0) |2 |

Both unusual faces are exactly vertical planar sides with cutType0, zero face
regions, one closed four-edge original loop, null foreground/background filling
descriptors and negative directed UV winding. Surface orientation is true in
both. Reversing by face bit2 produces (0,-1,0) and (0,+1,0), respectively; that
candidate orientation follows the actual negative winding. All remaining faces
have flag4 and positive winding. Every original surface is slot634Plane. There
are no GFilling spans, extra primitive families or unread branches.

All98/62 horizontal cap faces and all history-bound walking faces retain flag4.
Abstract original twin/loop topology closes across all49/31 components without
waiving a guard. The full models still contain16/8 exact UV endpoint mismatches
across their face loops; the second flag6 face itself has two. No coordinates
were welded, snapped or averaged, and these facts do not certify a numerically
closed exact solid or human clearance.

Original complete physical-definition GRep fixtures are retained in
`original-frames/`; each fixture hash exactly matches its definition2246 frame
from the independent original-RVT context:

- `1693336-1.grep.bin`:141,938bytes,
  SHA `91a8f3804472085996880d1c8a7c6de7166d80dde0008809792c4f036c4d0d11`.
- `2349455-1.grep.bin`:90,314bytes,
  SHA `9062468891d2f6c4cd00842fa78e734ae6c975c8503508c8c9a8fa00198e29aa`.

The raw extractor scanned all3666 pages separately, retained both occurrences,
found no missing IDs and verified unchanged original RVT bytes. Its inspection
receipt includes exact raw primitive/face/filling semantics and legacy prism
refusals. No source body or graph was edited.

Reproduce the two-run semantic context from `/workspace/reviter`:

```sh
node --max-old-space-size=4096 --experimental-strip-types \
  --import ./scripts/register-test-typescript.mjs \
  /workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/flags6/replay.mts
```

Set `UNBC_ORIGINAL_RVT` if necessary. To independently re-extract the exact
physical fixtures, use a **new** output directory:

```sh
node --max-old-space-size=4096 --experimental-strip-types \
  --import ./scripts/register-test-typescript.mjs \
  scripts/indoor/inspect-native-element-bodies.ts \
  /workspace/scratch/native-source-restored/derived/UNBC.original.rvt \
  /workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/flags6/requests.json \
  /workspace/scratch/flags6-source-frame-replay
```

This diagnosis supports a bounded original vertical-side orientation consumer.
It does not justify other face modes, any non-null filling, a cap orientation
change, exact-solid certification, served-floor attachment, six-foot clearance
or route admission. Production edits and their tests are separate parent work.

## Strict AFTER replay

`after.json` is the immutable fresh original-RVT receipt for the bounded vertical
side consumer. It completed in59.1seconds with all11 imported module hashes
unchanged before/after import and replay. Source bytes and all frame hashes are
unchanged; no saved authority was restored.

| Actual run | Faces localized /components | Upward flag4 caps /bound treads | Localized cells | Competing source vertices |
| --- | --- | --- | --- | --- |
|1693335 |296 /49 |49 /24 |247 |357 |
|2349454 |188 /31 |31 /15 |157 |233 |

Both inventories now have zero unsupported face/tread-edge tokens. Both complete
source support censuses, all-original-face material localization, placed envelope
consumers and named-riser sequences pass. Exact original flag4 cap controls,
tread history identities and physical heights match the independently decoded
original binary fixtures, including original signed-zero Float64 bits. The full
raw frame hashes bind all original source controls.

The first comparison attempt correctly stopped because the older JSON report
normalizes source `-0` to `0`; its failure is retained in
`after-json-baseline-failed.log`. The repaired reproducer compares original
binary-decoded controls directly and records bit-preserving fingerprints.
No source coordinate or tolerance changed.

Original endpoint discrepancies remain:16/8 source UV endpoint mismatches,
357/233 competing original vertex embeddings, and tread-specific discontinuities
at indices12/22/23 and6, respectively. The exact-solid gate remains refused on
its unchanged strict original face-semantics/region/loop predicate; this envelope
change does not teach that gate reversed faces or certify numerical closure.
Terminal floor attachment, full own/foreign clearance, circulation policy and
actual routes remain unapproved. No graph edge was enabled.

Portable AFTER replay from the Reviter root (use a **new** output path):

```sh
node --max-old-space-size=4096 --experimental-strip-types \
  --import ./scripts/register-test-typescript.mjs \
  /workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/flags6/replay-after.mts \
  /workspace/scratch/new-flags6-after/after.json
```

Create the output parent directory first. `REVITER_ROOT` can select another
source checkout; `UNBC_ORIGINAL_RVT` can select its exact original input.
The script refuses an existing receipt, freezes imported module hashes, retains
those implementation snapshots, and refuses any source change during replay.

Standalone Reviter raw-fixture regressions are in
`tests/native-source-stair-face-orientation.test.ts`, with the two original
binary fixtures pinned by hash. They cover positive complete source/material
retention and exact-solid refusal, strict unknown flag bits, reversed horizontal
caps, an arbitrarily small nonzero tilt, degenerate/nonfinite directions,
extra queued filling material, foreign owners, missing faces and holes.
