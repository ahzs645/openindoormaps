# Connected campus worktree rebuild — October 30, 2026

This rebuild replaces the lost October 23 local patches. It starts from
OpenIndoorMaps `b227739977bcc0ba9e33e8f61ad8ae31f2557bdd` and Reviter
`80177ed21becc91c02df48bb27cd1d24f5fbf297`. It is a new implementation and new
verification; the old unpublished commit IDs are not represented as recovered.

## Implementation

| Layer | Implementation | Result |
| --- | --- | --- |
| Source diagnostics | Reviter native gateway audit and CLI | Original doorway owners, crossings and both walking approaches are checked without creating a connection. |
| Pathway display | Shared `pathNetworkView` composition and complete-source preview exporter | Walking guides and original doorway/floor-change layers use one production composition. Native rings and unresolved markers remain inspectable. |
| Visitor preferences | Explicit room-transit option in client, worker, UI and shared links | Users can request ordinary-room transit while the physical, access and step-free checks remain in force. |
| Journey acceptance | Guide-on/off parity, exact crossing requirements and current-run inventory | A displayed guide cannot substitute for a complete normal route and serialized production-worker result. |
| Large companion decode | Paired bounded decoder change in both repositories | Avoids an intermediate numeric array while preserving source bytes and existing limits. |

The production floor worker already combined pathway and connection layers at
the base commit. The shared display helper makes exported inspection follow that
same composition. This rebuild does not claim that every building connection was
newly added to the production graph.

## Current verified result

The fresh two-cell compile accepted 46 of 47 eligible walks. The complete normal
master import/export and all ten normal guide-on/off cases passed, followed by
all ten actual serialized production-worker replays. Four walking calculations
are available and six expected refusals are retained. All five original source
assets and 27 held stair transitions are unchanged.

Both directions of 08-216 ↔ 08-260 are 12.216 m. With ordinary-room transit
explicitly enabled, 04-255 → 08-272 is 178.219 m and the reverse is 177.608 m.
Those cases use hallway arrival and retain source warnings: the short routes
report eight unknown-access areas and three unconfirmed-accessibility edges;
the long routes report seventeen and forty-one. These are routing results with
open access review, not newly certified public or step-free travel.

The supervised replay completed in 1,226.69 seconds with no OOM or process kill.
Kernel child peak RSS was 6,960,356 KiB. The shared 8 GiB cgroup reached its cap
and recorded 7,842 memory.max pressure events; that measurement includes
other processes/cache and is not the Node heap or an independent child RSS.

The campus inventory remains incomplete: 30 requests, ten checked, twenty
requiring evidence. The known Floor 3 source gap remains open.

## Evidence

- [Native doorway findings](NATIVE-GATEWAYS.md): ten explicit checkpoints and the
  expanded 31-identity local audit. Door 2315416 remains unresolved.
- [Visitor code and real-worker browser checks](visitor/README.md): the production
  build, 36 passing tests plus one disclosed optional fixture skip, and five
  desktop/mobile browser cases using synthetic source data.
- [Scoped guide and journey acceptance](connections/ACCEPTANCE.md): two Floor 2
  native cells, exact cases and the incomplete campus request inventory. Read
  this document's current outcome; compilation alone is not journey acceptance.
- [Complete saved network preview](../../pathway-preview.md): exporter behavior
  and preserved source context. [Fresh UNBC visual evidence](preview/README.md) records 24 passed native-level
  desktop/mobile checks and eight actual screenshots.

## Source and scope

The exact run-1 authoring master has SHA-256
`d4d36d188dd635cae7d4225abdb1a3707eed6427180e072f64fc59f4ea006dfc`.
The complete recovered raw dataset has SHA-256
`efd7efad5e8bc332e2a5eb68348d55241eb8c74bf386256f65b14bb40de07798`.
All selected journey cases use hallway arrival. The four expected available
requests require original edge `door:694:2311764` in both guide-on and guide-off
routes; inside-room arrival and other campus requests need their own evidence.

The native physical geometry remains the authority. This work does not remove
holes, infer doorway owners by room labels, broaden access, add a synthetic
bridge, or treat walking centerlines as step-free clearance. The bounded guide
catalog is separate from the previously reported 2,701-guide campus candidate.

## Applying and publishing

Use the paired recovery package's manifest, checksums and restore helper to
create new worktrees at the pinned bases and verify their final Git trees.
The packet is a code/evidence backup. It is not a newly published UNBC map or
proof of every campus journey. No push, merge or Site publication is part of this
rebuild.

The generated display, route and visitor-plan runtime bindings changed. Before
an application release, regenerate compatible progressive manifests, floor
assets and route/plan receipts, then complete the existing publication and
whole-campus release gates. See the visitor README for the exact compatibility
consequence.
