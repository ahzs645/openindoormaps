# Lazy 2D plan loading on the final candidate — November 2, 2026

Branch `claude/lazy-plan` (from `0207443`). Candidate: the final candidate
([../final-candidate/](../final-candidate/README.md)), visitor dataset
`6abc227a…`, directions carrier `3d27eaa5…`, engine `4a0a354a…`. Nothing was
published.

**Result.** The first floor is drawn after opening the page in 7.1–8.2 s. With
plans loaded at startup it took 12.3–18.0 s, and before plans were admitted it
took about 6–10 s. The first route did not get slower: shown with its floor
ready in 18.1–23.1 s, against 18.7–25.2 s before. Later routes take 5.1–6.6 s,
the same as before. Peak renderer RSS fell from 2.57–3.30 GB to 2.27–2.64 GB.
No run had a page error.

The cost moved to the first zoom into the opening floor. Its plan now loads
at that point (see "Trade-off").

## Change

`progressive-visitor-page.tsx` loaded the checked plan of the selected 2D floor
at any zoom. `planWanted` did not depend on detail, so the opening view
downloaded and drew the default floor's plan: the Floor 1 delta and its base,
5.5 MB gzip and 45 MB logical.

`planWanted` now comes from `visitorPlanWanted` in
`app/pages/progressive-visitor-plan-demand.ts`. A floor's plan is wanted only
in 2D, for an admitted scope, outside the locked overview, and once one of
these is true:

- the zoom is past `ROOM_DETAIL_START`;
- `requestedDetailScope` is this floor, meaning it was zoomed in earlier or
  opened in 3D. This existing sticky key also keeps a drawn plan when the
  visitor zooms back out;
- the visitor was shown this floor (new `shownScope`). That is set by
  `focusInstruction` (the route result and step previews), by `locate` (search
  results and "Show start/destination on map") and by the Floor picker.

`load()` clears `shownScope`, so opening or reopening a map starts from the
overview. The route result sets `shownScope` in the same React update that
switches to the start's floor. The plan request therefore starts exactly when
it did before: 0.0–0.1 s after the route paint in every run.

The following are unchanged:

- plan receipts and every plan check;
- the corrupt-carrier error and retry, and the `missing` fallback to the
  detailed decoder;
- offline download, which still saves every plan, and cached reopening;
- 3D and review;
- `requestDetail`, so a missing plan behaves as before;
- the memory scheduler;
- route worker residency. The runs show one route worker, never terminated,
  that is reused by the later route.

The engine, route runtime and plan runtime bindings are unchanged:
`4a0a354a…`, `49f1e88b…` and `4705ec62…`. The binding scripts reproduce the
committed values, and no binding file changed.

## Before and after (same collector, same journeys)

Collector: [../plans/tools/profile-route.mjs](../plans/tools/profile-route.mjs)
via `run-measurements.sh … lazy --later`, with cold Chromium at desktop
1440×900 and iPhone 13, two runs each. The runs are serialized under the shared
heavy-job lock.

- Before: [BEFORE-SPLIT.json](BEFORE-SPLIT.json), a copy of
  `final-candidate/SPLIT.json`. The raw runs are in
  `/home/user/unbc-work/final/plans-runs`.
- After: [SPLIT.json](SPLIT.json). The new root
  `/home/user/unbc-work/lazy/root` was built from `9176b9b` by
  `build-public-root.sh`. Its plan check passed 7/7 scopes with no fallback,
  and the directions-cache check reported `currentCompiledReceiptMatches: true`.
  The raw runs are in `/home/user/unbc-work/lazy/runs`.

Each cell is run 1 / run 2. Times are in seconds. "Initial floor ready" is
measured from the start of the collector, and navigation begins at 0.1–0.2 s.
The route columns are measured from "Get directions".

| Event                               | Desktop before               | Desktop after                | Mobile before                | Mobile after                 |
| ----------------------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------- |
| **Initial floor ready**             | 14.84 / 12.29                | 8.18 / 7.63                  | 18.00 / 12.35                | 7.08 / 7.13                  |
| Plan requested at startup           | yes (3.8–5.4)                | no                           | yes                          | no                           |
| **First route paint** (121 m)       | 14.20 / 13.46                | 12.94 / 13.72                | 18.32 / 14.43                | 16.45 / 13.52                |
| Floor 2 plan requested / downloaded | 14.17 / 14.64, 13.59 / 14.18 | 13.04 / 13.66, 13.80 / 14.35 | 18.33 / 19.03, 14.43 / 14.98 | 16.40 / 17.04, 13.47 / 14.11 |
| **First route floor ready**         | 21.11 / 18.68                | 18.10 / 19.45                | 25.22 / 19.37                | 23.07 / 19.07                |
| Later route shown (186 m)           | 4.69 / 4.46                  | 4.80 / 4.45                  | 5.76 / 5.19                  | 5.30 / 5.76                  |
| **Later route floor ready**         | 5.35 / 5.12                  | 5.49 / 5.14                  | 6.57 / 5.78                  | 5.91 / 6.61                  |
| Route worker terminated             | never                        | never                        | never                        | never                        |
| **Peak renderer RSS (GB)**          | 2.57 / 2.66                  | 2.31 / 2.31                  | 3.30 / 2.77                  | 2.64 / 2.27                  |
| **Page errors**                     | 0 / 0                        | 0 / 0                        | 0 / 0                        | 0 / 0                        |
| Load average (1 min, end of run)    | 3.51 / 4.69                  | 2.23 / 3.15                  | 6.17 / 4.26                  | 3.46 / 2.38                  |

