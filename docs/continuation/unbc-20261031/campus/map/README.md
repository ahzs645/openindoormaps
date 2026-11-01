# UNBC standalone campus map (diagnostic view)

`index.html` is a standalone diagnostic map of the four visitor floors. It is not
the production visitor and does not compute routes. Open it through any static
file server (it fetches `floors/*.json`).

## What it draws

**Default view: accepted geometry, unmodified.** The walking network is the
floor files' `net`: the 2,693 accepted shared guides on these four floors
(2,701 of 2,884 eligible campus-wide, guide catalog
`54f10449efcc1620724ccc2ccf8179823f1d8c28a39b8be56e54c2fcbf64cd40`) and, for
the other 2,779 enabled walks, their original saved walks, exactly as exported.
Corridor walks that end only at their own corridor's label point are hidden for
legibility (routing keeps them; the count is shown per floor).

**Opt-in layer: "Schematic drawing - display only, not route-accepted".** Off by
default. It draws `schematic` (a regularized redrawing, see
[`regularize/README.md`](regularize/README.md)) as a dashed overlay so it can be
compared with the accepted lines. When it is on, the side panel shows its own
validation status from `floors/index.json` (`schematic.verify`): 4,914 of 5,472
walks redrawn, 0 wall/hole overlaps, 330 source-defect walks kept unmodified,
independent verifier PASS. Routes, distances and acceptance never use it.

**Off-by-default layer: "Source walks that cross a native wall".** The 330
original walks whose own geometry overlaps a native wall footprint away from that
wall's own doors, or a cell hole (exact test in display coordinates). Each list
entry gives the graph edge id, the wall native id (or hole cell) and the
neighbouring native cell, for example edge
`native-cell:14.435696:563:walk:arrival:rm-694-0731875d76bf|door:694:1108589:0`
(04-253 to door 1108589) through wall 1107109, native cell 563. These are source
defects for review; neither view hides or redraws them.

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
python3 regularize/regression-wall-shortcut.py             # synthetic wall shortcut refused
node tests/floor-selection-race.test.mjs                   # stale floor load cannot win
```

Browser proof (desktop and mobile, light and dark) is recorded in
`BROWSER-PROOF.json`.

## Limits

* The schematic layer is legibility only. It is not physical-clearance,
  ownership, accessibility or route qualification.
* The source-defect list is measured in this drawing's fitted, decimetre-rounded
  coordinates with a strict host-wall door rule. It includes 71 accepted guides
  that the compiler accepted under its own native-feet support predicate; those
  need native re-measurement before being called compiler defects.
* Floor 0 is not shown. Gateway texts other than the 04-08 link are hand-written
  door evidence summaries without distances.
