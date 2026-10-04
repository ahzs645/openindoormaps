# Building 10 upper-floor circulation and native room review

Reviewed on 2026-10-03 against the newest project exported from the local browser, rather than replacing it with the older Downloads master. Model SHA-256: `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`.

Five user-identified open areas now have source `spaceUse.kind = hallway`: 10-2520 Coffee, 10-3072 Coffee,Print Room, 10-4302 Alcove, 10-4306 Alcove and 10-4504 Common Area. Their names, numbers and label coordinates remain intact. Regeneration derives their flat blue walking surfaces and graph branches from native floors, walls and actual native door thresholds. A circulation designation does not remove a physical wall or invent a doorway. Open areas remain selectable in the directions fields; ordinary visitor search hides hallways by design.

The two Floor 4 review pins identify 10-4068 Meeting Room and 10-4070 Office. Exact native wall faces and the 3D wall section show that three partition ends stop short of facade material. Label flood-fill consequently cannot distinguish these rooms. Explicit boundary reviews close those seams for display along each partition's native axis, to the first native material contact:

| Native wall | Display closure length |
| --- | --- |
| 2282634 | 0.1432 ft |
| 2282636 | 0.1507 ft |
| 2282637 | 1.1677 ft |

The resulting enclosed interiors are 211.639 and 110.910 square feet. `manualBoundaryReview` preserves original source rings, wall IDs and the measured display closures. Reviter recomputes the native enclosure, unique label and complete same-height native floor coverage before emitting `reviewed-native-wall-enclosure` presentation with `reviewProof`. Stale models, oversized/moved closures, missing floor support and competing room labels are rejected. These display closures never append physical walls, doors, nodes or edges. Native entrance doors 2282709 and 2282710 remain active.

Validation:

- 20/20 ordered public-review routes between the five areas; 14 cross floors.
- Both corrected rooms route through their native doors to 10-4302.
- No previously connected destination lost its arrival.
- Native Revit model, GLB scene and GIS bytes preserved; 1,854 unrelated annotations and all 24 existing pins preserved; two supplied Floor 4 pins added.
- Master and viewer compiled datasets match exactly.
- 13 focused unit checks, two browser scenarios covering all seven places on desktop/mobile, scoped TypeScript and Pages build pass.

Newest portable pair: `/Users/ahmadjalil/Downloads/UNBC.final/UNBC.master.reviter.zip` and `/Users/ahmadjalil/Downloads/UNBC.final/UNBC.campus-viewer.zip`. Import the master for full source-model review; use the smaller viewer for portable map viewing. This review is loaded locally and has not been published online. Earlier releases and the starting browser export remain in the provenance directory.

Detailed measured geometry, route evidence and screenshots are in `UNBC.final/verification/building-10-upper-review/`. Existing campus source/access review items and unverified elevator accessibility remain unresolved.
