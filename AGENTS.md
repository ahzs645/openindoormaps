# Indoor project work

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

No special requirements here apply to unrelated venue demos or ordinary non-indoor changes.
