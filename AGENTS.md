# Indoor project work

For native first-person/source-model inspection, use the sibling Reviter
[source inspection workflow](../reviter/docs/source-model-inspection/README.md).
It defines verified scene export, reusable camera recipes, complete-source
renders and receipts. Inspect both sides and the original threshold/landing;
preserve physical geometry and distinguish renders from actual viewer/browser
proof or route qualification. Reuse the scene and render only affected views.

For indoor room boundaries, missing/low room blocks, doors, circulation, stair/ramp/lift geometry, access review or the UNBC master pipeline, read [.agents/skills/indoor-enclosure-review/SKILL.md](.agents/skills/indoor-enclosure-review/SKILL.md) and the relevant parts of [docs/indoor-enclosure-review.md](docs/indoor-enclosure-review.md).

- Review **actual visitor geometry** in ordinary and native-height modes. A source outline, prepared boundary label or selection mask alone does not certify a complete raised room.
- Keep display door closures separate from navigation portals. Preserve native floor openings, source provenance, room identities, access rules and model/GIS bytes.
- A hallway or restricted area is intentionally flat. An open gap or a closed door leaf does not independently establish public access. Apply only the boundary/classification supported by source evidence and user scope.
- Source corrections belong in the preserved room review and sibling Reviter compiler, then in a regenerated master. Display-only changes must not mutate routes. Do not bake the current 200-item queue or UNBC-specific coordinates into generic UI logic.
- The **Room review** interface and CLI share `app/indoor-project/volume-coverage.ts`. Keep that parity, count unique room keys across overlapping scopes, invalidate stale results on import/edit, and keep worker computations off the UI thread.
- Folder companions must match the declared master and file checksums. Native-area proposals and explicit applications are separate; selection closes measured doors only for outlining. Apply only to checked source identities and regenerate invalidated circulation before claiming rebuilt routes. See [native area review](docs/native-area-review.md).
- Review notes are authoring metadata, not geometry approval. Keep them portable in the master, exclude them from visitor assets and bind decisions to the evidence they reviewed.
- Check the current canonical master/version metadata before consolidation; preserve other chats' changes and unrelated local edits. Use candidate ZIPs, hash comparison and backups when promoting source changes.
- Run checks appropriate to the affected geometry/routing, scoped typecheck and build; show actual desktop/mobile browser proof for UI/rendering changes. Distinguish audited records from manually verified enclosures and disclose unresolved evidence.
- Use the [local repair loop](docs/indoor-local-iteration.md): test the changed feature and its physical/policy dependencies, then replay affected cells or physical elevations before a complete map run. Keep foreign obstacles, holes, original owners and access rules in the local context. Batch stable fixes for the required final acceptance, export and browser checks; do not repeat the entire flow after every edit. Selected audit cases and routing shards still perform full imports and are not the fast loop.

No special requirements here apply to unrelated venue demos or ordinary non-indoor changes.

For the current UNBC continuation, start with [the October 20 handoff](docs/continuation/unbc-20261020/HANDOFF.md). It distinguishes the source checkpoint, running native rebuild, verified recovery files and pending release checks. Older handoffs are historical.

The [October 17 pathway repairs](docs/continuation/unbc-20261017/pathway-repairs/README.md) add current viewer checks and data availability: the previously created large handoff archive and failed-run checkpoints are absent from this filesystem. Do not assume old scratch paths still exist or treat the visitor ZIP as authoring evidence.

Every UNBC site publication must pair its exact visitor and both committed source
trees using `scripts/indoor/package-development-snapshot.py`, verify a fresh
restore and the final paired archive, and retain the missing-native-input list.
See [portable development procedure](docs/continuation/unbc-20261017/pathway-repairs/PORTABLE-DEVELOPMENT.md).
The development snapshot supports application edits; it is not a complete native
backup until actual authoring inputs have been recovered and included.

For UNBC directions-cache publications, run
`scripts/indoor/check-published-directions-cache.ts` against the final complete
visitor JSON, its expected checksum and the actual publication root after the
final build. A current compiled receipt and exact served carrier must match;
stale/missing caches must not silently pass publication by falling back to long
physical preparation. Pair the root `/data/unbc-routing/` asset, progressive/
offline companions and development download, then verify normal live URLs and
desktop/mobile directions. See the [October 18 startup findings](docs/continuation/unbc-20261018/directions-and-threshold-blockers/README.md).

Also run `scripts/indoor/check-published-project.ts PUBLIC_ROOT NEW_REPORT.json`
for a UNBC publication. Its compiled map receipt must match the exact visitor,
current validator and selected progressive-manifest revision. It checks actual
ZIP entry hashes, normal metadata hydration and all default prepared floor scopes;
unlisted or changed packages must retain full normal import. Generate a receipt
only from a successful normal import under the unchanged current engine, retain
the validation evidence, and never relabel a stale cache. This catches repeated
startup validation separately from the directions-cell gate.
