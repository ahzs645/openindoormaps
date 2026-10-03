# Building 09 native circulation review

The user identifies 09-214 (First Nation Gallery), 09-216 (Kitchenette),
09-218 (Student Commons), 09-220 and 09-222 (Study Space) as open walking
areas. Their portable source metadata uses `spaceUse.kind = "hallway"`;
names, numbers and original label coordinates remain unchanged.

These identities share one continuous native circulation cell on slab
1521516, at native level 1450417 (-3.28084 ft). Native slab profiles, wall
footprints, door openings and columns define the blue surface and routing
branches. The saved DWG place contours identify uses within that space;
they are not five separately enclosed rooms or the blue walking boundary.

09-314 (Concrete Catwalk) is the upper circulation landing on slab 1521608,
at native level 694 (14.43570 ft).

## Elevator evidence

The user identifies 09-218-1 as an elevator. Connector `unbc-09-lift` binds
that review to native shaft wall elements 1522085–1522090. Its reviewed
reference point retains the original source label coordinates. The north
opening is between x249.723 and x253.723 at y497.640 ft; lobby entrances
are [251.8, 501] ft on the two supported native slabs.

The lower entrance explicitly carries `areaKey` for 09-218-1. After native
stop validation, the compiler binds that named destination to the public
lobby node. Search and every destination stop mode therefore end at the
lobby; they do not introduce a walking edge inside the elevator car.
This binding is checked against the source hash, native level, shaft point,
access classification and compiled connector, and survives regeneration.

The compiler verifies native wall enclosure, same-height slab support,
absence of floor holes and unobstructed travel to each lobby. Angular wall
sampling uses 32 directions with the same 5/8 enclosure requirement, so
narrow wall returns around opposing doors are not missed by eight compass
rays. Tests reject a lobby through a solid wall, missing shaft walls and a
floor hole beneath the lobby.

No roof stop is inferred: the native shaft walls end below the roof slab.
Accessibility remains `unknown`, so this connector does not authorize an
unverified wheelchair route. This is user-reviewed shaft evidence, not a
claim that an elevator family or operational status was recovered.

## Repeatable regeneration

Use the consolidated master at `~/Downloads/UNBC.final/UNBC.master.reviter.zip`.
The circulation classifications, shaft review pin and explicit connector
recipe are source metadata inside the master, so regeneration retains them.

```sh
node --max-old-space-size=6144 --expose-gc --import tsx \
  scripts/indoor/regenerate-from-native-cache.ts \
  "$INPUT_MASTER" node_modules/.cache/unbc-connectivity-native.json \
  "$NEW_OUTPUT_DIRECTORY"
```

The decoded cache must match the exact source-model hash. Regeneration
asserts preservation of previous arrivals, elevator stops, native ramps,
source annotations and model/GIS assets; master and visitor datasets must
match. Do not combine graphs from older ZIPs.

The inspector now distinguishes a validated native circulation cell and a
compiler-recovered wall enclosure from a source outline or display-only
room block. Areas without sufficient native evidence still show boundary
review status; changing that text does not certify an unsupported outline.

The Building 09 audit covers 126 areas: 26 use native circulation cells and
56 have native room enclosure evidence. The remaining 44 retain source
geometry for area identity or display and still need boundary review; this
includes stair footprints and the original named elevator contour. The
elevator's routing uses its independently validated shaft and lobby.

Validation covers 20 directed journeys between the five walking areas,
32 directed elevator journeys across all four reviewed shafts, both
wheelchair-ramp directions, and desktop/mobile search and step following.
The source RVT, scene, GIS, previous arrivals, access restrictions and
native stair/ramp geometry are preserved in the consolidated ZIP pair.
