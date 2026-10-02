# UNBC isolation and lift evidence review — 2 October 2026

The native model was inspected against the exact RVT SHA-256 in the prepared ZIP. This review examines all 33 previously isolated arrivals and all five drawing annotations mentioning a lift. It does not change access policy or add inferred vertical links.

## Actual graph evidence

The older inventory called five cases “source components.” Their visual door ownership is matched, but those doors have no saved routing edge. A matched door icon is therefore not proof that an approach survived native wall, column, slab and anchor validation. Both room arrivals exist in these five cases.

| Destination | Native door | Native host | Neighbor | Disposition |
| --- | ---: | ---: | --- | --- |
| 09-232 Washroom | 1522054 | 1521995 | 09-214 First Nation Gallery | Gallery transit requires explicit review |
| 09-230 Washroom | 1522052 | 1521995 | 09-214 First Nation Gallery | Gallery transit requires explicit review |
| 09-231 H,C All Gender | 1522053 | 1521995 | 09-214 First Nation Gallery | Gallery transit requires explicit review |
| 06-370 Reception | 1779325 | 1779324 | 06-S306 Stair 6 | Matched door has no safe routing edge |
| 07-792 Meeting Room | 749970 | 740354 | 07-751 Circulation | Retain reviewed staff access |
| 07-790 Support | 750398 | 740958 | 07-751 Circulation | Retain reviewed staff access |
| 07-772 Office | 748716 | 739034 | 07-752 Circulation | Retain reviewed staff access |
| 07-774 Office | 748776 | 739034 | 07-752 Circulation | Retain reviewed staff access |
| 07-768 Office | 748206 | 739338 | 07-752 Circulation | Retain reviewed staff access |
| 07-754 Office | 750062 | 742213 | 07-752 Circulation | Retain reviewed staff access |
| 07-756 Office | 748318 | 742213 | 07-752 Circulation | Retain reviewed staff access |
| 07-758 Office | 748378 | 742213 | 07-752 Circulation | Retain reviewed staff access |
| 07-760 Office | 748572 | 742213 | 07-752 Circulation | Retain reviewed staff access |
| 07-770 Office | 748908 | 739243 | 07-752 Circulation | Retain reviewed staff access |
| 07-766 Office | 748269 | 739338 | 07-752 Circulation | Retain reviewed staff access |
| 07-762 Office | 748652 | 742213 | 07-752 Circulation | Retain reviewed staff access |
| 05-104 Office | 750326 | 746517 | 05-117 Circulation | Retain reviewed staff access |
| 05-106 Office | 750164 | 746517 | 05-117 Circulation | Retain reviewed staff access |
| 05-112 Office | 754018 | 751874 | 07-751 Circulation | Retain reviewed staff access |
| 05-115 Office | 886568 | 751908 | 07-751 Circulation | Retain reviewed staff access |
| 05-102 Support | 749380 | 746517 | 05-117 Circulation | Retain reviewed staff access |
| 05-110 Office | 754306 | 751870 | 05-117 Circulation | Retain reviewed staff access |
| 03-031 Vault | 706049 | 697398 | 03-030 Central Stores | Matched door has no safe routing edge |
| 05-105 Comm | 865116 | 865043 | 07-113A Corridor | Retain reviewed staff access |
| 07-778 Office | 749022 | 739034 | 07-752 Circulation | Retain reviewed staff access |
| 07-776 Office | 748854 | 739034 | 07-752 Circulation | Retain reviewed staff access |
| 05-108 WC | 754351 | 751857 | 05-117 Circulation | Retain reviewed staff access |
| 05-107 Meeting | 754421 | 751857 | 05-117 Circulation | Retain reviewed staff access |
| 05-101 Office | 749298 | 746517 | 05-117 Circulation | Retain reviewed staff access |
| 05-109 Kitchen | 754102 | 751857 | 05-117 Circulation | Retain reviewed staff access |
| 10-3558 Research Office | 2215397 | 2215317 | 10-3578 Corridor | Matched door has no safe routing edge |
| 05-S304 Stair | 1920744 | 1920480 | 05-330A Corridor | Matched door has no safe routing edge |
| 04-437 Grad Office | 1116997 | 1115898 | 04-430 Corridor | Matched door has no safe routing edge |

The 25 staff cases retain the existing author/user access reviews. Their doors are not public routing edges. The three washroom doors through 09-214 First Nation Gallery do have saved edges; the public route is prevented by the ordinary-room transit policy. The gallery needs a reviewed public circulation path or an actual separate entrance, rather than a blanket endpoint-policy override.

## Lift evidence

Native inventory: 40,611 placed geometry carriers, 74,437 native identities, 9,556 carriers with decoded instance parameters, two Generic Model records and 283 unclassified geometry carriers. Searches cover placed family/type/category/parameter names and family definitions. No named lift assembly was decoded. A separate inspection of partition names and PartAtom metadata also found no named lift candidates.

