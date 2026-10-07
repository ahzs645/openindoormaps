# Auditing connected room selections

Run `npm run indoor:audit-isolation -- /absolute/path/to/master.reviter.zip /absolute/path/to/output-directory` to trace every supported native level and record every source room once. This reads the preserved master and does not apply repairs. It respects reviewed door pass-throughs and applied analytical entrance boundaries.

`room-isolation.json` binds the master, dataset, source model and each full native trace to their checksums. Each room lists its selection regions, other labels in those regions, declared use and arrival availability. Levels without model-bound native floor support are explicitly unavailable. A stale geometry hash, partial room crop, experimental gap closure or duplicate identity fails the audit.

A shared selection is a review lead. Confirm whether identities represent separate enclosed rooms, an intentionally open area, circulation or an entrance recess before changing geometry. Use registered wall drawings and original native inside faces to check both contacts, width, axis and every alternate connection. Preserve doors, columns and native floor openings. Apply physical corrections as separate source-bound patches; use reviewed analytical boundaries for shutters or doorless entrances when appropriate. Do not invent physical walls to split labels.

After repairs, regenerate the sibling Reviter dataset and repeat the whole-level audit. Compare old singletons, actual raised blocks in both height modes, enabled doorway owners, arrivals and connector stops. Check affected routes against walls, columns and protected floor openings. A single label in selection alone does not certify a physical room or a safe route.

Store the per-room outcome, evidence, unapplied proposals and patch history with the reviewed master. Retain large raw traces separately with exact checksums when companion storage is limited. See [native area review](native-area-review.md) and [enclosure review](indoor-enclosure-review.md) for application and regeneration requirements.
