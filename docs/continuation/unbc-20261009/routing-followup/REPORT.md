# Routing follow-up — 2026-10-09 (transcribed by coordinator from the routing agent's final report)

Nothing was applied to production, source ZIPs, canonical master or routes. Inputs: compiled dataset `2fad94fd…`, B9 owner extract `5d2f356b…`, staff-zone carrier `dd3362b7…`, registered DWG sections in `../shared-extracts/dwg/`. New shared extracts: `../shared-extracts/compiled-2fad94-routing-core.json` (`219517d4…`), `compiled-2fad94-material-sections.json` (`87f34328…`). File hashes: `FILES.sha256`.

## Common root cause
`envelope-omission-census.json`: 76 walkable records are at least 50% on native floor but less than 50% inside `nativeIndoorEnvelopes` (old outlines used for names only). They get no native cell, so no walking branch or lift attachment. Includes B9 Floor 0.5 (09-260 Lobby, 09-261, 09-201/207/224, 09-218, lower approach of ramp #1643796), B7 07-502 and Agora pin-9 circulation, B8 Floor 1.25 (08-102/105/140/155/156/159), B10 atrium 10-1300..1312, Floor 2/3 crosswalks, 10-4300/4302/4304/4306, Floor 2 corridors in 04/06/08/09. This one omission explains the remaining B9, B7/8-upper and B10 failures.

## A. Building 9 lift lobby — NOT certified (blocked)
Unchanged production cutter at five envelope heights (wall #1521392's 16 parts included); every physical door closed for enclosure, the nine applied B9 seal bands (assumption labels kept) and frame returns. Boundedness decided with the exact production rational overlay; point contact is not a passage. Each necessary interval confirmed by removing its closure and retesting. `b9/b9-lobby-enclosure-verdict.json` (`6932ef20…`).
- Floor 0.5 at +4 ft: open, 16 necessary intervals.
  - 63.5 mm at (174.579,443.611)–(174.726,443.758), wall #1521222 ↔ curtain member #1948433 (host #1948340), beside unmatched door #1948341. DWG cap segments #1250/#1251 run across it.
  - 50 mm at ≈(286.52,553.94), #1521392 ↔ curtain #1522657 (host #1522656). DWG facade line #421 (90 ft) continuous.
  - 11.9 mm at (130.39–130.43, 461.06), #1521468 ↔ #1521453. DWG wall #3870 continuous.
  - 13 exact micro-gaps ≤1.4e-5 ft (mostly north-facade curtain joints; jamb joints at doors #1964672, #1521412, #1951047).
- +8 ft: 17 intervals, adding a 1.03 ft opening at (259.04,459.68): column #1521242 has no certified closed cut at that height, so the user's 1976247–1521242 seal meets a missing body.
- +0.1/+1 ft: open >4 ft through the ramp #1643796 well under B7's floor; needs a connector-cap rule.
- Floor 2: 39 intervals incl. 0.9–3.8 ft south-facade openings (y≈459); only reconstructed display-only walls #1521701/#1521704/#1522479 there (no native BRep). DWG facade line #710 (95 ft) continuous.
Existing seals stay active but close none of these. North/south lift aperture proposals remain valid but unapplied.
Questions: (1) provisional seals for 63.5 mm, 50 mm, 11.9 mm and 1.03 ft gaps? (2) generic exact-contact rule for curtain micro-gaps? (3) walls #1521701/#1521704/#1522479 — wait for native bodies or authorize an assumption?

## B. Building 4 — generic patch ready; does not fix 04-122→08-107 alone
Omitted branch: in `native-cell:0.000000:77`, the 04-126 side of doors `door:311:1591013:1`, `1025185:1`, `1032260:1`, `1032161:1` is never a terminal, though threshold halves are supported. Only 46.2% of 04-126's 577 sq ft lies in the cell, so the majority rule never makes it an owner. Code path: reviter `lib/reviter/native-circulation-geometry.ts` (membership rule ~l.362, `candidateDoors` from owners and owner skip in `nativeCellDoorApproach`, terminal filter in `attachNativeCirculationCellRoutes`).
Patch `patches/B-foreign-portal-terminal/` admits a portal whose door is enabled/connected with two owners, owner walkable/non-staff/same elevation, and whose original point or exact threshold half joins the cell's pure exact face as one part. Branch keeps all cell owners plus the portal owner (access only stricter). Not venue-specific. 73/73 tests (3 new + 70 existing), typecheck clean.
04-122→08-107 still has no connecting edge even ignoring access (37-node vs 265-node component); blocker is B7/8.

## C. Building 7/8 ramp #1622190
Lower approach ready: 53.09 ft path `ramp:1622190:lower` → `door:311:1951047:1`, south of the walled box at door #1948987; centre line and 1-ft strip supported on all 10 segments physically and in the staff-zone remainder; crosses only 07-180 and the ramp landing. Still needs the staff-zone contract in compiler/runtime and per-branch owner rules; east side of door #1951047 (Agora pin-9) is outside the envelope.
Upper end blocked: landing reaches stair hall only through unmatched single-owner door #1630256; cell 256 also contains 08-106 via a corner seam; 08-102 Corridor has no cell (0.1% in envelope) so door #2018182 unattached.
Questions: associate door #1630256 between landing and 08-S101? Is the 08-106 corner seam real?
Files: `b78/NATIVE-ACCESS-ZONE-PROPOSAL-REVISED.md`, `candidate-approach-path.json`, `candidate-approach-validation-exact-carrier.json`.

## D. Building 10 — no valid alternative route in current source
All six B10 stair flights are source-disabled (incl. #2474568, #1500191) and stay disabled. Both lifts are 4-node islands: served-floor owners (atrium, crosswalks) are outside the envelope. Floor 4: west wing (10-40xx, 142 nodes) and east wing (10-45xx, 166 nodes) disconnected; linking corridors 10-4300/4302/4304/4306 fully on floor but 0–0.5% in envelope (also the lift stops); 10-S401 0% coverage, 10-S402 61.7%; 10-4070 Office arrival isolated.

## E. Routing guide binding
Cause: route worker strips circulation display tessellation; viewer strips exclusion notes and old cached stair treads; each changes `preparedRoutingKey`, discarding guides.
E1 (patch ready, `patches/E-prepared-routing-binding/`): key over one routing-only projection identical across master/worker/viewer; test reproduces old mismatch and confirms nine physical/permission edits still change the key; 10/10 pass. Guides must be re-prepared.
E2 (design only, `DESIGN.md`): reuse prepared walk verdicts, exactly recheck each returned route's edges through the existing retry loop, run the full global pass before ever reporting "unavailable".

## Not run
Full-dataset runtime walk-guard replay of the C path and campus-wide replay of patch B (cancelled while queued behind other heavy jobs). Exact carrier validation and fixture parity stand in.

## Next workstream
Envelope recovery for the 76 omitted records (B9, B8, B10 atria/corridors first), pending user answers on provisional seals and reconstructed-only walls.
