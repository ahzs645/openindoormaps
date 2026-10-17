# Stepped stair v2 production integration: 03-S201 to 03-S301

The separate production qualifier and post-cell finalizer are implemented. Actual
original-source geometry passed both directions before final scope hardening; a
fresh proof under the final guards and actual calculator routes are still required.
The source edge is stair1696006 between 03-S201 and 03-S301 (building03, native
Floors3/4). Historical filenames saying Library are diagnostic aliases. Existing
version1 stairs retain their current contract and validators.

## Smallest supported graph change

Keep the existing held stair edge, its two original node identities, logical
XYZ, native levels, room identities, direction and access metadata. Preserve its
old source recipe as immutable history. A new version 2 receipt references the
source-owned stepped index and explicitly binds logical node coordinates to the
actual same-XY physical floor caps; the tiny source height difference is not a
new walking segment. Accessibility remains `no` for stairs. No staff restriction
or unknown through-navigation permission is changed.

Use a distinct `nativeSteppedStairV2` edge field and dataset index rather than
pretending the version 1 flat-width receipt passed. This keeps version 1 code
that reads treads, landings or flat projections unchanged. Version 2 qualification
must bind both current endpoint nodes and room/access operands, current source
model/schema/physical occurrence inventory, original run/typed finite risers,
all source caps/uncertainty and complete current own/foreign material.

The source producer must reconstruct these operands from actual issued original
RVT contexts. Incoming booleans, self-checksums, copied reports and a source model
hash alone cannot issue the source producer's capability. The source importer
independently reconstructs and compares the same index and original held demand.
The visitor then replays the preserved mathematical operands under the existing
prepared-source trust boundary. It cannot establish arbitrary original RVT
membership from a small self-hashed visitor manifest alone.

## Floor cells can be reused only under an explicit narrow policy

The original canonical 03-S201/03-S301 nodes already have enabled same-point lateral
arrival aliases: lower native cell `native-cell:24.278215:868`, upper
`native-cell:34.120735:1118`. This is evidence about the old canonical dataset,
not a claim about a future regenerated candidate.

In the current compiler, stair qualification occurs before native floor cells
are built. Enabled source-qualified stairs contribute `nativeConnectorAnchors`,
and those anchors affect the circulation source key and possible unclaimed-cell
ownership. Merely enabling a stair afterward and overwriting the source key is
therefore invalid.

A minimal post-cell finalizer is possible for a new **existing claimed cell
only** variant if every following condition independently passes:

1. Both unchanged original stair nodes already have final native-cell walking
   approaches that survived the current independent physical replay.
2. Their existing claimed cells retain the same exact face, source slabs,
   native level/height, owner/access metadata and room permissions. No unclaimed
   landing is promoted and no new terminal/cell/portal is invented.
3. The new v2 variant is explicitly excluded from the connector-anchor producer;
   it must use its already checked claimed cells and may not supply source-only
   anchors. This keeps the floor decomposition input independent of the new
   stair proof rather than hiding a changed input behind an old key.
4. The complete circulation key, cells, exact topology, contained display,
   residual topology, all unrelated nodes/edges and room arrivals remain exact.
   Only the checked stair edge and its separate v2 physical index change.
5. Actual directions up and down use the stair and all lateral paths still pass
   current access, third-room, floor, material and doorway validators. Step-free
   requests continue to refuse the stair.

If an endpoint lacks that approach or needs different cell ownership, this
finalizer refuses. Rebuild the affected physical planes with the normal source
compiler and exact checkpoint bindings; reuse only independently unchanged
plane results. Do not reconnect a node by nearest-floor or nearest-room logic.

## Implemented qualification boundary

`app/indoor-project/native-stepped-stair-v2.ts` and its Reviter mirror replay
browser-safe exact wire operands. Prepared data carries the physical index once
in `nativeSteppedStairV2SourceIndices`; each edge has its receipt, independently
preserved original graph binding, current circulation key and exact hashes of
both existing claimed cell/walk approaches. Every approach is also rechecked
against the current original floor/material authority. The variant supplies no
connector anchors. An operation-local cache reuses proof replay; later authoring
calls recheck mutations.

