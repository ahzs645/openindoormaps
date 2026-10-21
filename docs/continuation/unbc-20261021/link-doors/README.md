# Building 4–8 link doors: reviewed curtain-door apertures

Proposed source review, October 21, 2026. Background and the wider list of unmatched doors: Reviter `docs/continuation/unbc-20261020/UNMATCHED-LINK-DOORS.md`.

## What the native model shows

Both link doors at the Building 8 end are door panels in glazed curtain walls:

- **2311764** on Floor 2, level 694, host 2311758.
- **2315416** on Floor 3, level 400176, host 2315413.

The glass line is at x ≈ 30.61 ft. Each door sits between two same-host jamb mullions (Floor 2: 2311780 and 2311774), with a head (2311779) and sill (2311773) spanning its clear width.

The curtain host carries a persisted thickness of 3.2808 ft (x 28.97–32.25), and the room outlines on both sides were drawn to that band. `directoryDoors` stretches a door across its host's band only for measured hosts, and these hosts are `approximate`. So each door kept its 0.08 ft leaf and matched no room.

## The review

`DOOR-APERTURE-REVIEW.json` adds one reviewed aperture per door, built from native evidence only and following the existing curtain-door apertures pin67, pin68 and pin83–85:

- the door's clear width between its jambs;
- across the host's persisted thickness;
- the four same-host frame members;
- the host's original plan parts as wall evidence.

Reviter's validator (`withReviewedDoorApertures`) accepts both against the native model, alongside the 11 saved apertures.

The compiler reads the review with `--door-aperture-review` (`scripts/indoor/source-door-aperture-review.ts`). The input is append-only and never replaces a saved reviewed aperture. It writes `source-door-aperture-replay.json` beside the output.

## Scoped proof

This ran on the attempt 006 compiler inputs: the master (`d5a829e8…`) and the native cache (`bfc1f261…`), with the model byte-identical to the original `.rvt` (`8c294549…`). Door matching was run with the master's hydrated rooms, and the baseline includes the 11 saved apertures.

| Door              | Before    | After                                     | Other doors changed on the level |
| ----------------- | --------- | ----------------------------------------- | -------------------------------- |
| 2311764 (Floor 2) | unmatched | connected: 08-216 Vestibule – 08-260 Link | 0 of 511                         |
| 2315416 (Floor 3) | unmatched | unmatched: only 08-360 Link               | 0 of 336                         |

Floor 3 still needs a room outline on the Building 8 side. The walkable cell continues into 08-305 Corridor, but no room outline lies within the door's reach. That is a room-review decision, not an aperture.

## Not confirmed

Whether these doors are normally open and public has not been checked on site. Room access stays as recorded, and unknown stays unknown.

## Recompiling

The full native recompile with this review runs outside the cloud container. Steps, the input manifest and a Colab notebook are in [`../recompile/`](../recompile/README.md).
