# Mappedin investigation and a simpler viable visitor journey

Reviewed 2026-10-18. This is a source-backed product investigation, not a new physical route certification.

## What was actually inspected

- The web reader and initial ordinary HTTP GET could not access the demo (HTTP 403). A fresh isolated cloud Chromium session subsequently loaded and painted the exact supplied route successfully (HTTP 200). The [fresh desktop capture](mappedin-live-cloud-attempt.png) shows the selected elevator instruction, Level 1, and 3 minutes total. No user browser or signed-in browser session was used. The vendor UI uses a closed shadow root, so empty text/role-locator reads do not mean the visual UI was absent.
- Current official Mappedin Web [deep-link documentation](https://developer.mappedin.com/docs/enterprise-apps/mappedin-web/deep-linking) and [SDK wayfinding documentation](https://developer.mappedin.com/web-sdk/wayfinding) were read successfully.
- The repository's [October 1 hospital reproduction record](../../../bc-hospital-reproduction-2026-10-01.txt), existing [browser tests](../../../../tests/e2e/bc-hospital.spec.ts), current hospital route/step-follow verifier source, and the retained reference mobile screenshot were inspected. These establish historical observations and existing acceptance cases, not current vendor runtime results.
- The current UNBC full visitor navigation and progressive visitor page were inspected as source. No vendor geometry, image, code, or credentials were newly downloaded or copied into the app.

The [retained vendor screenshot](../../../screenshots/bc-hospital-reference-next-mobile.png) shows one instruction above the map, a clearly highlighted current segment, floor-specific context, a bottom journey summary, and large previous/next controls. Its SHA-256 is `4a99a7438ad500fcfe1a6e3bce2953b9bf07c3ee879201de70009370cfb88780`. It predates this review.

## What the supplied journey means

The URL contains `from=s_67ef97b0c52ee383c6df7006`, a destination label, `textDirectionsVisible=true`, and `instruction=2`. In the retained hospital GeoJSON, that source space is **Neonatal Intensive Care Unit (Dragonfly), Teck Acute Care Centre, Level 2**. This lookup is a current static-fixture observation. The October 1 record describes the corresponding NICU-to-Emergency example as approximately 226 m / 3 minutes with an elevator descent to Level 1; that distance and time are historical.

The supplied URL has no `accessible=true` flag, yet its default route uses an elevator. That observation alone does not establish that every segment is step-free or that the default and accessible graphs are equivalent.

The supplied destination label uses the legacy spelling `Emercgency Reception (Turtle Bay)`. The reference screenshot displays `Emergency (Turtle Bay) Reception`. This demonstrates why an ID plus readable aliases is a better persistent target than a display-name-only link. The fresh screenshot confirms the exact supplied URL resolves to the named NICU origin and corrected Emergency destination, with the elevator instruction selected. The current official documentation describes `from`, `to`, `accessible`, and `textDirectionsVisible`; it does not document `instruction=2`. The latter works in this observed deployment but is an undocumented compatibility detail.

## Reusable lessons from current official documentation

Mappedin Web supports preset origins/destinations by identifiers or names, a separate accessible option, and initially visible text instructions. Physical QR starts can include a location and floor. For UNBC, support the same practical operations using our own stable room keys and map revision: open a place, choose a known starting location, and share a route. A QR start should be described as the sign's location; it does not establish live tracking. [Source](https://developer.mappedin.com/docs/enterprise-apps/mappedin-web/deep-linking)

The SDK separates computed navigation from drawn paths. Spaces need entrances. Smoothing validates line of sight and retains protected doorway/floor-transition nodes; rounding the displayed line is a different setting. Connections can be excluded even when refusal is the only result. Floor-change markers move to the destination floor. For UNBC, retain finite doorway, obstacle, support, policy, and vertical-connection validation under any visual simplification; use actual routed sections for camera fitting. [Source](https://developer.mappedin.com/web-sdk/wayfinding)

These are current documented SDK behaviors; they do not prove that this particular hospital demo uses every current SDK setting.

## Simplify the visitor concept

**Find a place → choose a known start → choose Walking or Step-free → preview the confirmed path → follow one instruction at a time.**

1. Open a preconfigured campus map. Put model imports, manifest URLs, debug previews, geometry controls, and publication diagnostics in an authoring surface.
2. Search by room number, department name, or alias. Show building and floor beside every ambiguous match. A place can be viewable without being routable; explain unavailable directions beside that place.
3. Make the destination card's primary action **Directions**. Ask for a start only when it is missing. An entrance/QR landmark is a simple, honest origin before investing in positioning.
4. Offer Walking and Step-free. Retain existing verified-edge semantics. A failed step-free search must not silently fall back to stairs or unknown connections.
5. Default to the already implemented hallway-side arrival and say **Arrive outside [room]**. An advanced arrival option can expose only physically admitted alternatives; a visual room centroid is not a doorway.
6. Show the journey overview, distance, estimated time, floor changes, and any relevant access uncertainty. The primary action is **Preview directions** while location is manual. Keep one current instruction, a persistent building/floor chip, Previous/Next, and Close; tapping a connector must show the correct floor.
7. Put map view and downloads in a secondary menu. Keep operational failure messages short and provide a clear retry or change-start action. Do not expose compiler investigations to visitors.

The product promise should initially be **confirmed indoor directions for published destinations**, with a listed launch scope. Campus-wide navigation, all destinations, continuous positioning, and complete step-free coverage require additional evidence.

## Baseline app review: retain, simplify, complete

This table records the baseline inspected before this task's implementation work. Use the final task acceptance evidence to establish which recommendations were subsequently implemented.

| Concern | Current evidence | Recommended action |
| --- | --- | --- |
| Primary journey | `ProjectNavigation` already offers search, place cards, route profiles, hallway arrivals, route summary, and the shared hospital preview | Reuse this visitor journey; avoid adding a third navigation experience |
| Progressive entry | `ProgressiveVisitorPage` shows Map manifest URL, Open map, Binary preview, 3 display modes, and many persistent controls | In configured visitor mode, load the venue automatically and move technical controls to authoring; retain explicit load/retry status |
| Route entry | Full visitor has searchable place fields; progressive visitor renders all routable records in two native selects | Reuse searchable fields with building/floor labels; retain stable identities and unavailable states |
| Share / reload | Generic `utils/deep-link.ts` handles numeric venue POIs, while UNBC room keys are strings; both inspected UNBC pages initially consume package/manifest/view, not route endpoints | Add a separate string-key route URL contract. Restore endpoints/profile only after the matching dataset loads. Preserve package/manifest parameters. Invalid/obsolete keys must show an unavailable state without manufacturing a connection |
| Instructions | Full visitor fits each step's real `pointsFeet`, preserves pitch/bearing, and changes floor; progressive visitor jumps to one position at zoom 20 | Share step-follow behavior so both surfaces show the actual routed section and arrival floor. Validate forward/reverse transitions and resizing |
| Instruction count | Historical NICU example had 17 local instructions vs 9 vendor instructions | Merge only redundant walking guidance while retaining full geometry and distance; keep every real turn, entrance/building transition, and vertical connector. Do not replace the route with straight lines |
| Access | Current helper has short visitor refusal text, and Step-free says confirmed connections without stairs | Retain refusal semantics. Resolve unknown public access operationally before advertising those routes as confirmed |
| Source readiness | October 16 handoff records a failed rebuild, two lost arrival connections, and 28 held stair links | Treat source repair and coherent acceptance as separate release gates; visual parity does not enable these links |

Source references: [full visitor](../../../../app/indoor-project/project-navigation.tsx), [progressive visitor](../../../../app/pages/progressive-visitor-page.tsx), [steps](../../../../app/indoor-project/navigation-steps.ts), [failure state](../../../../app/indoor-project/visitor-route-state.ts), [numeric venue deep links](../../../../app/utils/deep-link.ts), [handoff](../../unbc-20261016/HANDOFF.md).

## A smaller, reviewable shipping goal

Ship one venue release with an explicit set of confirmed public destinations and verified entrance/lift journeys, using the shared visitor experience. Keep incomplete stairs and unconfirmed destinations unavailable. Maintain three separate contracts: source-preserved display geometry, a physically/policy-validated navigation graph, and visitor names/aliases/access metadata. A display feature never creates route authority. Bind all outputs to one accepted release and dataset/engine identity.

Acceptance should cover the actual published production worker, source/rebuild preservation, both directions of each launch connector, same-floor routes, hallway arrival, refusal for missing entrances/restricted access/unconfirmed step-free links, route URL round trips, cancel/retry, and painted desktop/mobile floors. Set a measured performance budget before release; the handoff's minutes-long cold operations and unmeasured physical-phone performance prevent a defensible broad launch claim.

Only a venue-operator walkthrough can verify current signs, doors, opening hours, lift availability, public access, and the physical placement of QR origins. No inspected demo or simulated screenshot resolves those operational unknowns.

## Verification status for this investigation

The exact desktop route painted successfully in a fresh cloud browser. Additional Previous/Next, mobile, and accessible-mode interaction acceptance remained incomplete: a first attempt clicked during loading, and subsequent screenshot requests timed out. Those attempts are not evidence that controls or mobile behavior passed. The current route screenshot, historical reference screenshots, current official docs, and fresh local regressions remain separately identified in the receipts.

After the central dependency install, both scripts passed freshly against restored source commit `5391ea3cbf9878e418a17fa1f99ed5b1a27ff5e5`: 142 hospital route/connector cases including isolated-room refusal, and 53 forward/reverse instruction sections covering floor identity, connector arrival context, focus cleanup and mobile card clearance. These are local geometry/instruction regressions, not live vendor UI tests or UNBC route certification. Earlier attempts stopped before execution because `tsx` was absent. See [research evidence](mappedin-research-evidence.json). The six current visitor endpoint/cache/refusal unit tests also pass. This agent changed documentation only and did not install dependencies or alter the app.
