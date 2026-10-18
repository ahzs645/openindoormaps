# Progressive visitor flow proof

The progressive visitor now lets a searched or picked place become the start or
destination directly. The selected place card opens Directions and focuses the
other endpoint. Visitors can swap endpoints, retain the start/destination and
Walking/Step-free preference in a reloadable URL, and recover from an unavailable
place in a link. Restricted, non-walkable and disconnected places remain visible
in search with an explanation; they are omitted from visitor endpoint choices.
Unknown access still reaches the ordinary calculator and its disclosures.

Configured map links show the campus title, saved-map action and collapsed Map
tools. The manifest form and alternate technical viewers are available inside
those tools. Manual entry opens the tools immediately. Failed map loading offers
an explicit retry. Actual configured header heights are 65 px on desktop and
96 px on mobile, compared with the earlier mobile capture's 175 px.

Validation:

- `node --import tsx --test tests/unit/visitor-route-efficiency.test.ts tests/unit/progressive-route-entry.test.ts`: 9 passed.
- `npx playwright test --config playwright.visitor.config.ts progressive-visitor-flow.spec.ts`: all three final scenarios passed across targeted runs, desktop 1440×1000, mobile 390×844 and manual-entry/retry. The desktop scenario was rerun after aligning its reload startup wait with the initial 60-second startup allowance. The explicit synthetic fixture tests hidden technical controls, optional Map tools, manual opening, HTTP 503 retry, direct endpoint actions, keyboard focus, stable place identity, swap, Step-free selection, URL reload, same-place refusal without routing download, unavailable endpoints, empty search and invalid-link recovery.
- Scoped ESLint: zero errors; two existing `visitor-binary-preview` custom-class warnings.
- Accepted UNBC data on the current dev app: actual Library Services Desk search, selected-place actions, destination prefill and Step-free selection completed on desktop/mobile with no page errors. Screenshots and receipt are adjacent. This exercised the accepted overview/search assets and actual new controls; it did not calculate or certify a physical route. Both captures contain painted overview geometry; full renderer readiness was not asserted and the mobile capture retains a drawing status.

The full source typecheck initially reported one pre-existing optional
`geometry.preparedRoomKeys` assertion in `shared-corridor-routing.test.ts`.
The coordinating agent owns that correction and the final complete build/checks.
No source geometry, door ownership, routing edge, held stair or published artifact
was changed by this visitor-flow work. These checks establish this UI behavior;
they do not establish campus route coverage or overall shipping approval.
