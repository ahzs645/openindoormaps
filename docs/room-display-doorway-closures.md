# Room display at native wall faces

Visitor room surfaces now follow nearby native wall faces for unfinished rooms.
Rooms with a complete supported display perimeter use the standard raised block;
other reviewed floor masks remain flat. Selection is yellow in all three views.
Known native door openings are treated as closed thresholds for the room fill;
the physical door, passage and routing remain unchanged.

Small unlabelled openings can also close the display boundary when two exact
native wall ends have parallel, opposing jambs with matching thickness. The
default maximum clear opening is five feet. Offset, skewed, approximate or
different-level walls do not qualify. The result must remain on native floor
support, preserve floor holes, avoid neighbouring room/access claims and stay
close to the identified room's source footprint. Unverified sides retain source
seams. A display block is allowed only when the entire accepted perimeter is
within 0.05 feet of native material or doorway caps, checked every 0.1 feet.
This keeps plan/mesh corner errors small without admitting an unsupported
source edge. The block uses the normal 0.6-metre room height in 3D, with the
same footprint in 2D and native elevation in relative-height mode. Its
`assumed-native-wall-enclosure` evidence remains display-only and reviewable;
it does not certify a native physical enclosure or change routing.

Office 10-1040 has a four-foot opening between walls 1501327 and 1501330.
Five- and six-foot limits produce identical floor fills in this room. Its known
door 2177664 no longer cuts an inset into the selected room floor. The assumption
is recorded as `closed-for-room-display-only`; no source wall, graph edge or
access permission is added by this display operation.

## Hallway correction

The source annotation for 10-1021 retains its original Lounge label for provenance.
Portable `spaceUse.kind = hallway` and visitor name Hallway record the user's
correction. Native regeneration joins it to circulation cell
`native-cell:3.280840:44` on floor slab 1501009. It renders as a flat blue walking
surface rather than a raised room. Like other hallways, it is excluded from
visitor destination search; review mode retains its source identity.

Regeneration retains all 1,708 previous arrivals, 19 review pins, 12 ramps and
17 elevator stops. Model, scene and GIS assets remain byte-identical. The master
and visitor packages contain the same derived dataset. Recovery packages and
verification artifacts are saved under `UNBC.final/provenance` and
`UNBC.final/verification/assumed-doorways`.

Verification covers the actual Office geometry, known door threshold, five/six
foot limits, unsupported floors/holes/claims, selection and selection clearing,
and native hallway rendering on desktop and mobile. Display closure does not
resolve the room compiler's outstanding physical-boundary review.

## Office 10-1096 manual boundary review

The original derived contour is inset and ends before native door 1501378. Its
label remains the original DWG label. The review traces a conservative interior
between the exact faces of walls 1501309, 1501311, 1500604 and 1500573, subtracting
all exact wall and column material, including column 2236466. Every point is
supported by slab 1501009; competing source claims are checked before export.
The original contour survives in `manualBoundaryReview.originalRingsFeet` and
in the source auto snapshot. The annotation records the model digest, supporting
native elements and measured doorway. Access is unchanged. Native regeneration
must attach the door and regenerate its graph; no arrival or edge is spliced in.
Regeneration attaches door 1501378 and independently recovers a registered DWG
wall enclosure, with complete native floor coverage. No room-specific graph
override is installed. The corridor approach validator now accepts its own half
of a connected room-to-corridor native doorway footprint, just as it previously
did for two corridors. Room interiors retain their separate boundary checks;
disabled doors, staff access, floor voids and unrelated shortcuts remain blocked.
Both directions to Corridor 10-1090 and Offices 10-1094/1098 are verified.

## Combined Kitchen 10-1046

At the user's request, Admin 10-1042 and its open Kitchen alcove 10-1046 are one
Kitchen place. The surviving identity is the previously routable Admin key,
`rm-1487816-22eb4d5b14b3`, so existing arrival ownership can be regenerated through
native door 1501372. The original Kitchen annotation is retained with
`status = deleted` and `mergedInto` referencing that identity. Both original DWG
labels, automatic contours and review history remain in the source package.

The reviewed L-shaped interior follows the exact faces of walls 1500976,
1501324, 1501325, 1501330, 1501323, 1501328, 1500978 and 1501412, including the
native column corner 2235481. Wall material, the partial internal partition,
floor voids and neighbouring claims are preserved. The kitchen opening remains
open within this room. Display-only closure of the four-foot opening on the
Office 10-1040 side remains explicit; it does not create a navigation edge.

Detailed native geometry is now the default. “Simplify map geometry” remains an
optional visitor preference; it is not baked into the source or exported model.

The finalized package pair is in `Downloads/UNBC.final`. This update retains all
1,708 prior arrivals and adds Office 10-1096, for 1,709 arrivals. Verification
covers 37 targeted tests, four desktop/mobile checks, eight local directions and
44 elevator journeys. The previous pair, original annotations and review
evidence are retained under `provenance` and
`verification/office-kitchen-native-volumes`. This update is local only.
