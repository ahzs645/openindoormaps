# Ordinary walking component separation feasibility — 2026-10-16

**The proposed sub-two-foot bottleneck separation cannot authorize ordinary-owner exclusions under the current movement model.** The contract review and exact negative controls are complete; this read-only investigation stops here. No square/disk erosion, wall closure, source change, owner waiver or accessibility approval was applied.

The idea was to classify distinct navigable components around 10-1003 using only unchanged native obstacles and an existing two-foot walking body, despite tiny positive wall seams. That would require a body/turn invariant shared by every admitted ordinary walk. The actual code does not supply it.

- [Exact negative controls and source-file SHA receipts](ordinary-owner-evidence/ordinary-width-component-invariant-negative-controls.json)
- [Original ordinary-room boundary provenance review](ORDINARY-ROOM-PATH-OWNERSHIP-EVIDENCE-2026-10-16.md)

## What the current predicates establish

The ordinary native-cell compiler accepts the path through exact `nativeRationalPathSupported` centreline support. The browser's `nativeCirculationWalkBlockers` checks `createNativeRationalPathUnionQuery` against the independent original physical face plus only licensed incident doorway halves. This preserves floor/holes/material intervals, but **does not check a two-foot body footprint**. Grid clearance is a proposal measurement and explicitly has `clearanceCertified: false`.

The separate source `supportedWalkingPath(region, points, width=2)` routine is used for qualified source openings, ramp approaches and connector proposals. It tests the centreline and a width-two rectangle perpendicular to each nonzero segment. Each rectangle starts exactly at that segment's first point and ends at its last point. It imposes no positive longitudinal body radius, standing disk/square, minimum nonzero segment length, or continuous orientation/turn sweep. The minority-owner arrival helper similarly checks the union of per-segment lateral strips; it does not establish a universal standing-body invariant for other paths.

Relevant unchanged implementation entry points:

- [Source walkingStrip](/workspace/reviter/lib/reviter/native-circulation-links.ts:207) and [supportedWalkingPath](/workspace/reviter/lib/reviter/native-circulation-links.ts:906).
- [Native-cell compiler branch acceptance](/workspace/reviter/lib/reviter/native-circulation-geometry.ts:1215).
- [Browser native walk blocker](/workspace/openindoormaps/app/indoor-project/native-circulation.ts:796).
- [Browser exact centreline union query](/workspace/openindoormaps/app/indoor-project/native-exact-planar-topology.ts:515).
- [Minority-owner full-width approach](/workspace/reviter/lib/reviter/native-arrival-owner.ts:26).

## Actual-predicate negative controls

These are synthetic mathematical fixtures, **not UNBC geometry or route proofs**. They call the current unmodified production predicates and verify exact returned geometry. All referenced source hashes stayed unchanged.

| Fixture | Current predicate result | Implication |
| --- | --- | --- |
| Straight line through a 0.125 ft-wide rectangular slit | Source and browser exact centreline predicates accept; the separate two-foot strip predicate rejects | Ordinary exact centreline support does not imply body-width clearance |
| Finite 2,049-point zigzag through the same 0.125 ft slit | `supportedWalkingPath(..., width=2)` accepts; a standing square does not fit | Even the per-segment two-foot strips do not imply a universal two-foot configuration-space bottleneck rule |
| 90° turn inside the union of its two lateral strips | Two-foot strip predicate accepts; a point inside a one-foot-radius disk at the turn lies outside the walkable region | A standing disk or continuous turn sweep is stronger than the current predicate |

The zigzag is deterministic: for `i=0..2048`, use `x=(-1)^(i+1)/32`, `y=-1+i/1024`, `z=0`, inside the rectangle `x∈[−1/16,1/16], y∈[−3,3]`. Each movement has `|dx|=1/16` and `dy=1/1024`. Its lateral half-strip x projection is `1/sqrt(4097)<1/64`, so the entire strip remains within `|x|≤1/32+1/sqrt(4097)<3/64<1/16`. Every segment's y extent remains inside the fixture floor. The actual exact-support predicate independently accepts all stored IEEE-generated strips. The path advances two feet through a slit far narrower than two feet while taking many small segments. Its standing square fails.

This exposes the absence of longitudinal body thickness and complete turn constraints. It does not suggest emitting such a path, prove any actual tiny UNBC seam traversable, or establish that the bounded raster planner would generate it. A failed raster search is also not a proof of geometric component separation. The controls address a universal movement invariant needed for the proposed permission change.

## Why erosion or a measured tiny seam is insufficient

A square erosion or one-foot-radius disk erosion can split the free floor into components that the existing centreline or lateral-strip predicate has not declared separate. That stronger filter could remove valid current-profile traces or label a component isolated solely because of an added standing/turn requirement. Even a measured native seam far below two feet therefore does not establish the requested current-profile negative proof by itself. Exact source obstacles prevent invented material, but they do not repair the missing motion invariant.

The existing clearance-separated-cell helper uses rounded proposal geometry and JSTS buffer operations. It is not a rigorous complete configuration-space certificate and cannot supply a policy waiver. No erosion result was used in this investigation.

A future supported method would first need an explicit finite body and orientation/turn model, conservative source-bound configuration-space operations, consistent compiler/browser validation, and exact component/endpoint evidence. Original source-associated room labels and all actual entrances, restrictions and foreign bodies would still need independent binding to those components. This would be a versioned movement-contract change and full regeneration, not an assumed architectural wall or a reinterpretation of the current width flag.

Because the present contract fails the necessary invariant, no further UNBC component/label certification or ordinary-owner removal was attempted. The 10-1003 source-boundary work remains as documented separately.

Reproduction: `/workspace/scratch/unbc-pathway-repair-20261015/ordinary-owner-boundaries/check-ordinary-width-component-invariant.mts`. The controls completed in 2.5 seconds. The result records zero owner waivers, zero accessibility changes and no model/graph mutation.
