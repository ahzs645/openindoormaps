# Stepped stair v2: portable evidence and caller integration

Status: **unwired design**, prepared while the first complete candidate compiles. No production body/material contract is changed, no stair edge is enabled, and none of the checks below are replaced by this document or the new identity helper.

The existing `nativeSourceStair` version 1 contract assumes that graph terminal coordinates are physical floor contacts and that every movement segment has positive XY length. `validNativeSourceStairBinding` also requires the graph node to equal the terminal cap, and the receipt path to equal `edge.pointsFeet`. Both `validateNativeSourceStairWidth` and `validNativeSourceStairMaterial` reject vertical segments. Permitting zero XY length in either predicate would leave the terminal, original-source and complete-clearance obligations unresolved.

## Concrete original terminal demand

The exact original held edge is `stair:1696006:rm-400176-561f2a7098b2:rm-402367-1fc9594ffaa7`, disabled, inaccessible to step-free routes, with unchanged direction `both`.

| Terminal | Original graph node suffix | Original XYZ, feet | Native level |
| --- | --- | --- | --- |
| Lower | `:0` | `[2.327728994970098, -320.89781591346036, 24.278215223097114]` | 400176 |
| Upper | `:1` | `[1.578773765958708, -320.9697773842104, 34.120734908136484]` | 402367 |

These are different XY positions from the earlier internal cap probes. The lower probe was `[0.5148043399884723, -323.3025630530456, …]`; its historical `source-demand-only` node label never identified an original graph node. Its positive floor support alone cannot establish either original graph attachment.

The new unimported helper `scripts/indoor/proposals/original-stepped-stair-graph-demand.ts` captures exact selected original dataset bytes, checks the independently selected dataset/model checksums, and creates an in-process opaque **identity-only** demand. It snapshots both original nodes, native levels, endpoint ownership/permissions and edge identity/direction. Copied/serialized handles are rejected. Its methods never approve source geometry or a route; even a subsequent candidate with deliberately bad derived path geometry can pass identity comparison only. Source import, body and clearance checks remain separate.

The extracted test fixture `tests/fixtures/unbc-1696006-original-held-graph-demand.json` preserves all original fields of the two nodes, two records, two levels and held edge. The extraction receipt binds original dataset SHA `31b3bc2d226fe006c404cfb4914ddac723e984c2d2f42cc91d6bdc095b1f2a27` and canonical ZIP SHA `13571ab92f7527f779b1b09e7f1792f0ae7ec4369be13554e881e5eda315c520`. The fixture is a portable request, not opaque original-source authority.

## Minimal wire variant

Keep version 1 unchanged. Introduce a discriminated **version 2** `kind: "original-native-stepped-support"` in the existing edge receipt union; reject ambiguous/mixed variants and unknown versions at every importer. Route consumers must dispatch before reading variant-specific fields. No v2 failure may fall back to v1 projected support or a legacy graph edge.

The v2 receipt references a deduplicated physical source index in the same dataset and contains these actual operands, rather than saved approval booleans:

1. **Binding:** model and schema identity, source frame/placement references, original stair/run/definition IDs, original run→stair and symbol→run named fields, typed begin/end flags and named riser indices. Checksums bind immutable operands; they do not establish source membership or completeness by themselves.
2. **Graph demand:** original edge/node IDs, unchanged logical XYZ/native level/room identity, access metadata and direction. Reference the checked original graph snapshot in the source application receipt. A runtime comparison uses the current actual nodes and records, rather than caller-supplied terminal coordinates.
3. **Physical attachments:** one per endpoint, binding the actual original graph node to a *distinct same-XY physical point* on the named original trimmed floor face. Record the exact logical and physical heights, named served level and offset, floor holes/inner support/boundary uncertainty, and source ancestry. This is a semantic attachment; it adds **no walking segment through slab material** and makes no approximate equality claim.
4. **Terminal approaches:** actual physical full-width paths from those same-XY physical graph points to the original finite begin/end-riser corridor. Preserve each intermediate point and actual physical floor height. Check the complete source floor, every hole, all retained uncertainty, original source corridor and full body clearance. The corridor must bind the *original named* begin/end riser and its finite native line controls; an arbitrary source-adjacent point is insufficient.
5. **Walking support:** all owner-bound physical tread/landing faces in native typed order, each with actual physical plane height, guaranteed inner support and localized boundary uncertainty. Every native tread must have at least one supported station; the turning platform may have multiple stations without duplicating its native tread identity.
6. **Movement:** ordered `same-tread` and `source-riser-transfer` groups. A same-tread movement checks continuous full-width guaranteed support, retaining real holes/notches. A riser transfer names the two source tread/station identities, the original shared riser index/curve controls and the complete rise-then-go subpath. It never claims flat floor across the riser. Include separately named begin and end transfers, not just internal transfers.
7. **Clearance:** source-indexed conservative material cells for **all** required owned and foreign bodies over the *entire actual physical trajectory*, including both terminal approaches and vertical stations. Each cell retains its original owner/occurrence/frame/physical component/face identity, exact height interval, plan polygon and any closed line/point operands. Every localized uncertainty cell remains present. All exclusions must resolve to current source-backed nonphysical roles or the exact user-reviewed drawing-reference decision. No general own-stair exemption is available.

