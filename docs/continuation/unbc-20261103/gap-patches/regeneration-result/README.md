# Gap-patch regeneration result — November 5, 2026

The full native regeneration with the 132 owner-approved gap patches and 68
superseded contact repairs finished with compile exit status 0 after about
14 hours on this host (October 21 producer code plus the boundary-patch
source review; see [../REGENERATION.md](../REGENERATION.md)).

| Output                                               | SHA-256                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Master `UNBC.master.reviter.zip` (247,314,130 bytes) | `655360527c96faafc5197722563509d50060dc9cdbd46c65ce77087eb023bb5f` |
| Viewer `UNBC.campus-viewer.zip` (55,264,770 bytes)   | `d4a197b7ffa6646815880bd7a8f0ddb5d5f83d6ee70a5d009a24c79104607ea2` |

Lossless source assets and identical master/viewer data are recorded in
[regeneration.json](regeneration.json).

**Correction (verification on November 5):** the before/after figures in
`regeneration.json` (components 49 → 25, largest component 1,549 → 1,703
arrivals) describe the regeneration's own internal stages and are identical
in the run-1 regeneration without patches; they are not an effect of the
patches. Compared with the run-1 master, the patches close the patched strips
(no walk crosses any of them), separate 234 rooms in the cells they cut, and
break no door connection; the main network is unchanged. See
[../../../unbc-20261105/gap-regeneration/](../../../unbc-20261105/gap-regeneration/README.md).

The patches were checked against the project's own application of the same
file (`73a765e9…`) before compiling
([source-boundary-patch-replay.json](source-boundary-patch-replay.json)).
Verification of the closed gaps, the 06-388 link, guide recompilation and
route acceptance follow in `docs/continuation/unbc-20261105/`.

The container is reclaimed a few minutes after the session has no tracked
running task, which killed four earlier attempts; the successful run kept a
tracked watcher alive throughout.
