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

The recovered native campus viewer was also imported normally into an isolated
production build. Actual native Building 08 / Floor 2 pixels were checked after
floor preparation completed: 2,853 rendered native features on 1440×1000 desktop
and 855 on 390×844 mobile. The selected Equipment Storage room (08-272), its
irregular native shape, surrounding neutral rooms, circulation and full place
name are visible. Both viewports passed the neutral-paint, boundary, route-paint
and halo-layer checks without page/paint-expression errors or horizontal
overflow. Optional mobile 3D preparation also completed; its actual pitched
native surfaces were inspected before the browser closed.

Portable proof is in [visual/evidence.json](visual/evidence.json), with the raw
[browser observations](visual/native-browser-results.json), screenshot hashes
and all seven renderer hashes. Each renderer file is byte-identical to the
isolated build and commit `0136c83d88500f98bbc394345b99683a39d430c1`.
The viewer ZIP SHA-256 is
`8ad33533e28c387da03567e7979ced4268c7bc1cc3c8727b3762ea908d44546e`.
The build's display-engine identity is
`6c6235a2f577d2541131a055feb874a22ea156e6fe97c0876a1226798b79d968`.

- [Native building overview](visual/desktop-native-overview.png)
- [Selected room on desktop](visual/desktop-native-selected.png)
- [Selected room on mobile](visual/mobile-native-2d.png)
- [Optional native 3D on mobile](visual/mobile-native-3d.png)

This is styling evidence from the isolated source epoch, not acceptance of the
new shared-path compiler or source-model enclosure certification. The recovered
viewer contains no newly compiled `preparedRouting`, and no route was requested
in these captures. The route paint and halo are installed, while route behavior
has its own acceptance evidence. The normal full-package import took 329,616 ms;
this timing does not qualify prepared-publication startup or show a performance
improvement. The browser was closed after capture to release its memory.