Use the existing checked rational wire encoding for exact coordinates; deserialize with bounds and normalized finite rational values. Numeric display points are derived from these operands, never substituted back into the exact proof.

The physical source index also retains the **complete checked census** and how each requested source identity was represented or excluded. Missing, duplicated, unmatched or unsupported occurrences remain refusals. An absent/null bounding box is an unknown, not an empty body. PartMaker/delegated owners require the actual unique source delegation relation and complete child coverage. Empty saved definitions cannot establish that placed physical panels are nonphysical.

## Source authority and serialization boundary

Only the source constructor may combine the existing opaque actual-RVT physical/foreign contexts, the checked original graph demand and actual original support/material readers. It must independently reconstruct source ownership, typed sequence, full frame/occurrence census, complete physical cells and every source exclusion. Passing decoded JSON, an incoming `complete: true`, a self-hashed report, or the historical attachment flag cannot construct this source proof.

Do not export a `fromFacts`/`fromReceipt` authority constructor. The source serializer accepts only an opaque successful constructor result, bound to the same immutable input snapshot. The serializer emits the actual reusable geometry/census operands; the opaque authority itself is not serialized.

At authoring-package import, reconstruct this source result from the **actual model/source graph** and compare its portable operands exactly. Existing project checks already require source rooms and prepared stair source data to agree; extend that comparison to the complete v2 source index and every referenced edge proof. Changed physical source, current drawing decisions, access zones or graph demands stale the result.

Visitor packages intentionally omit RVT/model authoring data. Their import cannot independently recover original RVT membership merely from hashes or a saved census label. It must replay the complete mathematical support/typed-sequence/cell-clearance proof against its preserved physical index and all current routing operands. This is the existing prepared-source trust boundary, not a new cryptographic proof of an external model. A stronger requirement to prove original RVT membership in an arbitrary untrusted visitor would require the original source bytes or an independently authenticated source authority; this proposal does not pretend a small self-hashed manifest can provide that.

## Exact body replay

For each horizontal movement, form the existing two-foot-wide swept plan demand and its actual walking-height interval. For a vertical transfer, use its explicit two-foot station line/footprint and the complete foot-rise interval. Check the complete six-foot person-height demand, including the head boundary. Retain closed line/point contacts: positive-area polygon intersection alone cannot detect all tangencies.

Normal walking support contact must be accounted for **by the exact named support face at the exact foot boundary**. It never removes an entire owning element. Material above that boundary, a foreign coincident face, an upper flight, a side/endpoint uncertainty operand and exact head tangency all retain their original veto. Terminal floor support and its body contact use the same rule. This needs a shared checked closed-contact implementation before route admission; the existing diagnostic report is not automatically that runtime implementation.

The same finite physical trajectory and lateral station axes must feed support, own material, foreign material and route drawing. Neither an ankle-only z-band nor a coarse min/max projection substitutes for the source-localized full demand. Source uncertainty must stay localized; extending a tiny endpoint uncertainty across a complete cap would introduce a fictitious obstacle, while deleting it would remove a real refusal.

## Concrete compiler and runtime call sequence