The after runs had no console errors either. Route results are unchanged:
121 m with the same steps, and 186 m for the later route. The route
screenshots are pixel-identical to the before runs, except 24 pixels in one
corner of desktop run 2:

- [desktop-lazy-1-corridor-default.png](desktop-lazy-1-corridor-default.png)
- [mobile-lazy-1-corridor-default.png](mobile-lazy-1-corridor-default.png)

The opening view is the overview again, as shown in
[opening-overview-desktop.png](opening-overview-desktop.png).

The mobile run 1 first route took 23.1 s. Its paint came 3 s later than the
other runs, during routing. The plan was requested at the paint, as in every
run, and was drawn 6.6 s later. The before runs took 4.9–6.9 s for the same
step. That variation comes from the shared host, not from this change. The
host has 4 cores and other agents' jobs were queued. The before runs had higher
load averages (3.5–6.2 against 2.2–3.5), so the absolute seconds vary by about
2–3 s.

## Trade-off: the first zoom into the opening floor

[tools/zoom-probe.mjs](tools/zoom-probe.mjs) opens the page cold at desktop
size and clicks the map's "Zoom in" control until the zoom passes 17.5. It
then waits for the drawn plan. The probe ran twice on each root, against the
before root `final/plans-root` and the new root. Results are in
[ZOOM-PROBE.json](ZOOM-PROBE.json); load averages were 3.3–4.4.

| Probe (seconds from navigation)  | Before        | After         |
| -------------------------------- | ------------- | ------------- |
| Opening drawn                    | 13.33 / 13.20 | 10.01 / 9.75  |
| Zoom passes the detail threshold | 23.15 / 22.14 | 20.08 / 18.56 |
| Zoomed plan drawn                | 23.41 / 23.05 | 29.01 / 28.22 |
| Zoom start → zoomed plan drawn   | 10.1 / 9.8    | 19.0 / 18.5   |

Stepping the zoom takes about 9–10 s in both builds on this software-GL host.
After that, the plan's download, decode and draw (about 9 s) now come after
the zoom instead of during the opening. A visitor who opens the page and
immediately zooms into the main floor therefore sees its detailed plan about
5–6 s later than before. During that time the screen shows "Loading floor…"
over the overview.

Every other path is faster or unchanged:

- opening the page;
- routing, because the route's floor is requested at the paint as before;
- picking another floor;
- looking only at the overview.

An idle prefetch of the opening plan could recover the zoom case. However, it
would compete with the routing warmup and the first route, which this change
must not slow down, so it was not added.

## Tests

- `npx tsc -p tsconfig.indoor-project.json` and the full `npx tsc` pass.
- Unit tests pass, 163/163: `tests/unit/*visitor*`, `*plan*` and
  `progressive-*`. This includes the new
  `tests/unit/progressive-visitor-plan-demand.test.ts`, which covers:
  - the opening does not want the plan;
  - zoom, the kept detail request or a shown floor does want it;
  - 3D, the locked overview and unadmitted scopes never want it;
  - the page wires `visitorPlanWanted`, `showScope` and the reset in `load()`.
- `npm run test:pages` passes 6/6, with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`.
- `tests/e2e/published-visitor-plan.spec.ts` is env-gated and not in CI. It now
  expects the overview opening and checks that no plan is requested before the
  first zoom, route focus, located place or chosen floor. The duplicate-endpoint
  case allows the shown floor's plan (and its delta base) on the first focus and
  nothing on the second. Against the new root, 13 of the 14 tests pass,
  including:

  - cold paint, floor switches and cached reopen on desktop and mobile;
  - the corrupt carrier and retry;
  - 3D retry and the 3D round trip;
  - markers;
  - the walking route;
  - step-free;
  - the complete offline download;
  - root entry.

  "Repaired 03/05/169" needs normal-output inputs that are not present here,
  so it was skipped.

## Reproduce

```sh
T=docs/continuation/unbc-20261102/plans/tools
$T/build-public-root.sh "$PWD" PROGRESSIVE CARRIER.json.gz NEW-ROOT VISITOR.json 6abc227a…
(cd NEW-ROOT && python3 -m http.server 42930 --bind 127.0.0.1 &)
$T/run-measurements.sh http://127.0.0.1:42930 OUT lazy --later
node $T/summarize-split.mjs docs/continuation/unbc-20261102/lazy-plan/SPLIT.json OUT
node docs/continuation/unbc-20261102/lazy-plan/tools/zoom-probe.mjs http://127.0.0.1:42930 lazy-1 OUT
```
