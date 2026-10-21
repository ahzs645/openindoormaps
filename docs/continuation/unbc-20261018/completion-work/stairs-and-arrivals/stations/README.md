# Original rotated stair stations

This bounded source qualification repair preserves the 28 held stair edges.
It does not approve physical bodies, terminal approaches, six-foot clearance,
access, routes, or a visitor release.

The inventory identifies five single-run stair assemblies whose exact original
walking caps and finite native tread intent cannot contain a world-x or world-y
full two-foot station on each tread. The previous proposal contract could only
express those two orientations. Original finite riser lines already contain the
lateral source direction; no source geometry correction is required to express it.

`native-source-stair-stepped-stations.ts` now accepts an explicit finite lateral
direction, conservatively normalized with rational arithmetic. The complete
station remains at least two feet wide; diagonal normalization may widen it.
The exact segment containment predicate checks every original boundary and hole
intersection and every intervening interval. Legacy axis callers retain their
contract. The original physical cap and finite intent checks remain required,
as do all existing source census, tread ordering and sequence guards.

`before.json` records the unchanged baseline at Reviter
`cc46ace780f9258724edc2d94ff87a112e36eb7b`: 110 original physical treads across
runs 1638854, 1779498, 1903837, 1984014 and 2439788. All five have complete source
caps and named riser sequences. The same fixed cap-center proposals support only
6/110 stations with x laterals and 4/110 with y laterals; the former contract
refuses explicit rotated proposals.

The replay reads the complete original RVT with SHA-256
`8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`, scans all
3,666 original pages and retains each run's exact source frame hashes. It does
not use the failed prepared snapshot or restore its validation authority.

Reproduce from `/workspace/reviter`:

```sh
node --max-old-space-size=4096 --experimental-strip-types \
  --import ./scripts/register-test-typescript.mjs \
  /workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/replay.mts \
  /workspace/scratch/station-after-replay.json
```

Set `UNBC_ORIGINAL_RVT` to the verified original file if its location differs.
The script otherwise uses the recovered original at
`/workspace/scratch/native-source-restored/derived/UNBC.original.rvt`.

Checks: 19 targeted tests passed, one original-RVT-gated test skipped in that
unit invocation; the separate replay performs the original-RVT checks. Scoped
ESLint and full Reviter TypeScript pass. Hole/disconnected support, wrong lateral
direction, invalid direction and untrusted-context refusals remain covered.

`after.json` records the fresh original-source replay (271.2 seconds):

| Original run | x / y baseline stations | Rotated stations | Complete stepped support proposal |
| --- | --- | --- | --- |
| 1638854 | 1 / 1 of 23 | 23 / 23 | Refused: turning transfer corridor |
| 1779498 | 1 / 1 of 25 | 25 / 25 | Pass |
| 1903837 | 3 / 1 of 23 | 23 / 23 | Refused: turning transfer corridor |
| 1984014 | 1 / 1 of 25 | 25 / 25 | Refused: turning transfer corridor |
| 2439788 | 0 / 0 of 14 | 14 / 14 | Pass |

All 110 original full-width stations now pass, using unchanged proposal centers
and original finite source lateral directions. Exact equality checks retain those
original centers/directions from the baseline. The original source is freshly
read for the rotated replay; x/y values are the separately retained baseline.
Two runs pass the complete source stepped support proposal; three still refuse
at turning transfers. A supported station cannot authorize a deficient transfer.

Full production calls on run 1638854 retain shifted-coordinate refusal (0/23
stations) and perpendicular-direction refusal (1/23 stations, incomplete). The
original context refuses an unrequested foreign run and a stale model checksum.
Unit tests separately retain exact hole and disconnected-support refusals. Every
route/body/terminal/headroom approval remains false.

This receipt and `verification.json` bind the **pre-terminal-extension** imported
module SHA `76df49fbb0b8e925357185a22057057cb06facb326d703ea68d4d7182777d146`.
Its complete bytes are retained in `source-before-terminal.ts.txt`. A parent
agent began propagating the API through terminal/runtime consumers while the
replay ran; the end-of-replay filesystem hash is explicitly separate from the
already imported module hash. The reproducible script now captures the hash
before its loop and refuses changes during a future run.

At this bounded snapshot the v2 kernel, source adapter, terminal and
floor-attachment receipt contracts remained axis-only. Their subsequent coherent
extension and validation are separate integration work. Both original served
planes, finite risers and complete own/foreign clearance remain required. This
source predicate repair supplies no approval for those later gates.
