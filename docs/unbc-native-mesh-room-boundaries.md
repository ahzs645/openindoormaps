# Native mesh room boundary recovery

The compiler now retries unfinished room interiors using horizontal sections of
certified native Revit wall/column meshes. It uses per-triangle element ownership,
the model origin and the native level elevation plus four feet. Only closed,
unbranched material sections qualify. The 0.0001-foot endpoint tolerance accounts
for tessellation roundoff; it cannot close an architectural gap.

Original routing barriers, native doors, neighbouring room labels, protected
circulation and precise native floor support remain acceptance gates. A recovered
visual room must be completely supported by the native floor. The resulting
`native-mesh-wall-enclosure` evidence includes the cut height, native owners,
precision and supported area. Import validation requires this evidence.

This refresh preserves all existing prepared room boundaries and updates only
presentation data. It does not change room identities, access, arrivals or route
geometry. The regular Reviter preparation pipeline also includes the new stage.

## Current UNBC result

Four additional rooms were recovered: 05-308, 04-429, 04-422 and 05-255. Prepared
rooms increased from 1,238 to 1,242; unresolved compiler entries decreased from
322 to 318. Repeating the native-cache command produced an identical dataset.

Office 10-1040 remains unclosed. Its west-side gap is present in the certified 3D
section and registered drawing evidence. A rectangular volume would invent a
boundary. The visitor view now shows its actual native slab and walls, retaining
the name, selection and existing directions. Compiler-rejected room outlines are
available in review mode, but do not generate visitor room blocks.

Native slab ground preserves apertures and disconnected parts. Coloured hallway
surfaces sit above that neutral ground to avoid depth fighting. Relative heights
retain native slab elevations and cut the actual ramp footprints. Decorative
slabs cannot intercept clicks on the retained room selection footprints.

## Repeatable refresh

From OpenIndoorMaps, with the sibling Reviter repository and a cache belonging to
the exact source-model SHA:

```sh
node --max-old-space-size=6144 --import tsx \
  scripts/indoor/regenerate-presentation-from-native-cache.ts \
  /path/to/master.reviter.zip /path/to/native-cache.json /path/to/new-output-directory
```

Output paths must be new. The refresh checks model identity, current source
geometry bindings and unchanged source/graph sections before exporting both ZIPs.
Keep the input ZIP for recovery. Prepared room metadata is authoritative only for
its matching model and source geometry.

## Verification

The actual native-mesh fixture covers the four successful rooms and 10-1040's
genuinely open side. Additional tests reject display proxies, reconstructed
owners, dangling/branched sections, missing floor material and shared labels.
Browser checks cover desktop/mobile, 2D/3D, direct canvas selection of 10-1040 and
the mesh evidence in the room inspector. Source model, scene, room reviews, GIS
and all non-presentation dataset sections are compared before release.

This is a local update. The remaining 318 entries still require boundary evidence
or source review; the compiler does not convert them into verified enclosures.

## Wall-aligned floor tint for unfinished rooms

Removing an unfinished room's raised block alone left blue wedges next to its
walls: the circulation display still excluded the coarse source outline. Visitor
floor preparation now follows nearby continuous native wall-material faces for
the neutral room floor mask and its transparent click footprint. This is shared
by 2D, 3D and relative-height views, and runs in the floor worker.

The rule is generic. It requires current model evidence, exact wall footprints,
at least two supported edges, full precise native slab support and no significant
expansion into another place. Native door apertures remain blue, and an expansion
across a slab opening is rejected. Review mode retains the source outline.
Unsupported sides remain semantic tint seams; this does not manufacture a wall,
door, verified enclosure, room block or routing connection. Source records,
permissions and the route graph remain unchanged.

For 10-1040, the top, right and bottom edges now meet the native wall faces,
including corners previously cut short. The west-side opening remains a source
review issue. The probe found applicable masks for 69 unfinished rooms across the
three native levels composing Campus Floor 1; this is not a count of newly
verified room enclosures.

Verification: 18 targeted geometry/worker checks passed. Desktop and mobile
browser checks passed for 2D, 3D and relative heights, including the three formerly
blue corner samples and real canvas selection in a newly filled corner. The
mobile test pans above its discovery sheet before tapping. Frontend scoped
TypeScript and the Pages build passed. Evidence is saved in
`/Users/ahmadjalil/Downloads/UNBC.final/verification/wall-face-floor-masks/`.
The existing master ZIP is sufficient; this correction is computed by the app.
