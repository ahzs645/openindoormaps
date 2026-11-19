# UNBC route review and corridor candidate

This change prepares a reviewable next step from the November 17 handoff. It is
**not a new UNBC publication**. The pull request remains draft until its changed
preparation, route and plan consumers have matching, freshly qualified assets.

## What changed

- Compiled directions-cache URLs now follow the application's deployment base in
  the full worker, progressive preparation and explicit offline download. For the
  normal Pages build, `/data/unbc-routing/…` resolves beneath `/openindoormaps/`.
  Receipt, runtime and checksum admission still apply.
- The candidate compiler has an explicit `--straight-runs` option, off by default.
  It fits complete corridor runs, preserves genuine corners and alternative paths,
  and proposes shorter, perpendicular terminal branches where exact support allows.
- The completed candidate cell is compared with an unfitted control, including
  fallback guides and every later recovery pass. A new or moved crossing, touch,
  overlap, or lost guide withdraws that cell's proposal. Fewer total crossings
  cannot conceal a new crossing at another location.
- The [route gallery](route-review/README.md) and reusable renderers make the
  handoff's measured walking paths directly inspectable. They retain the original
  points and awkward turns; they are not a newly qualified route dataset.

No source model, room classification, door permission, stair/ramp/lift decision,
or published route carrier is changed by this PR. The generated consumer bindings
are refreshed honestly; historical cache receipts are not relabelled.

## What the handoff establishes

| Source                  | Exact baseline                                                     |
| ----------------------- | ------------------------------------------------------------------ |
| OpenIndoorMaps          | `d89a9355587aaa8c470a8b2796d1a5e3c84e3a65`                         |
| Reviter                 | `4a8fe6a8bd6b085e7725bb4ea18bb32d519e00a4`                         |
| Recorded worker dataset | `ecd8af21dd0d83740c5a3b5133298e52d88d71ce1c1db54c46e8642e853f66e3` |
| Recorded route runtime  | `3121b7dfc6ce392b51fe46a2dd0d6b5db94ed59a6b8caf620df2c23163765558` |
| Offline atlas HTML      | `52fd24910518d878304e5b77495ecb5006f4b52c12172ea8f7bc62fcdd766180` |

The saved browser measurement file contains 1,392 outcomes: 958 ordinary-walking
requests (653 with paths, 305 without paths) and 434 step-free requests without
paths. Agreement with those recorded results includes expected refusals; it does
not mean 1,392 successful walking routes or campus-wide step-free coverage.

The gallery shows four recorded ordinary-walking journeys. Their endpoints are
the hallway stations associated with the selected rooms, not interior room
arrivals. The Building 10 detail still has a 165.6-degree turn-back. The flat
Stair 6 landing example is a 6.90 m same-level walk, not traversal of a stair
flight. The longer Buildings 04–07 example measures 104.25 m.

The source [Start Here guide](https://drive.google.com/file/d/1p35qMS-n0vr-p5Lm2WeA8suOxadJwOFB/view)
and [complete Drive handoff](https://drive.google.com/drive/folders/1PdyETAWsVOPcPPC-RAOUSaJmqXEh-rWU)
remain the restore instructions. Access to that Drive folder is separate from
access to this repository.

## Review and qualification

The [runtime qualification note](runtime-qualification.md) explains why a generic
green build cannot qualify the current UNBC assets after these source changes. It
lists the exact source prerequisites, fresh export/admission commands, production
worker parity checks and final publication gates.

The [candidate compiler documentation](../../../scripts/indoor/corridor-candidates.md)
describes complete-cell inputs, exact support, fallback handling and checkpoint
bindings. A scoped diagnostic is evidence about a candidate; it does not authorize
publication or replace the complete physical and policy replay.

The workspace's full-model preparation and initial unrestricted build/typecheck
attempts were stopped with exit 137. The scoped indoor-project typecheck passed.
The local command-line browser could not start because its required socket call
was denied; connected and cloud browsers could not reach the workspace server.
Accordingly, the gallery contains exact scientific plots of the handoff's recorded
paths, not newly captured browser screenshots. Detailed checks are recorded with
this review's evidence and in the pull request.
