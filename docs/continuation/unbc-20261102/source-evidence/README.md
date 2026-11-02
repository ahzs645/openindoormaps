# Native source evidence for three unresolved doorways — November 2, 2026

Evidence only. No owner is chosen. No master, room outline, door link, aperture,
access rule or route was changed. The two existing proposals in
[`../../unbc-20261101/connections/proposals/`](../../unbc-20261101/connections/proposals/)
gained only a `sourceEvidence20261102` reference field.

| Case | File |
| ---- | ---- |
| 1. Door 2471813, 10-1300 Vestibule ↔ 10-1302 Atrium (Campus Floor 1, level 1487816) | [case1-2471813-frame-evidence.json](case1-2471813-frame-evidence.json) |
| 2. Door 2315416, 08-360 Link ↔ Building 08 side (Campus Floor 3, level 400176) | [case2-2315416-strip-owner-evidence.json](case2-2315416-strip-owner-evidence.json) |
| 3. 03-1052 Vestibule, doors 1425507 / 1425511 / 1425135 / 481695 (Floor 2, level 694) | [case3-03-1052-outline-evidence.json](case3-03-1052-outline-evidence.json) |

Each file lists its inputs with SHA-256, the method, the exact values and what
still needs a decision.

## Inputs and method

- Master `master-0388.zip` `6e7971f8917dafa639afa2e1523a5b1ad48aac55ef5d9db9827162335c47f903`.
  From it: the RVT (`8c294549…`, equal to the manifest) and `floors/rooms.json`
  (`5060e6f9…`).
- There is no saved native-model cache on this host. The RVT was therefore
  converted again with the compiler's own call, `convertRvtBytes(bytes,
  archivedFileName, {})`, using the unmodified Reviter checkout at `2e7875d`.
  This yields 40,611 element records and 27,568 persisted host relations, in
  65–82 s and about 1.2 GB.
  [tools/dump-native-evidence.ts](tools/dump-native-evidence.ts) writes the
  following for three fixed windows:
  - the records: category, provenance, `orientedBox`, `boundsFeet`, solid and
    persisted host;
  - the compiler's plan cut (`architecturalPlanGeometry`);
  - native BRep triangles for selected elements;
  - a census of room, area and separation-line records;
  - dry-run replays of the compiler's `withReviewedDoorApertures`, with
    one-patch reviews held in memory and nothing written.
- Native cells come from the pathway preview of the same master
  (`cand-final-preview/data`, `sourceInputSha256` = `6e7971f8…`). Door-side
  probes come from `cand-final/native-door-sides.json`.
  [tools/build-evidence.py](tools/build-evidence.py) assembles the three
  files. It needs shapely, which was installed in a scratch virtualenv.
- The native dump stayed in scratch (2.5 MB). Its SHA-256 identifies only this
  run, because it records the conversion time. Re-run the tool to regenerate
  it.

```sh
# Reviter checkout at 2e7875d, RVT extracted from the master (sha 8c294549…)
cd ../reviter && flock /home/user/unbc-work/heavy2.lock node --max-old-space-size=8192 \
  --experimental-strip-types --import ./scripts/register-test-typescript.mjs \
  PATH/tools/dump-native-evidence.ts ORIGINAL.rvt native-dump.json
python3 -I tools/build-evidence.py native-dump.json rooms.json \
  /home/user/unbc-work/cand-final-preview/data /home/user/unbc-work/cand-final OUT \
  /home/user/unbc-work/master-0388.zip \
  /home/user/unbc-work/final/accept/UNBC.shared-pathways.candidate.reviter.zip
