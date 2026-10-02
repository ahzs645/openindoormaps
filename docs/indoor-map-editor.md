# UNBC map editor

Open `/projects/indoor`, choose **Import project ZIP**, and select
`/Users/ahmadjalil/Downloads/UNBC.indoor.open-fronts.reviter.zip`.
Choose **Edit map** to open the editing tools. The editor starts in 2D;
labels also appear in the visitor and 3D views.

## Editing workflow

- **Add label**: enter text, choose a native level, color and size, click its
  position on the map, then choose **Create annotation**.
- **Draw area**: enter a label, click at least three corners around the area,
  then choose **Create annotation**. Remove the last point to correct a drawing.
  Crossing edges, repeated corners and areas with no surface are rejected.
- Click an annotation on the map or in **On this floor** to change its text,
  color, size or notes. **Move annotation** places a label or translates an area
  using its first corner. **Edit area corners** moves or removes individual corners.
- **Select** a source room to open its inspector. Use **Visitor names,
  categories and colors** for public names, descriptions, categories,
  departments, room colors and building names. Existing access and connection
  reviews remain available under **Review project**.
- **Undo edit** and **Redo edit** include annotation and room-review changes
  during the current session. Up to 15 preceding versions are retained.
- **Export reviewed project** saves the completed edits in this browser.
  Choose **Download reviewed ZIP** for a portable backup. The download link is
  invalidated by further edits. Unfinished drawings must be created or cancelled
  before export. A page-close warning appears when saved edits are outstanding.
- **Explore map** previews labels alongside the existing visitor map and routes.
  Changing floors shows only annotations assigned to that floor's native levels.

## Scope and storage

This is an independently implemented OpenIndoorMaps editor. The downloaded
Mappedin capture was inspected as a workflow reference: its location panel has
names/descriptions, categories and label previews, and its source imports
Mappedin-specific stores, packages and services. No source from that capture
was copied into the app.

Annotations are presentation data, rather than room destinations or navigation
barriers. Highlighting a restricted or closed area does not itself prevent a
route through that area; use the existing source access/connection reviews.
Wall boundaries, room geometry, doors, arrival points and routing connections
must be edited and recompiled in Reviter. This editor does not modify RVT files.

The optional `floors/rooms.json.mapEdits` object stores a version, source model
SHA-256, and annotations with stable IDs, native level IDs and coordinates in
model feet. Import and export validate model/floor identity, coordinate bounds,
text, colors and polygon topology. The project ZIP uses its existing manifest
and recomputes hashes; original RVT, GLB and GIS bytes are preserved. No new
archive entry or alteration to the portable indoor dataset contract is required.

Existing ZIPs without annotations continue to work. Annotation preservation
through OpenIndoorMaps export, re-import and browser restoration is tested.
Preservation through a separate Reviter regeneration is not verified; keep an
exported ZIP as your backup before regenerating in another application.

## Verification

```sh
npm run test:indoor
npx tsc --project tsconfig.indoor-project.json
npm run build
INDOOR_PROJECT_ZIP=/absolute/path/UNBC.indoor.open-fronts.reviter.zip \
  npx playwright test --config playwright.chrome.config.ts \
  tests/e2e/indoor-map-editor.spec.ts --workers=1
```

Browser tests cover real label placement, move and rename, drawing areas,
corner moves, delete/undo, floor isolation, desktop/mobile layout, ZIP export,
re-import and IndexedDB restoration. Unit tests additionally reject annotations
from other models and invalid polygon geometry and verify rotated GIS alignment.

## Expanded editor (Mappedin comparison, 2026-10-02)

The live logged-in Mappedin map was checked again, including its tool groups,
space-type inspector, location manager, safety library, layer controls and
exports. That particular map contains a room with no attached locations;
populated location fields were cross-checked against the downloaded capture.
The implementation below is independent and uses the existing Lucide icons.

