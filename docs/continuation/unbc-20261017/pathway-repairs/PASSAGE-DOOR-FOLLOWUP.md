# Passage-door overlay correction · Site version 12

The user clarified that the dotted branches in the supplied Floor 4 image
were internal passage doors. The correction filters those optional branches
from the inspection overlay. It does not change centerline fitting, walls,
physical openings, source doors, graph links or calculated routes.

`hallwayPathView` omits an approach when the enabled original door/opening
connects two display passage areas. That includes hallways, vestibules without
the circulation flag, rotundas and an explicitly displayed passage. A real
room-entry door keeps its dotted branch, including a room entered from a
vestibule. Solid guide segments are unchanged. The legend now says **Room door
approach**. Held stairs/access rules remain unchanged.

Seventeen focused tests pass, including positive room-entry retention and
hallway/vestibule/rotunda suppression with immutable source geometry. TypeScript
and the hospital-only production Pages build pass; lint has zero errors and one
existing custom-class warning. Bound-source overlay extraction on all five
floors preserved 5,057 solid segments and removed 652 internal dotted segments;
1,374 room-entry segments remain. Floor 4 changes from 375 to 292 dotted
segments, with all 819 solid segments retained. See `passage-filter-checks.json`.
This targeted check did not repeat native-floor preparation or build a graph.

Viewer source `e41e4aeb2d77ffe7e9227340a741e13a2d8e0528` is published as private
Site version **12**, from Site source `dc165335885ff92e80540ae1d127fb0c17c3009b`.
Native deployment succeeded at **2026-10-17 19:26:58 UTC**. The package remains
the same 45.52 MB shared-guide ZIP from version 11. A viewer reload is required
for an already-open tab to use the updated floor worker. The screenshot below
in the broader report is the earlier version 11 diagnostic, not a screenshot
of this correction. Browser control is unavailable, so signed-in production
content and a new browser screenshot remain unverified.
