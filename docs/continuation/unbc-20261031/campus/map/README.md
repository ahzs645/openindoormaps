# UNBC standalone campus map (diagnostic view)

`index.html` is a standalone diagnostic map of the four visitor floors. It is not
the production visitor and does not compute routes. Open it through any static
file server (it fetches `floors/*.json`).

## What it draws

**Default view: accepted geometry, unmodified.** The walking network is the
floor files' `net`: the 2,720 accepted shared guides on these four floors (the
chosen candidate accepted 2,728 of 2,884 eligible walks campus-wide; the other
8 are on Floor 0, which is not shown; guide catalog
`3430c8713d00b3dcf072f6ef2677ff7e4ee3bf958d35db6459cd629d6c405c40`, see
`docs/continuation/unbc-20261101/candidate/`) and, for the other 2,753 enabled
walks, their original saved walks, exactly as exported.
Corridor walks that end only at their own corridor's label point are hidden for
legibility (routing keeps them; the count is shown per floor).

**Opt-in layer: "Schematic drawing - display only, not route-accepted".** Off by
default. It draws `schematic` (a regularized redrawing, see
[`regularize/README.md`](regularize/README.md)) as a dashed overlay so it can be
compared with the accepted lines. When it is on, the side panel shows its own
validation status from `floors/index.json` (`schematic.verify`): 4,782 of 5,473
walks redrawn, 0 wall/hole overlaps in changed lines, 490 flagged original walks
kept unmodified, independent verifier PASS. Routes, distances and acceptance
never use it.

What the hard check guarantees: no *changed* schematic line introduces a
forbidden contact under the declared display predicate (positive-length overlap
with a native wall footprint outside the closed footprints of that wall's own
doors, or with a cell hole no other cell covers, outside every door footprint;
exact clipping, zero door margin, display decimetre coordinates). It does
**not** certify that every original line is wall-free: originals that meet the
predicate are kept unmodified and listed in the layer below.

**Off-by-default layer: "Source walks that cross a native wall".** The 490
original walks (116 accepted guides, 374 original saved walks) whose own
geometry overlaps a native wall footprint away from that wall's own doors, or a
cell hole (exact test in display coordinates). Per floor: Campus Floor 1 152
(43 guides, 109 saved walks), Floor 2 106 (24, 82), Campus Floor 3 130 (29,
101), Floor 4 102 (20, 82). Each list entry gives the graph edge id, the wall
native id (or hole cell) and the neighbouring native cell. These are
display-coordinate contacts for review, not proven native defects; neither view
hides or redraws them. One earlier flag (Campus Floor 3 `net[352]`) was a
numerical false positive of the verifier's old door search and was removed on
November 2 (see [`regularize/README.md`](regularize/README.md#door-footprints-november-2-correction)).

## Annotations

Every count in the side panel and `floors/index.json` is computed by
`regularize/build-index.py` from the floor files shown and the verifier receipt
for them. The Buildings 04-08 link text is generated from
`../acceptance/NORMAL-ROUTES.json` (full-catalog run `9b403a2d`, candidate
archive `1a7acbcb`, `releaseAcceptance: false`): 04-204 <-> 08-267 123.924 m
each way (hallway only); 08-216 -> 08-260 13.617 m; 04-255 -> 08-272 with
other-room transit 178.219 m (inside arrival 187.241 m), hallway-only refused;
step-free refused in all 12 step-free requests. The earlier "122 m" text
described the older two-cell candidate and was removed. The 07-180 -> 08-S101
ramp distance (52.3 m, October 18 survey on an earlier dataset) was removed
because it was not re-run on this catalog.

## Floor selection

`show()` takes a request token: a floor file that finishes loading after a newer
selection no longer replaces the drawing or the URL hash, and concurrent loads of
one floor share a single fetch. `tests/floor-selection-race.test.mjs` runs the
actual functions with out-of-order completions (exit 0 = pass); it fails on the
previous page.

## Checks

```sh
python3 regularize/verify.py . --output /tmp/verify.json   # exact hard rule, exit 0 = PASS
python3 regularize/regression-wall-shortcut.py             # synthetic wall shortcut refused (NumPy)
python3 regularize/regression-door-clipping.py             # zero-margin door rule, both implementations (NumPy)
node tests/floor-selection-race.test.mjs                   # stale floor load cannot win
```

Browser proof (desktop and mobile, light and dark) is recorded in
`BROWSER-PROOF.json`. It was captured before the chosen-candidate rebuild and
the November 2 wording and count changes, so the About and link texts it quotes
are older than the current page.

## Limits

* The schematic layer is legibility only. It is not physical-clearance,
  ownership, accessibility or route qualification.
* The flagged-original list is measured in this drawing's fitted,
  decimetre-rounded coordinates with a strict host-wall door rule. It includes
  116 accepted guides that the compiler accepted under its own native-feet
  support predicate; those need native re-measurement before being called
  compiler defects. The schematic check covers changed lines only.
* Floor 0 is not shown. Gateway texts other than the 04-08 link are hand-written
  door evidence summaries without distances.
