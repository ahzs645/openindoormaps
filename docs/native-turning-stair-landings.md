# Complete native turning stair surfaces

The intermediate platform is a physical stair landing, not a route connector or
room outline. The UNBC native model contains landing #2474574 between runs
#2474569 and #2474572, and landing #1500197 between runs #1500192 and #1500195.
Each platform has approximately 52.82 square feet of walking surface.

The cached assembly's `runAndLandingIds` omitted these landing IDs, even though
the native element table assigns them to their stairs. Display preparation now
uses that persisted ownership to recover the platform's upward native BRep
faces. It preserves the full polygon, holes, elevation and native thickness.
Bounding boxes, railings and proximity do not authorize a platform.

`stairDisplay.sourceFlights[].landings` and bound `flights[].landings` are optional
for older packages. The renderer draws platforms alongside the runs in 2D,
3D rooms and 3D relative heights. Actual solid upper floors occlude platforms
below them; native floor openings remain open. A platform is a thin suspended
surface, not a column extending to ground. Stair inspection frames include the
platform's full extent.

Native returning runs also prove a one-riser offset in the analytic sketch
heights. Where a certified native run has the complete same tread count,
preparation uses its full walking faces. Partial mesh recovery falls back to
the sketch rather than deleting steps. Native run endpoints restore the initial
and terminal risers; native profile edge order is retained when matching BRep
vertices so a terminal riser stays on the correct edge.

To refresh an existing master without rebuilding routes:

```sh
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/refresh-stair-landings.ts \
  /absolute/path/master.reviter.zip \
  /absolute/path/exact-model-native-cache.json \
  /absolute/path/new-output-directory
```

The source-model hash must match. The script writes a new master, viewer and
landing report, never overwrites existing output files, checks both ZIP
round trips, preserves every routing/access field and compares original source
assets byte for byte. Re-import the refreshed ZIP to display the new surfaces;
an older ZIP cannot contain platforms that were never exported.

Validation includes all 22 owned native platforms, the two pinned turning
assemblies, native step heights and endpoint caps, missing native evidence,
platform holes, upper-floor occlusion, unchanged route data, and desktop/mobile
browser checks in all four map views.

The native cache also contains four landing elements with self-ownership and no
assembly link (#1305763, #1307186, #1307587 and #1523152). These remain unassigned
and are listed in the refresh report; proximity does not attach them to a stair.
