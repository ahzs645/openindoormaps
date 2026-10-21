# Preserved identity-specific access decisions

These are the original source annotations, not a new permission inference. Each accepted record matches its preserved annotation exactly. The complete dataset/model/room-entry hashes and per-identity geometry hashes are in `preserved-access-inventory.json`. These annotations establish the recorded audience scope; they do not certify physical geometry, current hours or an entire end-to-end route.

| Source place              | Stable identity           | Level   | Access | Original recorded scope                                                                                                                                         |
| ------------------------- | ------------------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10-1060 Corridor          | `rm-1487816-1949cc41e164` | 1487816 | public | User confirms the vestibule between Buildings 08 and 10 at review pins 18/19 connects the public hallways through native doors 1501580 and 1501582.             |
| 08-162 AV Support Storage | `rm-1487816-45278af41574` | 1487816 | staff  | Owner decision Q3.8 (2026-10-10): No directions to 08-162 for now (left unrouted). Raw answer: Leave it without directions (AV staff access only).              |
| 10-1080 Vestibule         | `rm-1487816-93135f5b541a` | 1487816 | public | User confirms the vestibule between Buildings 08 and 10 at review pins 18/19 connects the public hallways through native doors 1501580 and 1501582.             |
| 08-159 Alcove             | `rm-1487816-959fe1d830e0` | 1487816 | public | User confirms the vestibule between Buildings 08 and 10 at review pins 18/19 connects the public hallways through native doors 1501580 and 1501582.             |
| 07-750 Circulation        | `rm-311-3eb0dbca1122`     | 311     | staff  | Staff-only access requested by the user, matching adjacent 07-751. Physical floor and native boundary retained; excluded from public and step-free routing.     |
| 07-751 Circulation        | `rm-311-3eb4c3ca1126`     | 311     | staff  | Access reviewed by the user; source name and physical boundary retained.                                                                                        |
| 07-752 Circulation        | `rm-311-3ee7adca1151`     | 311     | staff  | User identifies this area and its associated access as internal to staff. Retain the physical floor and source boundary; exclude public circulation and routes. |
| 05-117 Circulation        | `rm-311-77d61839c457`     | 311     | staff  | User identifies this area and its associated access as internal to staff. Retain the physical floor and source boundary; exclude public circulation and routes. |
| 07-113A Corridor          | `rm-311-8e1b19ddd9ef`     | 311     | public | User confirms 07-113A is the public hallway beyond the doors at review pins 15/16. Adjoining 07-752 and 05-117 remain staff areas; access stops at their doors. |
| 07-706 Circulation        | `rm-311-cd8828d8a5f6`     | 311     | staff  | Staff-only access requested by the user, matching adjacent 07-751. Physical floor and native boundary retained; excluded from public and step-free routing.     |
| 07-704 Circulation        | `rm-311-cdb834d8a61f`     | 311     | staff  | User identifies 07-704 Circulation as part of the staff-only area. Exclude from public directions and show the shared restricted-area colour.                   |
| 07-702 ESR                | `rm-311-d5a30ed8aa65`     | 311     | staff  | User identifies this area and its associated access as internal to staff. Retain the physical floor and source boundary; exclude public circulation and routes. |

## Staff-zone boundary

`access-zone:311:b7-staff-halls` is bound to original native selection `native-region:311:307` within face 293. Its six staff circulation identities are 07-750, 07-751, 05-117, 07-706, 07-704 and 07-702. 07-720 Office (`rm-311-cd9254d8a5ff`) is also a zone member but its record's access remains unknown; this does not reopen the surrounding staff zone. 07-752 is independently staff-only and is not silently included as a public continuation of 07-113A. The single unbound Building 07 staff review point cannot be assigned to a new floor or polygon.

## Hall A–Q

Original Q3.4 records the explicit user answer: “Halls A-Q are public; the six red ones are staff-only halls, combined into one staff area”. The source decision is immutable, SHA-256 `3b4a1f5d26966532a5edba6d0b600df1863e09cb0eb4d202f5954a8364e6d288`. `hall-a-q-authorization.json` preserves the answer and seventeen unresolved letter-to-identity slots.

The existing authorization can be reused once its exact scopes are recovered. A temporary letter, a corridor name, the complement of the staff polygon or the number of available records does not supply the missing scope. All 1,852 unresolved room records remain unchanged. Recovery methods and the remaining original legend requirement are recorded in `hall-a-q-recovery.md`.

## Step-free decisions

Four current edges retain explicit `yes` evidence: `ramp:1622190`, `walk:ramp:1622190:lower`, `ramp:1586431`, and `ramp:1587605`. The complete notes and source point hashes are in the inventory. Preserve their actual current identity/geometry bindings; a historical review for the upper approach cannot be reapplied after geometry drift. The original Building 4 ramp notes include slope limitations and do not assert code compliance. A confirmed ramp does not make every neighboring edge or doorway step-free.
