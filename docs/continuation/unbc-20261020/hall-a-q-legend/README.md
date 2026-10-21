# Hall A–Q legend, recovered October 21, 2026

The letter-to-room legend for the Q3.4 Hall A–Q approval is now recovered. Earlier attempts could not open the [original Claude artifact](https://claude.ai/artifact/6j9Q7hsq1tMxPCreDqMAs2) (HTTP 401). An owner-authenticated read returned the published question image, [r3-4-b7-main-halls-staff-or-public.png](r3-4-b7-main-halls-staff-or-public.png), and the saved answer. The image's table names each lettered hall by room number and name.

[LEGEND.json](LEGEND.json) binds every letter to exactly one record in the preserved [source identity index](../../unbc-20261018/completion-work/access-and-device/source-identity-index.json). Each binding is a unique number+name match on level 311, recorded with its key and identity-ring hash.

| Letter | Room                                            | Key                                    |
| ------ | ----------------------------------------------- | -------------------------------------- |
| A      | 07-180 Multi Purpose Circulation Space and Hall | `rm-311-86e02816d8fe`                  |
| B      | 07-141 Corridor                                 | `rm-311-537bd6f65d6a`                  |
| C      | 07-203 Unnamed area                             | `rm-311-0850e3c8e4ce`                  |
| D      | 07-203 Plaza Street                             | `rm-311-935a520f9690`                  |
| E      | 07-202 Lobby                                    | `rm-311-9466cb0f9774`                  |
| F      | 07-243 Corridor                                 | `rm-311-05a95d8222f3`                  |
| G      | Central circulation (no number)                 | `circulation:07:311:400238:1331:17290` |
| H      | 03-025 Corridor                                 | `rm-311-a19a1df5e7db`                  |
| I      | 07-216 Multi Purpose Hall                       | `rm-311-9b71eb0f9afd`                  |
| J      | 07-231 Lounge                                   | `rm-311-9b6e6b0f9af9`                  |
| K      | 07-163 Corridor                                 | `rm-311-399064f64ec1`                  |
| L      | 07-206 Corridor                                 | `rm-311-8a44270f914c`                  |
| M      | 03-027 Corridor                                 | `rm-311-a1c62ff5e800`                  |
| N      | 07-203A Waiting Lounge                          | `rm-311-3578f4ca0bc1`                  |
| P      | 07-113A Corridor (already public)               | `rm-311-8e1b19ddd9ef`                  |
| Q      | 07-101 Corridor                                 | `rm-311-f015ce646f7a`                  |

The legend has sixteen letters and skips O. The earlier seventeen-slot list in [hall-a-q-authorization.json](../../unbc-20261018/completion-work/access-and-device/hall-a-q-authorization.json) assumed an O, which has no identity and stays unbound. Two halls, H and M, are Building 03 corridors inside the same Floor 1 face 293, not Building 07 records. That is why the earlier Building 07-only candidate list could not reproduce the set.

The authorization file and the recovery note are left unchanged because checkpoint receipts pin their hashes. This folder supplies the missing bindings alongside them.

## Applying it in the next build

[ACCESS-DECISION.json](ACCESS-DECISION.json) is the checked decision input. Pass it to the build entrypoint:

```sh
node --import tsx scripts/indoor/regenerate-from-native-cache.ts master.zip native-cache.json OUT \
  --access-decision-review docs/continuation/unbc-20261020/hall-a-q-legend/ACCESS-DECISION.json ...
```

[`roomsWithCheckedSourceAccessDecision`](../../../../scripts/indoor/source-access-decision-review.ts) sets source annotation access to public on the sixteen halls. The compiler then derives records, route policy and the existing staff-zone carve (`access-zone:311:b7-staff-halls`, already in the preserved master) as usual. The step refuses if any of these hold:

- the model differs;
- the staff zone is missing;
- any hall is missing, renamed, renumbered, moved, void, deleted or inside the staff zone;
- any hall already carries a different reviewed access.

It writes `source-access-decision-replay.json` with before and after digests. P (07-113A) is already public and is reported as already applied. [Tests](../../../../tests/unit/source-access-decision-review.test.ts) also check the committed decision against this legend, the source identity index and the approval record.

## Still open

- Nothing has been compiled with the decision yet. It needs the native006 rebuild inputs.
- The remainder of face 293 can still be refused as a whole if any staff or void record lies mostly inside it (`reviter/lib/reviter/native-circulation-geometry.ts:419`). 07-752 is staff but outside the zone, and its position relative to the remainder can only be checked against geometry.
- Legend areas have not been compared with source geometry.
