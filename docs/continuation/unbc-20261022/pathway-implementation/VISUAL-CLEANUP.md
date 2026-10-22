# Visitor presentation

The visitor renderer now uses light neutral fills for the built-in ordinary
room categories, with quiet wall material and boundary widths that increase
from building scale to close inspection. The selected destination retains its
gold fill. Staff access, circulation, washroom and non-default authored colours
remain distinguishable. The selected route uses a darker blue stroke
with a white halo.

The interactive native view, progressive overview, published plan and precise
3D room surfaces share the same paint palette. Source category colours remain
in the dataset, and authoring review retains its source paint. Existing
perimeter layers continue to draw native surface boundaries rather than the
interior edges of contained rendering pieces.

These edits change paint only. They do not simplify any room ring, fill a hole,
remove a physical column, change a door, classify access or edit the source
routing graph. Labels retain the existing scale-aware room-number/full-name
and collision behaviour. Further display point reduction remains a separate
protected-geometry task.

Validation: scoped ESLint and all 33 precision-surface, native-perimeter,
map-property, precision-overview and published-plan regression tests pass.
A normal-import synthetic aperture fixture was checked on 1440×1000 desktop
and 390×844 mobile viewports in 2D, selected-room and optional 3D views. The
actual screenshots retain the atrium and separate column hole, neutral room
paint, selected gold and the deliberately authored pink lower room. There were
no page/paint-expression errors or horizontal overflow. Reproduction harness,
six screenshots and the source-layer observations are in the local
`work/visual-proof/` folder. This fixture establishes renderer behaviour, not
native UNBC routing or campus acceptance.

Browser proof must wait for floor preparation to finish and inspect actual
desktop/mobile map pixels. A populated source or a screenshot showing the
preparation overlay is not rendering acceptance. A stable native-campus
served build remains the final visual check.
