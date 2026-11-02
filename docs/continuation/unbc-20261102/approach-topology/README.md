# Crossed door approaches — November 2, 2026

The external review found that the production shared-corridor compiler
picked each shaped door approach on its own. Two approaches could each pass
the support checks and still cross each other before they reached the hallway.
In the review fixture (a 40 × 8 ft corridor, doors at (10, 1) and (13, 1) with
normals (1, 1) and (−1, 1)), the route was (10,1)→(13,4)→(10,4)→(13,1). It
crosses itself at (11.5, 2.5). `approachTopologyConflicts` reported the
crossing, but the route was still returned.

## Fix (`app/indoor-project/corridor-centerline.ts`)

- **Straight-axis networks.** If the approaches chosen one at a time conflict
  in a way the legacy approaches do not, each terminal starts again from its
  legacy approach. Terminals are taken in id order. Each one takes the first
  supported shaped proposal that adds no conflict to the whole axis network
  (the axis and the other approaches) and touches nothing except at a shared
  junction. Proposals after the legacy approach are not tried. If none passes,
  the terminal keeps its legacy approach.
- **Join sliding.** A moved branch may not cross another terminal's branch,
  whether that branch stayed put or was already placed. This is the same rule
  that already applied to trunk segments. A terminal that cannot reattach
  keeps its checked join.
- **Final topology is checked before a network is accepted.**
  `createCorridorCenterline` checks the complete network: every attached
  approach and every shared lane, with the existing exact topology inspection.
  Suppose the network has an approach conflict that the legacy network
  (`shapedApproaches: false`) does not have. The terminals in that conflict
  are rebuilt with a tighter restriction: first no doorway-normal branch, then
  legacy proposals only. There are at most 4 rebuilds. If a new conflict still
  remains, the legacy network itself is returned. Conflicts are compared by
  identity: the two terminals, or one terminal and "shared lane". Trunk-only
  (core–core) conflicts do not count towards acceptance.
- Unchanged: the exact support checks, the fixed original terminals and
  endpoints, and the ownership and access rules. No junction is added where
  two lines cross. The outcome is recorded in `statistics().approachTopology`
  and `.axisApproachRepair`.

Tests: `tests/unit/corridor-terminal-approach.test.ts` covers three cases:

- The review fixture: no conflicts, endpoints kept, native footprint support.
  The route is now (10,1)→(13,4)→(13,1). Door a keeps its doorway-normal
  branch, and b meets it at a shared axis junction.
- The same crossing in a T-junction chain network. It is rebuilt with the
  first restriction.
- Positive controls: doors with room between them still get doorway-normal
  branches, both on the axis and in a chain network.

The review script's output after the fix is in
[REVIEW-FIXTURE-AFTER.json](REVIEW-FIXTURE-AFTER.json)
(`newTopologyConflictObserved: false`).

## Campus compile (corrected master `6e7971f8…`)

New catalog: `/home/user/unbc-work/topology/compile/prepared-routing.json`,
sha256 `1c3011ffbda15b1f38dd0ecaee52bbbd39f3133622c3d76cff16fb87c2f4487c`. It
was compared with the previous chosen catalog `3430c871…`. Details:
[COMPILE-COMPARISON.json](COMPILE-COMPARISON.json) (`compare-corridor-candidates.py`),
[APPROACH-TOPOLOGY.json](APPROACH-TOPOLOGY.json) (`tools/approach-topology-summary.py`),
[COMPILE-EXECUTION.json](COMPILE-EXECUTION.json) (2,417 s, max child RSS 4.0 GB).

| Measure                                                                       | `3430c871` |  This fix |
| ----------------------------------------------------------------------------- | ---------: | --------: |
| Accepted guides                                                               |      2,728 |     2,728 |
| Lost / gained                                                                 |          — |     0 / 0 |
| Networks whose `approachTopologyConflicts` is non-empty (per-route statistic) |     16/109 |    10/109 |
| … of which list an approach                                                   |         15 |         9 |
| Guides at a listed conflicting approach                                       |         86 |        32 |
| Guides whose own polyline crosses or touches itself                           |         18 |         9 |
| Zigzag reversals (2,728 matched)                                              |        227 |       225 |
| Core bends over 5°                                                            |      2,310 |     2,304 |
| Approaches with an elbow                                                      |        341 |       342 |
| Core dead ends / at an arrival point                                          |  546 / 202 | 545 / 202 |
| Guides from the per-edge legacy fallback                                      |          8 |         6 |

- **74 guides changed**, in 10 cells: 14, 71, 183, 314, 522, 655, 956, 961,
  1028 and 1114.
- 10 networks had a whole-network approach conflict on their first build.
  - In 9 of them, every such conflict is also in the legacy network, so the
    shaped network was kept.
  - Cell 1028 was rebuilt with the first restriction on 2 terminals.
  - No network fell back to the legacy network.
- The axis repair changed 1 terminal in cell 1114.
- Cells 183, 314, 956 and 961 no longer have conflicts. Their networks are not
  axis networks and were not restricted. So the change must come from the new
  branch-crossing rule in join sliding. This is inferred from the code paths,
  not measured separately.
- 10 networks still list a conflict in the per-route statistic:
  - 9 have approach conflicts: cells 14, 71, 410, 413, 522, 573, 655, 729
    and 883. Every whole-network approach conflict in these networks is also
    in the legacy network built in the same call.
  - Cell 1119 lists only core–core conflicts, which acceptance does not
    compare.
- All 9 remaining self-touching guides also touch themselves in the legacy
  catalog `8c5a7c0f…` (`guides-0388`).

## Limits

- I did not rerun the old code to get whole-network conflict counts for
  `3430c871`. The "before" numbers come from its report's per-route statistic
  and from its guide geometry.
- The fix leaves conflicts that the legacy network already had, including
  trunk-only conflicts.
- Drawing diagnostics only. I did not rerun the 33-case route acceptance, and
  I did not rebuild or publish the visitor package for this catalog.