| Source capability | OpenIndoorMaps implementation | Remaining difference |
| --- | --- | --- |
| Managed locations | Create, search by name/category/tags, sort A–Z/Z–A, filter attached/unattached, delete with undo | No shared cloud location service |
| Attach/detach geometry | Attach one location to multiple source rooms; detach individually; automatic room labels; marker position/reset | Room identities remain tied to the imported model |
| Location details | Name, description, category, tags, color, symbol, visibility, website, phone, hours, social/custom links, photo and logo URLs | Hours are free text; photos/logos open as links; no asset upload or image marker |
| Visitor preview | Attached names/colors/descriptions in room display and search, tags in search/directions, contact information in place cards; standalone marker cards | Standalone points do not create routing destinations |
| Labels/safety symbols | Text, size, color, notes, rotation, 19 bundled symbols plus text-only labels; room-linked labels | Smaller original icon catalog, not Mappedin's full safety library |
| Objects/areas | Polygons, two-corner rectangles, center/radius circles, polylines, distance measurements in feet/metres | Map objects do not become structural barriers |
| Editing commands | Move, edit/delete corners, duplicate, nudge, multi-select lists for bulk duplicate/delete, 1 ft grid snapping; keyboard copy/paste, arrows, undo/redo, Escape | No canvas multi-selection or wall corner straightening |
| Layers | Geometry/annotation opacity, room/building labels, street map visibility | No satellite provider configured |
| Floors | Editable display names; copy annotations to another existing native level | No new structural floors, elevation editing or source wall copying |
| Export | Complete reviewed ZIP, current-floor SVG/GeoJSON, original source GLB | Not MVF; no generated safety PDF, edited 3D scene, or Microsoft Places integration |
| Structural review | Existing wall-area inspection, door/access reviews and source-backed connector floor spans remain under Review project | Structural walls/doors/windows/room boundaries and GIS changes require Reviter regeneration |

The editor hides the unused room inspector when editing annotations, leaving
more space for the map. Source rooms still have their contextual inspector.
Annotations and locations are part of the same undo/redo history.

`mapEdits` retains version 1 compatibility and adds optional `locations` and
`floorNames`. Managed locations are registered to source room keys and/or a
native level and marker position. Import rejects duplicate room attachments,
invalid floors, non-finite positions, malformed details and non-HTTP(S) URLs.
Visitor presentation is derived from room-linked locations when opening the
project; the original room and graph records remain intact in the ZIP.

### Gradual zoom detail

Visitor maps blend their building overview into individual rooms from zoom
17.5 to 18.5, in both directions. Room colors, wall heights, fills, outlines,
lower-floor depth and room labels interpolate across this range. Building
labels fade away as room labels fade in. Connector icons have their own fade
from zoom 17.5 to 18.5. Review/edit mode exposes source details directly.

### Additional verification

```sh
INDOOR_PROJECT_ZIP=/absolute/path/UNBC.indoor.open-fronts.reviter.zip \
  npx playwright test --config playwright.editor.config.ts \
  tests/e2e/indoor-map-editor.spec.ts \
  tests/e2e/indoor-editor-upgrade.spec.ts \
  tests/e2e/indoor-zoom-context.spec.ts --workers=1
```

The expanded browser test exercises room attachment, marker placement/reset,
location details and search tags, symbols, duplicate/nudge/undo, rectangle and
circle placement, measurements, layer opacity, floor naming, SVG/GeoJSON,
visitor details, and ZIP round trips on desktop and mobile. The zoom test checks
partial label opacity through intermediate zoom levels in both directions.

`playwright.editor.config.ts` uses installed Chrome and a dedicated Vite configuration with hot reload disabled during archive round-trip tests. Normal development continues to use `vite.config.ts`.

### Hallways and native stair presentation

Hallways use a soft blue-grey floor tint so they stand apart from white room
blocks. Visitor map clicks and place browsing do not treat corridors as rooms;
edit/review mode still permits inspection. Named corridors with a missing source
circulation flag, including 07-113A, receive passage presentation. Their original
access restrictions, classifications and navigation graph remain unchanged.

When a stair room contains separate native flights, each flight receives its own
stair marker at a measured tread near floor level. Descending treads retain their
negative native elevations in a dedicated depth layer, rather than being flattened
by MapLibre's non-negative extrusion heights. Native flight markers are display
anchors, not new routing connections. Projects require native tread data to show
individual measured steps.

The hallway and descending-stair browser checks use the prepared native-stairs
package and cover desktop/mobile, 2D/3D, visitor cards and review selection:

```sh
INDOOR_PROJECT_ZIP=/absolute/path/UNBC.indoor.pin-connectors.reviter.zip \
  npx playwright test --config playwright.editor.config.ts \
  tests/e2e/indoor-hallways.spec.ts \
  tests/e2e/indoor-descending-stairs.spec.ts --workers=1
```
