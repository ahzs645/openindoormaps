# Native boundary review and the Library

Audit the current consolidated master without changing its geometry, room classifications, access restrictions or navigation:

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-outline-boundaries.ts \
  /Users/ahmadjalil/Downloads/UNBC.final/UNBC.master.reviter.zip \
  work/library-native-review/global-outline-audit.json \
  --report work/library-native-review/global-outline-audit.txt
```

The ZIP is validated before inspection. Reports include the archive checksum, map revision, building/native-floor counts, compiler rejection reasons, representative room keys and proof that the audit left the dataset unchanged. The optional text report helps review the JSON inventory.

## Baseline before the Library corrections

Revision `0fbaa2e79a65` contained **1,862 records**, including **316** labelled “Source outline · boundary review needed.” This is a baseline snapshot; rerun the command after regenerating a reviewed master for its current counts.

| Finding within the 316 source outlines                           | Count |
| ---------------------------------------------------------------- | ----: |
| Ordinary areas without a closed native cell                      |   150 |
| Ordinary areas with competing labels inside a native enclosure   |   122 |
| Full visitor display enclosures recovered from native wall faces |    23 |
| Partial native wall-face floor masks                             |   148 |
| Stair identities already displaying native flights               |    26 |
| Open-use names requiring semantic review                         |    31 |

These findings overlap. All 23 complete display candidates include explicit opening or corner-continuation assumptions. Their display recovery does **not** certify a new navigation boundary or a public entrance. Five of the 31 semantic candidates are staff areas; their restrictions remain authoritative.

Remaining source-outline counts by building were: **03: 52; 04: 35; Library/05: 53; 06: 37; Agora/07: 47; 08: 44; 09: 27; 10: 21**.

## Why names alone cannot determine rooms or hallways

A source label can identify part of a shared open space, an enclosed room, a stair landing or a staff corridor. Names such as “Reception,” “Coffee” and “Lounge” do not establish the physical boundary or public access. Multiple labels in one native enclosure require a reviewed merge or shared-area identity, rather than invented dividing walls. Missing wall closure requires measured native doors, wall faces and floor support, rather than a larger source-outline buffer.

Display masks can close small measured openings while keeping the actual doorway open for routing. Preserve that distinction: identify the **saved navigation boundary** separately from the **visitor display boundary**. An assumed wall-face display enclosure should be described as such, with its closure assumptions, while the original navigation interior remains under review.

The audit proposes review candidates only. It does not merge rooms, rename places, turn rooms into circulation areas or relax staff restrictions.

## Reviewed Library candidate

Candidate revision `21916a1e46ef` records the reviewed physical use of these spaces:

| Group                                                      | Result and native evidence                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 05-136 Library Services Desk                               | Flat circulation in native cell 36; the low counter remains native geometry rather than an invented room enclosure.                      |
| 05-161 Reception and 05-164 Circulation                    | Shared flat circulation in native cell 38.                                                                                               |
| 05-168 Admin Area, 05-168A Waiting and 05-168B Circulation | Shared flat circulation in native cell 33.                                                                                               |
| 05-166 Lab and former 05-166A Kitchen                      | One enclosed **05-166 Lab / Kitchen**, retaining source key `rm-311-97f4bed2673f`; the former Lab identity is merged into that survivor. |
| 05-169 Print                                               | Preserved as a separate room with unchanged source annotation.                                                                           |

The merged Lab / Kitchen now passes native enclosure preparation: `boundarySource: native-wall-enclosure`, source coverage **100%**, cell coverage **100%** within floating-point tolerance, and 16 supporting native wall/column/door element IDs. Its routing uses measured native door **#1029220**. This evidence supports the recovered room interior; it does not establish public access, which remains unknown. The compiler retains its explicit seam tolerances of 0.08 ft and single-corner tolerance of 0.04 ft.

The regenerated candidate has **1,861 records** and **310 remaining source outlines**, down from 316. Library Floor 1 decreases from **28 to 22** outlines and Library overall from **53 to 47**. Native circulation boundaries increase from **302 to 306**, and recovered native room interiors from **1,042 to 1,043**. The six removed outline identities comprise four circulation promotions, the recovered merged Lab / Kitchen and its retired donor identity; no new outlines were introduced.

Remaining findings include **144** ordinary unclosed cells, **122** ordinary areas with competing labels, **23** complete visitor display enclosures with explicit closure assumptions, **146** partial wall-face masks, **26** stair identities already displaying native flights and **29** names requiring open-use review. These categories overlap. **05-161A Waiting** remains an unresolved source outline and was not silently added to the reviewed Reception group.

Reproduce the candidate audit before replacing the canonical master:

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-outline-boundaries.ts \
  work/library-native-review/candidate/UNBC.master.reviter.zip \
  work/library-native-review/after-outline-audit.json \
  --report work/library-native-review/after-outline-audit.txt
```

Candidate archive SHA-256: `1c6f84f348f5fc63fedbd47cac0d328161482e88be9a79513e6ece8a7997c66f`.
The read-only audit confirms its dataset was unchanged. Package and route verification additionally retain the original RVT, scene GLB, GIS references, connector stops and native ramps, with no lost arrival anchors. The native-door routes between the Lab / Kitchen, circulation and adjacent enclosed rooms remain available in both directions.
