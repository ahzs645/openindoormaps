# Exact causes of the two preserved-arrival losses

The failed native rebuild loses the two arrivals through **own-flight headroom
masks and the existing owner/approach rules**. Neither loss comes from moved
arrival coordinates, a renamed room, changed GIS, or changed named original slab
profiles. There is no demonstrated safe local geometry repair. The preservation
guard remains a release blocker; no source, master, edge or policy was changed
by this investigation.

The comparison uses the exact October 14 historical master indoor JSON
(`31b3bc…f2a27`) and restored final failed prepared V8 snapshot
(`fd37be…b2e878`). Restoring the latter with the checked Stage 7 delta verified
all 151,748,935 target bytes. This is mathematical diagnostic data, not restored
validation authority. Both original arrival XYZ and room outlines match exactly.
Both are on native elevation **14.435695538057743 ft**. The complete serialized
walking-support rows for slabs **503705, 400479 and 490040** have identical hashes
before and after; real holes and original support are retained.

| Place                              | Exact failure chain                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **05-S204**, `rm-694-0bed6b73a3bd` | Its seed remains in free exact face `native-face:14.435696:3151`, on slab 503705, but that face has no accepted cell. Its unchanged 6.4 sq ft identity overlaps only **2.0086389049 sq ft**, down from 3.6723821742 sq ft. This falls below the ordinary half-identity/half-face ownership rule. The only other overlap is approximately 0.000000267 sq ft with 05-244, also far below either threshold. There is no connector anchor or access zone on the face. |
| **03-S104**, `rm-694-504b25e5319a` | Its seed is directly inside the fallback projection of own run **2354663**, middle tread/landing at **18.9096 ft**, approximately **4.4739 ft above the flat floor**. The seed is absent from every current exact free face. The room still owns main cell `native-cell:14.435696:623` and a tiny separate fragment `native-cell:14.435696:698`; neither contains its seed. This is not a minority-owner lookup failure.                                          |

For 05-S204, the whole **4.47947746648 sq ft** removed from its former physical
face is exactly covered by its own run **1638854** fallback projections at
**19.7671 and 20.1772 ft**: approximately **5.3314 and 5.7415 ft above the floor**.
The rational difference has zero unattributed remainder. Its seed itself is
outside these masks, but the remaining source-identity overlap cannot own the
free face. The seed is also outside its tiny unchanged source outline, including
in the historical master. Its only original enabled approach was a stationary
alias to a held staircase terminal; no original physical doorway is attached to
this room.

For 03-S104, the main face loses 37.77003162472 sq ft. Of this, 0.24472363113 sq ft
survives as its separate tiny owned fragment. Comparing **both** retained pieces,
the remaining subtraction is exactly accounted for by own-run headroom masks.
The earlier main-face-only comparison in `tread-causal-check.json` reports that
tiny surviving fragment as its residual; it is not a missing foreign obstacle.
The complete replay receipt includes it and requires zero unattributed remainder.

## Height demand and original source limits

`native-circulation-links.ts` applies these as obstacles only when
`floorZ + 0.05 < treadZ < floorZ + 6`. The independent
`native-exact-routing-authority.ts` retains the same fallback veto. This is an
explicit analytical standing/headroom band, not floor-only subtraction. Own-run
ownership does not exempt an overhead obstacle. Reducing that band or lowering
the ownership threshold would hide the losses without supplying physical proof.

For 05-S204, all 23 source-flight treads are byte-identical before and after. The
additional source-flight fallback loop was introduced in Reviter commit
`25bd696f2a5d8085be26fa5bc84aa978a13edb40` on October 17, after the historical
master; the original master face therefore cannot establish that the later
conservative veto is wrong. For 03-S104, the inventory remains 21 treads but its
source geometry changes from `native-cache` to recovered `native-brep`, including
the broader middle landing footprint now covering the seed.

The recovered enriched cache hashes to the failed run's exact
`bfc1f2611d233c593b0749e0d48ff357ab2d105cf1a7878ea847a96cece446fb`.
Its native run bounds and tread heights agree with the projections. The relevant
cache heights 18.9095681222 and 20.1771653543 ft differ from the display inventory
by only approximately 0.00003 ft; those rounding differences are far from the
six-foot cutoff and do not explain these exclusions.

These masks use **fallback source-flight tread roles**, rather than qualified
authored original-body/underside clearance roles. A `native-brep` display label
alone does not supply that qualification. The conservative refusal is supported;
a complete original-RVT run/body, actual support and full standing-clearance
replay is still needed before claiming a physical alternative. No source-flight
projection was deleted or reclassified here.

## Concrete doorway lead

The existing **03-S104 door 908922** remains enabled. Its unchanged room-side
portal `door:694:908922:0` at
`[114.74448177496802, -122.88462533961184, 14.435695538057743]` is on the original
named slabs and inside the current main owned exact face/cell 623. This is a
source-proven doorway location with supported stored flat-floor membership.
However, the only current enabled incident edge is the door edge itself: there
is no native walking approach from this doorway to the unchanged arrival seed.
The original 8.625 m walking approach begins at the seed now covered by the
own-run headroom mask. Thus the doorway is a concrete source-correction lead,
not an independently verified complete arrival approach.

A source review can investigate the actual lower landing and this original door,
including the stair/landing underside and complete foreign material. It must
establish an unchanged-endpoint supported path, or explicitly review a different
source route point before regeneration. This investigation moves no nominal
terminal and does not assign an unowned face to a public room. 05-S204 has no
comparable existing physical doorway in the saved graph. Both source cases and
all held full stairs remain unresolved.

## Reproduce the bounded mathematical comparison

The adjacent `replay-arrival-loss.mts` reads full immutable inputs, verifies their
expected SHA-256, replays the exact topology/identity differences with the normal
rational predicates, asserts both failure chains and unchanged slabs/coordinates,
checks the original door's current membership, checks inputs again at completion,
and writes a **new** report using exclusive creation. It mutates no dataset.
Use Node **24.19.0**, matching the V8 snapshot. From the repository root:

```sh
node --max-old-space-size=4096 --import tsx \
  docs/continuation/unbc-20261018/ship-readiness/arrival-loss/replay-arrival-loss.mts \
  /workspace/scratch/arrival-loss-diagnosis-20261018/original-master-indoor.json \
  /workspace/scratch/arrival-loss-diagnosis-20261018/prepared-before-stair-finalization.bin \
  /workspace/scratch/arrival-loss-diagnosis-20261018/another-new-replay.json
```

The JSON input is the exact `viewer/indoor.json` entry from recovered
`UNBC.master.20261014.reviter.zip` (master SHA-256 `13571ab9…315c520`), extracted
into a new scratch file. The V8 input was restored using reviewed
`stage-07-final-build-state/restore-binary.py prepared-before-stair-finalization`
with Stage 4's exact prelanding snapshot as seed. The restore checks full seed,
delta and target hashes and refuses an existing output. Keep these large inputs
outside Git and preserve their original bytes.

The replay's assertions pass. Its final receipt, exact-owner comparison,
point-veto census, face classification and removed-face attribution are adjacent.
No production predicate changed, so there is no new app test/build claim from
this diagnostic. A mathematical replay is not full native regeneration, accepted
route calculation, original body certification or visitor publication approval.