**Zero decoded lift assemblies does not establish that physical elevators are absent.** This geometry decoder does not provide a complete, verified lift assembly and served-floor relation. Generic/unclassified carrier bounds, schema definitions and vertically aligned annotation points cannot establish lift stops.

| Drawing annotation | Building / native level | Disposition |
| --- | --- | --- |
| 09-218-1 Elevator | 09 / 1450417 | Named lift area; assembly and stops unverified |
| 04-112 Elevator Machine Room | 04 / 311 | Equipment room; not a landing entrance |
| 08-113 Elevator Machine Room | 08 / 1487816 | Equipment room; not a landing entrance |
| 10-4598 Elevator Control | 10 / 402367 | Equipment room; not a landing entrance |
| 10-4086 Elevator Control | 10 / 402367 | Equipment room; not a landing entrance |

The JSON report records source DWG handles, room keys, coordinates and nearby native door/host/owner/UniqueId references on every decoded level for inspection. Nearby doors are inspection aids only. No native or reviewed elevator routing stops exist in this package, and no elevator route or step-free approval was invented.

## Source evidence required

- Exact native lift assembly ElementId/UniqueId and model SHA-256; preserve the native source model.
- Ordered served native levels, actual landing-door ElementIds/UniqueIds and lobby-side route anchors on each served level.
- Operational status, public/staff access and travel direction.
- Separate step-free review of approaches, doors and lift/car geometry.
- Where native Rooms exist, export Finish boundaries and phase-specific door FromRoom/ToRoom to resolve doorway ownership.

## Repeat the review

Run from OpenIndoorMaps:

```sh
npx tsx scripts/indoor/audit-isolation-lifts.ts \
  /Users/ahmadjalil/Downloads/UNBC.indoor.door-axis.reviter.zip \
  node_modules/.cache/unbc-connectivity-native.json \
  docs/unbc-door-axis-remaining-review.json \
  docs/unbc-isolation-lift-review.json
```

The audit validates the cache against exact model bytes/name, evaluates current public graph reachability, checks actual saved routing-edge presence, and asserts that routes and original annotations were not changed. Use the same historical triage with a later ZIP to identify cases that become resolved.

Validation: three native lift evidence regression tests pass; strict scoped TypeScript checks pass for the native evidence module/tests and the viewer audit CLI. Tests ensure equipment rooms, family definitions, named cabs and vertically aligned drawing annotations cannot produce unverified lift stops.

Machine-readable report: [unbc-isolation-lift-review.json](unbc-isolation-lift-review.json).

## Regenerated connectivity package: independent native model proof

The subsequent `UNBC.indoor.connectivity-reviewed.reviter.zip` was compared with the door-axis package by `scripts/indoor/audit-connectivity-recovery.ts`. The proof confirms:

- Original RVT, scene, GIS and room annotation assets are byte-identical; source labels, polygons and reviewed access are preserved.
- All existing native door routing links remain. Twelve new native door links were exercised on actual saved arrival branches in both public graph directions: 24 complete arrival-to-arrival journeys.
- Seventeen new arrivals have saved walking branches; seven include explicit entrance-connected arrival recovery metadata. Each recovered source label matches the original drawing label, and no explicit user route point is overridden.
- All 281 checked saved segments pass native walls, columns and proved joint checks. All 40 new-arrival branch segments pass independent complete coverage by native slab polygons, including holes. Only the actual selected native door apertures are permitted.
- Every original stair identity, tread ring and elevation is unchanged. The new ZIP adds 1,430 native tread thickness records, each independently matched to the associated native run carrier in the exact model-bound cache. This is an evidence-backed display upgrade; the prepared stair JSON is therefore not claimed to be byte-identical.

The 33-case isolation audit was repeated against this regenerated ZIP. Reception **06-370** now reaches eight public-profile destinations. The other 32 historical isolation cases remain: 25 reviewed staff restrictions, three gallery-transit cases and four matched native thresholds without a safe saved routing edge. Lift assembly and served-floor evidence remain unverified; no stops were invented.

Current evidence reports:

- [Independent recovery proof](unbc-connectivity-recovery-proof.json)
- [Repeated isolation and lift review](unbc-connectivity-isolation-lift-review.json)

```sh
npx tsx scripts/indoor/audit-connectivity-recovery.ts \
  /Users/ahmadjalil/Downloads/UNBC.indoor.door-axis.reviter.zip \
  /Users/ahmadjalil/Downloads/UNBC.indoor.connectivity-reviewed.reviter.zip \
  node_modules/.cache/unbc-connectivity-native.json \
  docs/unbc-connectivity-recovery-proof.json
```

The independent slab checker has four passing regression tests covering a thin unsupported interval, native holes, genuine overlapping slabs and collinear boundaries. Strict scoped TypeScript checks pass for the recovery proof and these tests.
