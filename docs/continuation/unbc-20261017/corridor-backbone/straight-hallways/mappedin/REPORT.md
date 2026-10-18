# Mappedin hospital demo review — 17 October 2026

Read-only observation in isolated local Chromium. No OpenIndoorMaps source/build edits and no map data or credentials replayed. Screenshots show the real public demo, not reconstructed geometry.

## Primary venue and route

[BC Children's and Women's Hospital campus](<https://demos.mappedin.com/web/mappedin-web/bc-children-s-and-women-s-hospital-campus/bc-childrens-hospital.html#/directions?to=Emercgency%20Reception%20(Turtle%20Bay)&from=s_67ef97b0c52ee383c6df7006&textDirectionsVisible=true&instruction=2>).

The demo resolves this request as **Neonatal Intensive Care Unit (Dragonfly) → Emergency (Turtle Bay) Reception**, with **3 minutes total**. The supplied URL's misspelled destination string resolves to the correctly labelled reception.

Observed:

- Long corridor portions are visually straight. Short real changes in corridor direction, entrances and destination approaches remain, with rounded-looking joins. This is evidence for fitting straight corridor runs independently, rather than averaging an entire bent route into one line.
- **The origin and destination are not always at the corridor center.** At instruction 0 the white origin marker has a short branch into the horizontal corridor. At arrival, the line leaves the long corridor and turns into the green reception footprint to meet the destination dot. Mappedin's example supports retaining explicit room/door branches; it does not establish a universal hallway-center endpoint rule.
- The UI uses ordinary turn/straight instructions and named landmarks (Entrance 53, Entrance 55). Micro changes in the blue line are not all presented as separate text instructions.
- This actual route uses an **elevator down from Level 2 to Level 1**. Selecting instruction 0 displays Level 2; instruction 2 displays Level 1. The level selector updates, and an elevator/down marker identifies the transition. This demonstrates a working elevator example, not tested stairs or accessibility certification.
- The current instruction is orange in the list. Route arrows/stronger highlighting distinguish the active portion, with other route context visible more faintly. The camera changes to show the selected instruction/floor.
- On the 390 × 844 viewport, the long list is replaced with a compact top instruction card and a bottom journey/progress panel with previous/next controls, leaving the map between them.
- No page errors were observed in the captured hospital sessions. This is not a quantified performance benchmark.

## Borrow for UNBC

1. Fit one shared straight trunk for an actually straight hall, preserving supported real corners and obstacle detours.
2. Keep endpoint policy explicit: a hallway-center mode may suppress short end branches, while a door/inside-room mode retains them. Preserve their original verified graph connections regardless of displayed mode.
3. Keep major transition markers and clear floor-specific instructions; update the camera with each selected step.
4. Consider rounded rendering joins as a presentation option after physical route validation. A rounded-looking stroke alone is not evidence that the underlying graph or its geometry was simplified.

## Limits

This review observes the visible application. It does **not** establish Mappedin's internal centerline construction, averaging, spline, graph topology, clearance model or routing cost function. No geometry was edited or routing engine inspected. The hospital example uses an elevator; stairs and step-free alternatives were not independently calculated in this review.

## Best evidence

- `desktop-instruction-2.png`: desktop route/instruction overview, Level 1, elevator selected (1440 × 1000).
- `desktop-arrival-zoom.png`: actual arrival close-up showing the final reception branch and clean long runs (1440 × 1000).
- `mobile-instruction-2.png`: mobile elevator step and compact navigation UI (390 × 844).
- `desktop-instruction-0.png`: origin branch and Level 2 context.
- `desktop-arrival.png`: wider arrival context.

The captured files originated in `/workspace/scratch/mappedin-demo-review/`; the evidence named here is archived alongside this report.

## Additional demo sampling

The root `https://demos.mappedin.com/` returned HTTP 404. The public [demo gallery](https://www.mappedin.com/demos/) is accessible. Its [outlet-mall demo](https://www.mappedin.com/demos/demo-outlet/) was also inspected with a calculated **Reebok → Rocky Mountain Chocolate Factory** route (3 minutes total).

The second venue repeats the same visible pattern: a short origin-to-gangway branch, long straight shared-looking gangway runs, intentional corner/angle changes, and rounded-looking line joins. Instructions retain meaningful slight turns at named landmarks (Natural Solutions and Taxi), so not every angle should be removed by averaging. The result was calculated and shown in the actual demo; it was not reconstructed from reference data. `outlet-route.png` contains the route and list, within the public gallery page and its cookie banner. `outlet-route-controls.json` records the resolved route/instruction text.

The review sampled **two venues and two journeys**. It did not inspect every Mappedin demo.
