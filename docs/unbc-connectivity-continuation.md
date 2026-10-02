# UNBC connectivity continuation — October 2, 2026

The prepared example is `/Users/ahmadjalil/Downloads/UNBC.indoor.connectivity-reviewed.reviter.zip`. Three subagents reviewed all 234 cases from the prior door-axis package; their findings are reconciled against actual saved graph edges and final public reachability in `unbc-connectivity-case-review.json`. A display door with matched room ownership is not necessarily a usable route connection.

| Measure | Door-axis input | Reviewed output |
| --- | ---: | ---: |
| Missing entrances | 201 | 184 |
| Public-isolated arrivals | 33 | 32 |
| Public connected destinations | 1,621 | 1,639 |
| Destinations with another-floor routes | 772 | 784 |
| Unique reachable destination pairs | 82,450 | 86,025 |
| Prepared arrivals | 1,654 | 1,671 |
| Unmatched native doors | 351 | 341 |

These are graph reachability counts, not certification of public access or physical passage width. No new unresolved destination was introduced.

## Shared system repairs

`native-door-ownership.ts` recovers recessed native thresholds only with a unique room-side pair, genuine native clear width, full two-foot native-floor support and continuous vetoes for walls, repaired joints, columns, third rooms and holes. Explicit conflicting human ownership reviews are retained. Ten previously unmatched native pairs recover.

`registered-open-fronts.ts` now accepts exactly coincident registered boundaries, as well as tiny drawing seams, using the registered edge normal. Native slab support, registered source walls, native walls/columns, holes and other room footprints remain mandatory vetoes. New source-supported entrances are 03-1010, 10-3038 and 10-4548. This does not fabricate a native door.

The native barrier checker includes aperture boundaries within 1e-8 feet to handle coincident floating-point coordinates. A hosted threshold at door 1779325 previously failed at a roughly 3e-14-foot coordinate difference. No polygon is expanded. Regressions keep nearby unrelated walls, tiny columns and absent apertures blocked. Twelve native graph edges recover overall, including two previously matched thresholds; all are exercised in both directions.

`indoor-arrival-recovery.ts` and the grid can replace an obstructed drawing-label destination with the nearest reachable same-room cell. A complete path must connect it to an existing entrance and be continuously supported by native slab polygons and clear of native barriers, room masks and holes. A line from the obstructed label is never drawn. Explicit reviewed route points, fixed doorway/stair anchors, original labels and room boundaries remain untouched. Recovery evidence is exported under `record.properties.arrivalRecovery` and `arrival-label-recovery` issues. Seven labels recover: 10-S103, 05-139H, 10-S303, 10-S403, 03-3020, 10-S203 and 03-1051B.

An actual desktop/mobile check also caught a discovery-filter conflict: a vestibule classified as circulation remained hidden even with **Show pass-through places** enabled. Search and selection now honor that preference. Ordinary hallway filtering and default pass-through hiding remain as configured.

## What remains after every case was reviewed

Of the original 234 cases, 18 now have usable routes, 25 retain existing staff restrictions, three require an explicit access/transit decision for First Nation Gallery, and 188 need additional source geometry evidence (184 missing arrivals plus four invalid native approaches). `unbc-connectivity-case-review.json` includes the individual source/native evidence for every case.

Concrete source blockers include:

- 07-152 Lecture Theatre has unequal approach elevations; it needs a proved physical local transition.
- 08-161 Classroom's coarse boundary overlaps only about 7 mm of its doorway width. A finer grid would not establish a usable entrance.
- Vault door 706049 reaches an oversized Central Stores cutout that does not match the Vault boundary. It is not exempted as a surveyed doorway/floor gap.
- Door 1920744 has exact native curtain-panel surface quads but no decoded panel thickness; a broad plan bounding envelope blocks its approaches. Verified slab support is also absent.
- Doors 2215397 and 1116997 intersect unrelated native walls; enlarging their hosted apertures would incorrectly remove those barriers.
- Fourteen remaining arrival-location cases were additionally checked across connected native floor-plan levels. Thirteen lack a covering slab at their stored elevation; 10-4594 already references same-level slab 1495537 but has no usable entrance. No additional recovery was justified.

The lift review inspects 40,611 native geometry records, native identities, families, parameters and all five drawing annotations. Four annotations are machine/control rooms; the other is 09-218-1 Elevator. No usable lift assembly/served-floor/entrance relation was decoded. This does **not** establish that physical elevators are absent. Correct native phase-specific room/door ownership, precise slab/host geometry, and actual lift assembly/served-floor/entrance exports are needed for those remaining cases. No step-free route was approved from names or proximity.

## Proof and reproduction

Original RVT, scene, GIS and room JSON remain byte-for-byte identical. Source labels, polygons, wall/floor footprints and native stair geometry are preserved. Regeneration additionally exports 1,430 native tread-thickness values; every added value matches its exact native run carrier. No prior native doorway link was lost.

- `unbc-connectivity-recovery-proof.json`: 12 new native links, 24 complete directional journeys, 17 new arrivals including seven recovered labels, 281 native obstacle checks and 40 independent full-native-slab arrival segment checks; zero geometry failures.
- `unbc-connectivity-walking-geometry.json`: all 10,017 saved walking/native-door segments pass continuous native barrier and source-floor coverage checks.
- `unbc-connectivity-all-room-audit.json`: 2,412 realized endpoint journeys including 1,603 retained native stair/local-step transitions.
- `unbc-connectivity-resolved-geometry.json`: 15,901 segments from 4,147 resolved sections and 29 unchanged clearance-validated guides have zero native obstacle crossings. Other preserved source sections and physical width certification are outside this report. Ten distinct source-opening sections retain their saved geometry for review; they are not promoted to native apertures.
- `unbc-connectivity-isolation-lift-review.json`: repeated individual isolation/lift findings; 06-370 Reception now reaches eight destinations.

Normal preparation includes all source/compiler repairs:

```sh
# From Reviter
node --experimental-strip-types scripts/prepare-indoor-project.ts --input /absolute/source.reviter.zip --out /absolute/new-output.reviter.zip --revit-version 2027

# From OpenIndoorMaps, with a matching decoded native cache
npx tsx scripts/indoor/audit-connectivity-recovery.ts before.zip after.zip model-bound-native-cache.json proof.json
npx tsx scripts/indoor/audit-isolation-lifts.ts after.zip model-bound-native-cache.json original-triage.json isolation.json
```

The review cache is hash-bound to source RVT `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`. The final ZIP does not depend on the local cache at viewer runtime.

Final validation: 50 targeted preparation tests, 62 viewer unit tests and four independent native-slab proof regressions pass. Nineteen additional ownership/semantic/pipeline tests pass after protecting rejected upstream semantic reviews from automatic ownership replacement. That guard does not change this example's output: its single saved doorway review has no semantic evidence and remains accepted. Both scoped TypeScript checks and both production builds pass.

Desktop and mobile browser checks both pass against the new ZIP. They cover custom search/profile controls, pass-through place selection, explicit missing-route messages, the centred Library route, Next-step camera following and a three-floor journey in both directions with automatic selected-floor changes. Browser report: `unbc-connectivity-browser-tests.json`.

```sh
INDOOR_PROJECT_ZIP=/absolute/new-output.reviter.zip npx playwright test --config work/connectivity-continuation/playwright.config.ts tests/e2e/indoor-project.spec.ts --workers=1 --grep 'hospital-style project navigation'
```
