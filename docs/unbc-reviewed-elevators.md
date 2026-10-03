# User-reviewed elevators at pins 20–22

The portable master stores three additional four-stop elevator recipes, bound to model SHA-256 `8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178`. Each landing uses a separate native slab and an entrance on the open side of the shaft. Regenerate with Reviter; graph edges are derived rather than patched into exported navigation.

| Pin | Elevator | Native floor levels | Physical elevations (feet) |
| --- | --- | --- | --- |
| 20, attachment | Building 03 | 311, 694, 400176, 402367 | 0, 14.436, 24.278, 34.121 |
| 21 | Building 10 west | 1487816, 694, 400176, 402367 | 3.281, 14.436, 24.278, 34.121 |
| 22 | Building 10 east | 1487816, 694, 400176, 402367 | 3.281, 14.436, 24.278, 34.121 |

The Building 10 ground level is raised relative to the campus datum. Campus floor grouping preserves that elevation. Roof slabs above the shaft walls are excluded.

The east shaft's back enclosure is curtain wall 2187195. Its recovered wall solid describes only a short return. Shaft verification now uses closed native BRep sections of the actual glass panels and mullions with unique persisted host relations, grouped under their parent wall identity. It does not extend a return to the container's bounding box. These members block a rear exit; only the actual southern aperture supports a landing.

User identification establishes the elevator identity. Model geometry establishes the supported landings. Accessibility remains `unknown`; public review routes can use the lift, but geometry alone does not certify wheelchair accessibility or operation.

The Building 03 upper-level stair records cover the elevator landing as well as the stair area. Their arrival points are explicitly placed on the supported flat landing, rather than the original label point across the stair opening. Native floor openings and stair geometry remain intact.

The existing elevator, stair, ramp, staff access, hallway and room reviews are retained. Source model and GIS assets remain byte-identical. Verification artifacts and regeneration inputs are kept in `work/pins-20-22-elevators` and the finalized archive's verification folder.

All 80 ordered elevator floor-pair journeys pass. Each of the 12 new landings also reaches public circulation on its floor, and a journey from another floor uses the correct new lift to reach that hallway. Building 03 Floor 4 reaches Corridor 03-3065; proximity to the shaft does not establish access to the disconnected northern rooms. Nearby-room audit results remain in the verification artifacts rather than inventing connections. Desktop/mobile tests cover upward and downward previews for all three lifts and verify automatic destination floor selection.
