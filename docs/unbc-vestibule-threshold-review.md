The public connection between Buildings 08 and 10 passes through vestibule
10-1080 on native level 1487816, elevation 3.280839895 feet. Review pins 18 and
19 were placed on the campus Floor 1 view with level 311 selected; their XY
coordinates are preserved. Native doors 1501580 and 1501582 connect alcove
08-159, vestibule 10-1080 and corridor 10-1060.

Two separate problems affected these thresholds:

- Vestibule door graphics are hidden by default, while native circulation
  surfaces exclude their footprints. The resulting unpainted seam looked like
  missing floor. `circulation-thresholds.ts` now paints enabled native doors
  joining public circulation, clipped to the exact supporting floor, holes,
  other walls, columns and restricted areas. It uses the same wall-thickness
  aperture as display carving, without changing the graph.
- Door 1501582's original portal anchors lie inside the native footprint. The
  floor-bound runtime guard rejected all attached source walks, producing a
  roughly 194-metre detour through another floor. `native-door-approach.ts`
  recognizes only each incident portal's own half of the exact native door
  footprint as support for an existing walk. The opposite half requires the
  explicit door edge. Display extensions do not authorize routing; disabled
  doors, stale model support, columns, fixtures, staff areas and actual floor
  openings retain their vetoes. No portal coordinates are moved.

Both directions between 08-159 and 10-1060 now cross doors 1501580 and 1501582
on the same physical floor, with displayed routes approximately 20 metres.
Public accessibility remains unverified.

The user also identifies 07-704 (`rm-311-cdb834d8a61f`) as staff-only circulation.
That source annotation is preserved in the master ZIP. Regeneration intentionally
removes its arrival and public graph links; the app gives it the shared restricted
colour and disables visitor directions. 07-113A remains public circulation.
The native-cache regeneration loss guard permits arrival removal only for an
explicit source staff annotation whose regenerated area is staff-only and has
no enabled incident room edges. Other lost arrivals still fail regeneration.

Verification covers exact threshold geometry, same-side portal support and
blocked shortcuts, two directions through the real vestibule, all 44 elevator
floor-pair journeys, native model/scene/GIS and all 19 review pins preserved,
master/viewer agreement, and 2D/3D desktop/mobile rendering and directions.
The updated master and viewer remain in `/Users/ahmadjalil/Downloads/UNBC.final/`;
previous packages and proof are saved under `provenance/` and `verification/`.
