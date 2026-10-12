# Recompile drift found during the 04-128 integration (unresolved — blocks any full recompile)

Status: the full recompile of 2026-10-10 (attempt 6, `integration-04128/regenerated/`, master sha 72af43b4…)
is NOT shipped. Verification failed: level-311 named singletons **07-410** (rm-311-16e712c8b3e9) and
**04-S102** (rm-311-dd343f6f08db) merged into one native face. Coordinator decision: ship a selection-only
master instead (previously published compiled geometry 73f7c95e + the 353-contact collection).

## What differs between the previous published dataset (73f7c95e, Mac compile) and the recompile

Compared field by field (`verification-report.json`, `lost-singleton-investigation.json`,
`changed-walls-investigation.json`):

| Field | Result |
|---|---|
| nodes, records, doors, connectors, rampDisplay, walkingSupport, indoorExclusions, nativeMaterialSections, presentation | byte-identical |
| non-walk edges (doors/stairs/ramps/lifts/openings), arrivals 1560, B4 ramps #1586431 (9 edges) / #1587605 (32 edges) | identical |
| `walls` | 28 of 35,150 records changed `ringsFeet` only. All are many-vertex **curved** walls (102–900 vertices); vertex counts and shoelace areas identical to 1e-5 sq ft. Same element IDs recur on several levels (e.g. 873417, 948600 on 311/1450417/1487816/1425915; 1277166 on four levels; 1327245 on 400176/694). |
| `edges` (walk only) | 3 of 6,050 changed: `native-cell:0.000000:230:walk:arrival:rm-311-40372a304749|door:311:1030100:0`, `native-cell:34.120735:963:walk:arrival:rm-402367-e862125e0958|door:402367:1930937:0`, `…rm-402367-e865f65e095b|door:402367:1930957:0` |
| `circulationGeometry` | `sourceGeometryKey`, `exactTopology`, `displayResidualTopology` changed; still 1,039 cells |

## Causal experiments (pinned production `deriveNativeAreas(level 311, connected, maxGap 0)`)

| Run | Inputs | Regions | 07-410 / 04-S102 |
|---|---|---|---|
| E1 | old 73f7 dataset, pinned code (1a1e358) | 950 | separate (41 / 56) |
| E2 | E1 + new 353-contact collection (04-128 applied) | 951 | separate (41 / 57); 04-128 split off |
| E3 | E1 + **new `walls`** only | 949 | **merged** (41) |
| E4 | E1 + new `circulationGeometry` + `edges` | 950 | separate (41 / 56) |

So the merge is caused by the recompiled `walls` field alone, not by 04-128, not by the mapping code,
not by circulation/edges. The merged face gains a 0.0050 sq ft hairline strip (bbox x −91.17…−83.97,
y 175.43…187.72) along the old 41/56 boundary. Note: by axis-aligned bbox none of the 28 changed walls
touches that face, so the effect is either non-local in the native area derivation or the bbox test is too
coarse — this needs a per-wall bisection (apply the 28 changed walls one at a time to E1).

## Hypotheses (unproven)

1. **Node/V8 numeric difference.** The previous compile ran on Node **v26.7.0** (plane receipt
   `native-independent-plane-drafts-v1:v26.7.0`, Mac); this container runs **v22.22.0**. Curved-wall
   tessellation (arc → polyline, trig / hypot / pow) can differ in the last ulp between V8 versions while
   keeping vertex counts and areas, which matches the observed pattern.
2. **Compiler code delta.** The 73f7 compile predates reviter a70a4c8 (native-circulation-geometry
   ownership broadphase, native-exact-planar-topology) and openindoormaps bc2adc6; pinned trees include them.
   The broadphase changes were meant to be result-identical; the wall change argues against them being the
   cause (walls are produced before circulation), but it is not excluded.

## Required before any full recompile is shipped

- Bisect the 28 walls on E1 to find the single wall that merges 41/56, and diff its old/new rings
  (max coordinate delta, which arc segment).
- Re-run the wall stage (only) on Node v26.7.0 vs v22.22.0 with identical code to separate (1) from (2).
- Make curved-wall tessellation numerically stable across runtimes (exact/rational arc sampling or a
  canonical rounding of computed vertices) or pin the Node version in the regeneration receipt and refuse a
  different runtime for a publication-parity run.
- Add a regression check: a recompile must preserve every published named singleton (verify-04128.ts does
  this) before packaging.

Evidence files: `verification-report.json`, `lost-singleton-investigation.json`, `merge-investigation.json`,
`changed-walls-investigation.json`, `merge-cause-experiment-E1E2.json`, `merge-cause-experiment-E3E4.json`,
`logs/merge-cause.log`, `regenerated/` (kept, not shipped).
