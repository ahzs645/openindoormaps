# Revised B7/8 ramp #1622190 approach proposal (supersedes the direct-segment test only)

Status: proposal. Nothing is applied. Geometry, access, doors, nodes and edges are unchanged.
The earlier `building10/performance/NATIVE-ACCESS-ZONE-PROPOSAL.md` stays as historical evidence.
Its lossless staff-zone partition (carrier sha256 `dd3362b7…`, geometry `b52f5ddf…`) is reused here
without modification.

## Lower end (Floor 1, level 311): a physically valid approach exists in source

The earlier failure was real: the straight segment from `ramp:1622190:lower` (48.2421, 461.5) to
`door:311:1951047:1` (97.7301, 453.5098) crosses the angled walled box at about x 71.5–89,
y 453–472. That box holds unmatched door #1948987. Replayed exactly: the centre line is
unsupported and the 1-ft strip is unsupported.

A detour south of the box is fully supported:

    (48.2421,461.5) (48.8,461.5) (51.8,456.5) (51.9,456.4) (53.4,455.5) (57.5,453.9)
    (62.1,452.9) (81.8,452.2) (81.9,452.2) (97.7,453.5) (97.7301,453.5098)   length 53.086 ft

The end points are the original node coordinates, unmoved. Exact production kernel results, from
`candidate-approach-validation-exact-carrier.json`:
- Both terminals are in original face `native-face:0.000000:293`. Neither is in staff zone `native-region:311:307`.
- The centre line is supported in the physical face and in the remaining semantic domain.
- The 1-ft swept strip is supported, physically and semantically, on every one of the 10 segments.
  Clearance is at least 0.55 ft from all material, including the box corner at about (82, 453).
- The path does not depend on any threshold half. It never crosses a doorway, so no door or portal is touched.

Identities crossed, replayed from metadata only and not used as geometry: 07-180 *Multi Purpose
Circulation Space and Hall* (circulation, access unknown) and the generated ramp lower approach
landing. About 9 ft of the centre line crosses native face that no identity covers. None of the
seven protected staff/unknown records is crossed.

What is still needed before a public branch can exist:
1. The staff-zone partition must be implemented as a compiler/runtime contract, with the binding
   and tests listed in the original proposal. Today face 293 is still rejected as a whole by the
   majority staff rule (07-702/704/706).
2. Per-branch semantic ownership. The remaining domain still mixes 59 identities, so a whole-cell
   `roomKeys` would block public through-traffic. The proposal is that the branch inherits only the
   identities its complete supported strip crosses: [landing, 07-180]. The same certificate must be
   recomputed in the compiler.
3. Door #1951047's east side is `reviewed-native:pin-9` (Reviewed Agora circulation). That record
   is 97% outside `nativeIndoorEnvelopes` (envelope fraction 0.028). Ramp → 07-180 hall is
   therefore supportable now, but ramp → Agora/B9 also depends on the envelope gap described in
   `envelope-omission-census.json`.

## Upper end (Floor 1.25, level 1487816): blocked, for three source reasons

`ramp:1622190:upper` (55.5, 466.5) lies in `native-cell:3.280840:256`. Its owners are the ramp
landing, 08-S101 Stair and **08-106 Research Office**.
- The landing joins the 08-S101 stair hall only through unmatched door **#1630256**. That door's
  point is (61.92, 464.61), its host is #1629345 and it has a single owner (08-S101). A thin
  residual strip runs beside the glazing panel at about x 71–76, y 456.5–459. No branch is built
  from the ramp node: there is no portal, and the grid finds no path wide enough.
- 08-106 shares the physical face with the stair hall through a modelling seam at its SE corner,
  about (59–61, 467–473). The selection contact repair that isolates 08-106 is selection-only, so
  every branch in cell 256 inherits an office owner.
- **08-102 Corridor has no native cell.** It is 764.6 sq ft, 100% on native slab #1514723 (the same slab as cell 256),
  but only 0.1% inside `nativeIndoorEnvelopes`. The 08-102 side of door #2018182 is therefore
  never attached, and stair hall → corridor is broken. 08-105, 08-140, 08-155, 08-156 and 08-159
  on the same level are omitted the same way.

Questions for source authority (native evidence alone does not settle them):
(a) Should door #1630256 be associated as a two-owner physical door between the ramp-upper landing
    and 08-S101?
(b) Is the 08-106 SE-corner seam a real opening, or does it need a provisional physical seal?
    The selection-only contact cannot change circulation.
Both answers are needed, together with the envelope recovery for 08-102, before any upper approach
can be proposed.