```

**Room boundaries are not in the native data.** The converted model contains
no Room (−2000160), RoomSeparationLines (−2000066), Area (−2003200) or
AreaSchemeLines records anywhere. The schema declares `Room`, `RoomBoundary*`
and `SpatialElement*` classes, but none are decoded into records. Room
ownership in this pipeline comes only from the DWG-derived outlines in
`floors/rooms.json`. The DWG itself is not in the master or anywhere on this
host. A drawing check therefore cannot be done here.

## Case 1: door 2471813 (10-1300 Vestibule ↔ 10-1302 Atrium)

**Frame evidence: found.** It fills the proposal's "TO FILL FROM THE NATIVE
MODEL" placeholder. Exactly four Curtain Wall Mullions (−2000171, `element-header`,
provenance `native`) belong to host 2471383, the same persisted host as the
door:

| Member | Role | x | z |
| ------ | ---- | - | - |
| 2471836 | west jamb | 173.87234126865442..**174.0363832634051** | 3.2808..11.1549 |
| 2471837 | east jamb | **179.64661948387752**..179.8106614786282 | 3.2808..11.1549 |
| 2471832 | sill | 174.0364..179.6466 | 3.2808398950131235..3.4448818897637796 |
| 2471834 | head | 174.0364..179.6466 | 11.072834645669289..11.236876640419947 |

- The exact `orientedBox` of each member, byte-identical to `elementBounds`,
  is in `frameEvidence` in the JSON and ready to paste.
- The proposal wrote the east inner face as `179.6466194838775`. That string
  is a different double. The model, the door box and the proposal's own
  `apertureFeet` all use `179.64661948387752`.
- Only the two jambs cross the plan cut at 7.2808 ft.
- The wall evidence (host 2471383 plan parts) equals the current plan cut
  byte for byte.
- The validator's dry run **accepts** the patch.
- The validator does not tell head from top mullion: a control run with
  2471831 also passes. The head and sill roles rest on z: they meet the leaf's
  top and bottom to within 6e-15 ft.

**Element 2472128 is neither a grid line nor a real obstruction in the native
body.**

- It is a basic wall (−2000011), type "Interior Wall - 100mm", Gypsum
  Wallboard, 0.328 ft thick and full height (z 3.28..13.78). It runs between
  the faces of walls 1501264 and 1501266.
- Its native BRep has only two pieces: x 170.684..171.373 and
  x 182.266..182.984. It is cut exactly where curtain wall 2471383
  (x 171.373..182.266) is embedded.
- The plan cut, however, draws it from its full-length solid across the door
  band.
- After the reviewed aperture cut, 2472128 still overlaps the aperture by
  1.84 sq ft. **The aperture alone would not open the door.**
- A dry run that also lists 2472128's exact plan parts in `wallEvidence` is
  accepted. It leaves nothing overlapping the aperture.

The sill 2471832 is a **model-derived 50 mm** threshold (0.16404 ft). It is not
a measurement.

**Still needs a decision**

- Is the door normally open and public?
- Is there a partition on the 2472128 line? The native body says no.
- How should the embedded-curtain cut in 2472128 be represented?
- Is the 50 mm sill real?
- 10-1300's outline is a `survey-boundary-proposal` with `pendingReview: true`.

**Next repair steps**

1. **Review record.** Append `reviewed-aperture:1487816:2471813:10-1300-atrium`
   to the source door-aperture review (`scripts/indoor/source-door-aperture-review.ts`,
   compiler `--door-aperture-review`). Use the proposal's `apertureFeet`, the
   host 2471383 `wallEvidence` and the four `frameEvidence` entries from the
   JSON. After the source review confirms there is no partition, choose one of
   these for 2472128:
   - add its exact current plan parts to `wallEvidence` (validated in the dry
     run);
   - fix the compiler so the plan honours the embedded-curtain cut.

   Accept or replace the pending 10-1300 boundary.
2. **Rebuild.** Run the Reviter compile with the review and check
   `source-door-aperture-replay.json`. The automatic matcher should then pair
   10-1300 with 10-1302, so no `doorLinks` record is needed. Run
   `verify-shared-corridor-candidate.ts` for the candidate.
3. **Both-side approach checks.** For `door:1487816:2471813`, check that each
   portal (10-1300 side and Atrium side) has a supported walking approach, for
   example with Reviter `audit-native-gateways.ts` or the approach topology
   statistics. A connected door with an empty side repeats the 06-388 failure.
4. **Walking and step-free rechecks.** Re-run route acceptance through 10-1300
   (walking) and the step-free profile. The 50 mm sill must remain a step
   unless a site check finds the threshold flush.

## Case 2: door 2315416 (08-360 Link ↔ Building 08 side)

**Distances.** All three measure the same gap on the door's centre ray
(y 528.5495338272797) to 08-316's drawn west edge at x 35.4648246270012, from
different origins:

| From | Position | Distance to 08-316 |
| ---- | -------- | ------------------ |
| door centre | x 30.6125 | **4.852 ft** |
| aperture face | x 32.2529 | **3.212 ft** |
| native probe, 0.25 ft beyond the face | x 32.5029 | **2.962 ft** |

The probe gap is above the 2 ft native-owner default.

**What the evidence shows**

- The strip is x 32.2529..35.4648 by y 526.6952..530.4039. No native element
  has bounds inside it above the floor top (24.278 ft): no wall, curtain
  member, door, column, or room/area/separation record.
- It is bounded by host 2315413 to the west, basic wall 1505949 to the south
  (face y 523.0768) and basic wall 1505979 to the north (face y 532.4029). It
  continues east into 08-316's drawn area **without any native wall at
  x 35.46**. Neither edge wall hosts a door.
- All 25 strip samples lie in native cell 826 (17 rooms). No room outline
  covers any of them.
- 08-316's drawn west edge lies within 0.0026 ft of the east face of curtain
  host 2066749's 3.28 ft envelope (x 35.4674). That host has geometry only at
  y ≥ 536.08, but its decoded location line nominally starts at y 522.36.
- **Floor 2 analog.** Door 2311764 has the identical host, clear width and
  bounding walls. There the space east of the host is drawn as **08-216
  Vestibule**, reaching x 32.2491, and the door is connected 08-216 ↔ 08-260
  Link. The Floor 3 footprint with the same shape is drawn as 08-316 Corridor,
  starting at x 35.4648.
- **Sill.** 2315423 is a 50 × 150 mm bottom mullion. Its top is 0.16404 ft
  above the native floor (exact rise 92347433304021/562949953421312 ft). It is
  **model-derived, not measured**.

**Candidates.** No owner is chosen. The JSON gives the full evidence for and
against each candidate.

| Candidate | For | Against |
| --------- | --- | ------- |
| 08-316 Corridor | Nearest outline (2.962 ft from the probe). No native partition. Same cell. Its Floor 2 twin owns the strip. | The drawing puts its edge 3.2 ft short. Above the 2 ft limits. |
| Unnamed vestibule | Floor 2 calls the same footprint a Vestibule. The depth fits a door landing. | No Floor 3 label, outline or enclosing element. |
| 08-305 Corridor | One of cell 826's names. | Its outline is 33.67 ft away and covers no strip sample. |
| 08-360 Link | Hosts the door. | It is on the other side of the glazing, in cell 816. |

**A site or drawing check must confirm:**

- Is there any partition, screen or door at about x 35.46 between walls
  1505949 and 1505979 (drawing 08 Tea Lab LVL 3)?
- Is the space east of the curtain door 08-316, a numbered vestibule, or
  another room?
- Is the door normally open and public?
- Does the 50 mm sill exist?

**Next repair steps**

1. **Review record**, after that check:
   - If the strip is 08-316 or another existing room: a room-outline review
     extending that outline to x 32.25292197524376 between y 523.0768 and
     532.4029. It is then a legacy candidate at 1.64 ft. Add the optional
     `navigation.doorLinks` record [08-360, owner].
   - If it is a vestibule: a new room record with the drawing's number and
     that outline.

   Do not raise the global 2 ft limit for this door.
2. **Rebuild** and confirm that door 2315416 is connected with the reviewed
   owner (the Oct 21 aperture is already applied).
3. **Both-side approach checks** on the 08-360 portal (cell 816) and the
   Building 08 portal.
4. **Walking and step-free rechecks.** Walk 04-302 ↔ 08-302 in both
   directions. Step-free must keep refusing the 50 mm modelled sill unless a
   site check finds it flush.

## Case 3: 03-1052 Vestibule (Floor 2)

**What the evidence shows**

- 03-1052 is a double-door vestibule:
  - west curtain hosts 481694 and 1425129, with doors 481695 and 1425135;
  - east curtain host 1425500, with doors 1425507 and 1425511.

  All three hosts have 3.2808 ft envelopes.
- **Pocket.** The vestibule interior in native cell 601 spans x 6.2063..14.3428
  and y −158.5204..−137.3853, 171.966 sq ft. Its faces are the inner mullion
  faces west and east, wall 710235 to the south and wall 481981 to the north.
- **Joins.** The pocket separates from the rest of cell 601 under a
  morphological opening at 0.01 ft, but not at 0.005 ft:
  - Its only finite-width joins are two **0.013123 ft (4 mm)** slivers at
    y −158.5204..−158.5073, under the bottom mullions 1425532 (east,
    x 14.3428..14.8349) and 1425150 (west, x 5.7141..6.2063).
  - Across the east wall, holes 2 and 6 meet with a **2.8e-14 ft slit** at
    y −149.976474 (x 14.3428..14.8349).
  - The outer ring touches holes at single points (14.58882, −137.385267) and
    (14.572416, −160.910593).
  - Holes 3 and 5 have zero area.
- **Outline gaps.** 03-1052's drawn outline (x 7.4153..13.0153,
  y −158.1834..−137.3834) falls short of the pocket by 1.209 ft (west),
  1.327 ft (east) and 0.337 ft (south). On the north it overhangs by 0.002 ft.
  03-1104's west edge (x 16.2153) is 1.380 ft from the east mullion face.
- **Door sides.** All probes are 0.25 ft beyond the face.

  | Door | West face | East face | Host |
  | ---- | --------- | --------- | ---- |
  | 1425507, 1425511 | pocket (03-1052 1.219 ft from the probe) | main part of cell 601 (03-1104 1.272 ft) | 1425500 |
  | 1425135 | the 0.88 ft slab strip outside the west glazing, inside the curtain envelope | pocket | 1425129 |
  | 481695 | no cell (exterior) | pocket | 481694 |

- **Legacy check.** The leaf is 0.2083 ft deep, so the legacy reach is
  0.704 ft along the normal. 03-1052 (1.574 ft) and 03-1104 (1.627 ft) both
  fail it today. Both are within the 2 ft outline limit.
- **Aperture option.** Curtain-aperture dry runs pass for both doors. For
  1425507: jambs 1425541/1425542, sill 1425528, head 1532179. For 1425511:
  jambs 1425543/1425544, sill 1425530, head 1532181. Nothing remains
  overlapping either aperture. The host band would widen the reach to
  2.240 ft, so both sides would pass. That is an option to review, not a
  decision.
- The sills 1425528 and 1425530 are **model-derived 50 mm**.

**Still needs a decision**

- Confirm the owners from the drawing (03 CJMH LVL 1) or on site: 03-1052 for
  the pocket, and 03-1104 for the east side of 1425507/1425511. 03-1101
  Entrance is a cell-601 name, but its outline is about 150 ft south.
- Are 481695 and 1425135 exterior entrances?
- Are the doors normally open and public?
- Are the sills real?
- Should the 4 mm mullion-to-wall gaps be closed, so that the vestibule
  becomes its own native cell? That needs a separately evidenced
  `nativeBoundaryPatches` review, not a default.

**Next repair steps**

1. **Review records.**
   - Outline review of 03-1052 to the pocket faces (x 6.2063..14.3428,
     y −158.5204..−137.3853).
   - Then either an outline review of 03-1104's west edge, or the reviewed
     curtain apertures for 1425507/1425511 using the members above.
   - `navigation.doorLinks` for 1425507 and 1425511:
     [`rm-694-484f9eec97d0`, `rm-694-70a5a7eafba5`].
   - Leave 481695 and 1425135 until the exterior question is answered.
2. **Rebuild** and confirm that 1425507 and 1425511 are connected and that
   03-1052 gets an arrival node.
3. **Both-side approach checks** on the pocket portals and the 03-1104
   portals.
4. **Walking and step-free rechecks** to and from 03-1052. The 50 mm sills
   stay steps unless a site check finds them flush.

## Not determined here

- Any site fact: door operation, public status, whether the sills or the
  2472128 partition exist, and partitions at x 35.46.
- The DWG linework behind the 08-316 and 03-1052 outlines. The DWG is not
  available on this host.
- Native room, area or separation-line geometry. None is decoded from this
  RVT.
- Why curtain host 2066749's decoded location line starts at y 522.36 with no
  geometry there.
- Whether the 4 mm slivers in cell 601 are modelling gaps or real.
- No route, approach or browser check was run, because nothing was applied.