The mandatory exact source census bounds now travel with the index. Every
receipt point and complete swept movement must stay inside those bounds, so a
changed approach cannot leave the enumerated obstacle scope on a broad slab.
Closed contacts, source holes and all unknown physical bodies remain refusals.
The navigation profile is two feet transverse width, six feet swept headroom and
full square standing caps on actual flat landing/turn points. It is not a humanoid
gait or step-free certificate.

`scripts/indoor/source-stepped-stair-v2-producer.ts` issues a process-local
capability only after the actual original RVT constructors, complete source
census, exact occurrence refinements, checksum-bound original graph and original
room review pass both directions. Copied JSON, matching hashes and declared
approvals cannot issue it. The original source room bytes must match the exact
checked dataset source checksum; explicit disabled reviews veto issuance.

`scripts/indoor/finalize-source-stepped-stair-v2.ts` consumes that capability
only after native cells exist. Its mandatory current source-room snapshot must
also match the compiler's current source checksum, and its explicit disabled
review independently vetoes application. The same serialized snapshot supplies
the checksum and review decision. The finalizer returns a new dataset, preserves
every other field/edge and all input field hashes, and reruns strict dataset and
physical qualification. The explicit review JSON and its hash must accompany
rebuild evidence; a later source rebuild without that review holds the stair.

Focused current-review tests, runtime mutable-data/physical negatives, worker
transport, source/runtime exact parity and legacy stair regressions pass. The
final source proof, package roundtrip and actual up/down calculator checks remain
the admission gate. All other held stairs require their own evidence.

## Required integration and verification sequence

1. Finish the unimported actual-source replay with the real canonical graph
   demand, all 52 panel and 16 mullion original-source certificates, original
   door1074348 body, real floor/slab bodies and every retained carrier primitive.
   Match certificates to the exact occurrence GElement frame and census.
2. Extract the pure geometry functions into browser-safe source/runtime mirrors.
   The current prototype calls source modules containing RVT/Node readers; it
   must not be imported wholesale into the browser. Preserve exact parity for
   finite-riser crossing, source intent, closed contact, width projection,
   support/uncertainty and finite primitive consumer-census checks.
3. Add a bounded lossless v2 wire representation and independently replayable
   prepared graph-demand binding. Source reconstruction remains separate from
   mathematical replay. Add positive roundtrip and tampered owner/frame/face,
   census, typed riser, XYZ, cap, hole, access and foreign-body controls.
4. Add the narrowly scoped post-cell finalizer. It accepts a capability issued
   only by a complete original-source replay and checks the current compiled
   dataset's endpoint/cell invariants. It returns a new dataset and an exact
   before/after preservation receipt; it never mutates the input.
5. Extend Reviter/OpenIndoorMaps contract validation, `nativeStairRouteQualified`,
   importer/exporter source parity, route-worker projection and routing-cache
   binding for the separate variant. Update connector-anchor behavior only for
   the explicitly checked existing-cell variant. The ordinary route policy must
   check this new variant everywhere it currently checks version 1 stairs.
6. Preserve the v2 index in visitor/offline and worker data; invalidate the
   directions cache when it changes. Keep source review history in authoring
   assets. Rebuild package descriptors/checksums and validate authoring/visitor
   roundtrips with the normal strict importer.
7. Invoke the actual calculator up and down through the source-qualified 03-S201/03-S301
   stair, verify the selected native edge, test unchanged room/access policies
   and step-free refusal, and capture both floor screenshots. Retain all other
   held stairs until their own complete evidence passes.

The first actual-source run with 16 issued mullion certificates exposed a real
source reader restriction before clearance: upper floor405772 top Face5 uses
trimmed physical flags516, while the local cap reader accepted only4. The
existing complete original planar slab proof accepts this physical516 cap with
all six original holes and reciprocal topology. The narrow reader correction and
null-loop516 negative now pass; no floor guard is waived.