1. In the source application/driver, import the selected original package normally, capture the checked original graph demands, create opaque actual RVT physical/foreign contexts, and run the complete v2 source constructor. Keep all existing source preservation, physical and access guards. Unresolved census/approach/body evidence yields a diagnostic and leaves the original held edge disabled.
2. In Reviter, use a new `prepareNativeSourceSteppedStairReceipts` path, separate from `prepareNativeSourceStairReceipts` v1. Construct both original-terminal attachments and every physical movement. Run the full new body/material replay, original cell/door/permission rules and direction checks. Only then replace the held edge's *derived* disabled state/path/length while preserving original edge/node IDs, node XYZ and permissions. `accessible` remains `"no"`; an unverified public access state remains unverified.
3. `edge.pointsFeet` becomes the **actual physical foot trajectory**, including source-supported terminal approaches. It must equal the v2 physical path projection; it must not prepend the logical endpoint as a fictitious physical segment. Graph nodes retain their exact logical heights. The explicit attachment checker mediates this deliberate distinction. Compute length from physical movement only.
4. Update `validNativeSourceStairBinding` and its OIM mirror to dispatch the exact discriminant and compare actual graph demands, source-indexed roles/frames, current floors, current material/exclusion operands, both attachments and every movement group. `nativeStairRouteQualified` and `nativeSourceStairNodeIds` accept only successful complete replay. Generic dataset validation must reject a malformed v2 field even on a disabled edge.
5. Update `indoor-contract.ts`, source rooms equality/import checks, OIM `package.ts`, `nativeSourceStairPhysicalEvidence`, viewer metadata wire, route-worker projection and route physical caches **together**. Current visitor stripping retains only authored tread roles; it must retain the physical v2 index needed by actually qualified edges. It must continue dropping source review notes and proposed/failed inventories. Bound caches to the complete actual physical/access/drawing/graph operands; a route-ID/model hash alone is insufficient.
6. Route search preserves existing public/staff/unknown permissions, one-way policy, endpoint ownership and intermediate-room restrictions. Step-free always refuses this stair. Render physical points through each floor transition without smoothing across a typed riser, a terminal aperture or a semantic logical/physical attachment. Full source importer and visitor replay, then actual calculator routes **up and down**, must pass before any publication or screenshot is called verified.

An alternative source repair is legitimate if an old held terminal is unsupported: retain the original edge and nodes **disabled and unchanged**, create new deterministic source-qualified edge/terminal IDs at actual named native caps, and prove complete safe approaches to the actual hallway cells. Do not move/relabel old nodes, inherit an old approval, create nearest-room links, or turn a source cap into a public arrival by proximity. This option still requires every v2 source/body/clearance/access gate. It is not needed merely because internal probe coordinates differ; the original approach may pass after full proof.

## Current 1696006 evidence and remaining gates

Actual original source replay supplies 23 physical treads, 24 supported stations (including two on the turning platform), 22 internal named-riser transfers and 46 exact internal points. The complete begin/end transfers are additional obligations. Lower floor 402395 cap249 and upper floor405772 retain original holes and physical support; lower logical height24.278215223097114 and physical height24.27821522309713 remain distinct.

The body agent has now found positive two-foot **floor-support mathematics** for proposed L-shaped approaches from both actual original graph nodes. These paths still require binding to the checked original demand and complete own/foreign six-foot clearance. The existing source-localized reports cover all47 owned shells/239 cells and upper slab128 cells; the lower floor has108 cells. Foreign completeness is still unresolved for52 placed panels,16 mullions and one PartMaker/delegation. The latest complete source census, including its current exact exclusions and uncertain bodies, must decide admission. No success of the new identity helper enables this stair.

## Required executable negatives before production integration

The unimported graph-demand suite currently checks exact original XYZ and all node fields, duplicated nodes/edges/levels, model/byte mismatch, copied/serialized handles, room ownership/permissions, direction/accessibility changes, internal-probe relabelling and a distinct same-XY height. All returned requests retain literal false geometry/route approval.

The integrated constructor/runtime suite must additionally cover:

- Every actual typed tread and riser exactly once, order/count/owner mismatches, skipped platform station, unsupported finite source branch, missing begin/end corridor and a shifted original terminal.
- Real tiny floor/tread holes, exact boundary uncertainty contact, concave platform notches, an unsupported source approach and positive physical/logical height difference without a semantic attachment.
- Raised obstacles, own upper flights, foreign coincident support, side/endpoint uncertainty, exact six-foot tangency, vertical-line/point contacts and both traversal directions.
- Missing/duplicated placed occurrences, null bounds, empty saved panel definitions, unsupported mullions, forged/missing PartMaker child delegation, changed drawing-reference review and any blanket own-assembly deletion.
- Recomputed hashes on forged/stale geometry or graph demands, source schema/frame/placement drift, source/prepared v2 mismatch, visitor stripping of required cells, worker projection omissions, stale cache reuse and v2→v1 fallback attempts.
- Public/unknown/staff access behavior, one-way reverse refusal and step-free refusal; actual native cell approaches and complete calculator routes in both directions.

The next implementation is a separate coherent candidate after the running generation finishes and after the foreign census and original approaches pass. This document intentionally leaves production qualification unchanged.
