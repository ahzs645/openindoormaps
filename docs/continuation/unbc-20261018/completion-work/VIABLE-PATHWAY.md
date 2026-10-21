# A viable UNBC visitor pathway

The visitor task is **find a destination, choose a known start, choose Walking or
Step-free, then follow the checked instructions**. Links already accept checked
existing place IDs as known starts and restore the destination and route
preference. Generating and installing venue QR signs, and verifying their physical
placement, remain proposed deployment work; a sign would identify its location,
not provide live positioning. Keep source imports and compiler
controls in the secondary authoring tools. Viewable places and destinations with
available directions remain distinct.

Use the destination's physically admitted arrival identity. The current
progressive worker explicitly requests its supported `inside` mode; full
authoring retains all admitted alternatives. The initial hallway-arrival
recommendation is not the implemented progressive default. Say **Arrive outside
[room]** only when an actual checked hallway-side alternative is available and
selected. A hallway-only request may genuinely refuse while an inside route
exists. Preserve that refusal; never force a fallback or create a centroid
arrival.

The hospital demo supplies useful interaction examples, documented in
[the Mappedin investigation](../ship-readiness/mappedin-lessons.md). It cannot
establish UNBC door operation, public access, source geometry or lift service.

## Keep expensive compilation out of the first visit

Use three separately bound publication products:

1. A small searchable overview opens first. It contains stable place identities
   and building/floor information, without loading the full authoring project.
2. A checked floor drawing supplies the ordinary 2D map. The normal native floor
   producer must reproduce it independently. Shared features may use a checked
   full base plus a lossless delta; the reconstructed complete drawing must still
   match its own exact SHA-256. Selecting a room must not rebuild the floor.
   Preserve original connector icons, source identities and review states as
   display anchors; an icon does not create an arrival or route connection.
3. Checked routing inputs reuse the original validator's work for one immutable
   source and consumer. The normal graph search and returned-path physical and
   policy checks remain. An edited source or consumer invalidates admission.

The 3D/authoring view loads complete detail explicitly. Drawing data never creates
navigation or access authority. A present corrupt drawing or directions carrier
must refuse visibly; an absent optional optimization may retain the normal path.
The final publication checks require the optimizations to be present, so a
release cannot silently fall back to the old expensive startup.

Ordinary viewing may defer optional cache writes. The explicit complete-map
download must await persistence, save the app shell and fonts, and verify that
all declared floors still coexist in storage before reporting completion.

## Preserve the evidence that makes directions trustworthy

Every connection needs its actual source identities, served levels, finite
entrance, full standing/support/headroom clearance, foreign obstacles, ownership,
direction and policy. Keep real floor holes. Compose multi-run stairs from their
original runs and landing; a matching outline alone does not enable a link.
Unknown access stays unknown. Step-free never falls back silently to stairs or an
unconfirmed connection.

Hall A–Q already has an original public-access decision. Its recorded Claude
artifact remains the unverified source of the missing letter-to-identity legend.
Recovering that scope is separate from requesting permission again. The current
source retains four public and eight staff records; the other access values have
not been guessed.

## Check one coherent candidate before calling it ready

After source repairs settle, freeze both repositories and regenerate the complete
candidate. Keep the two arrival-preservation guards active. Replay all 28 held
links and record each current result; a refusal must retain its concrete reason.
An intended launch scope may include only destinations and connections supported
by the resulting physical and access evidence.

Produce and verify the full visitor, every declared physical floor, compact
drawings, directions carrier and both exact committed source trees together.
Run the existing project and directions publication checks, plus:

```sh
node --max-old-space-size=4096 --import tsx \
  scripts/indoor/check-published-visitor-plans.ts PUBLIC_ROOT NEW_REPORT.json
```

The compact drawing check opens every declared floor through the production
loader, then reopens it from a genuinely populated per-scope cache with network
forbidden. It checks exact full/delta bytes and current source/runtime bindings.
It does not replace actual browser paint or real-phone testing.

Require actual desktop/mobile-viewport map and route proof, measured cold and
warm timings, full-save plus network-offline reopening, corruption/retry,
selection, floor transitions, instruction following and stale-request recovery.
Then run the frozen candidate on the physical phones being advertised and
separately confirm venue access and operational conditions. Those results cannot
be inferred from a software viewport. Restore the final paired download into a
fresh workspace and check the complete static hosting size before publication.

## Saved work and current acceptance

The current accepted-data framework is bound to preparation engine `1fc36910…`,
routing runtime `3fa380e5…` and plan runtime `61f4638e…`. Exact full hashes,
accepted dataset `87194bb9…`, original rooms `f329b643…` and served
manifest/revision are in the
[current 3fa browser summary](loading/private-json-3fa-browser-acceptance.json).
[EVIDENCE-016](https://drive.google.com/file/d/1w0puQULQW3kuomBmqW6h2AgZJ9xj0PHg/view?usp=drivesdk)
preserves delivery data and the source baseline;
[EVIDENCE-024](https://drive.google.com/file/d/1eUlKl7Ni6fKkOyrhb-k7vNMWuM8S04Th/view?usp=drivesdk)
preserves the exact private-JSON source changes, fresh normal validation and
proper-worker parity;
[EVIDENCE-026](https://drive.google.com/file/d/1UC2mIX1985HZL58Mw3WOcN8-WQ95RybY/view?usp=drivesdk)
preserves the exact new built app, three focused browser cases and restore index.
All three archives passed remote whole-file/member readback.

On 2026-10-18, the three focused actual `1fc/3fa/61f` browser cases passed with
zero skips or flaky results:

- A fresh browser with real IndexedDB and local HTTP returned its first walking
  result in **33.711 seconds**. The current instruction, Previous/Next and access
  warning were fully visible at 390×844 before test scrolling or post-result
  interaction. Same-scope instruction preview required no new floor download.
- A genuine complete-map save persisted and decoded **117,995,935 logical
  routing bytes**, with SHA-256
  `0762303248a9a4e23dfbe3c0b7c516fdf5d7623365a6a2d4ddc0703f55668628`
  (23,517,569 stored bytes). A cold app reload with all browser networking
  disabled loaded the saved shell, fonts, full/shared floors and all 48 original
  Main-floor markers through the service worker. A fresh worker calculated an
  offline **70 m** route in **29.344 seconds**.
- Walking produced the tested ramp journey; changing to Step-free cleared its
  instructions and returned the genuine unconfirmed-connection refusal. The old
  Walking route was not reused as a Step-free result.

The earlier same-day `1fc/a844/61f`
[EVIDENCE-017](https://drive.google.com/file/d/1ykYb8EN8xid6nlWMHHRHc1aHFh_-G_Ml/view?usp=drivesdk)
retains twelve unique actual browser passes, including picking, floor/3D changes,
duplicate-place map comparison, corruption/retry and original marker styling.
Its first walking result was **25.844 seconds** and fresh offline result
**24.524 seconds**; those measurements remain attached to that earlier runtime.
Its seven-case partial run and three corrected rerun cases remain explicit;
no full ten-case run or new-runtime rerun is manufactured from them.

The `3fa` change was retained for separately measured parsing/freezing CPU and
post-parse memory reductions under a contemporaneous proper-worker comparison,
with all ten complete normal route results exact. The browser timings above do
not establish a speedup; no meaningful whole-route or peak-heap benefit is
claimed. These are cloud Chromium/SwiftShader/local HTTP functional results,
not WAN or physical-phone timings, a latency guarantee, public-access approval
or a new native master. Earlier `9ff` iterations remain historical evidence.

Source inspection confirms that the progressive page restores checked `from` and
`to` place IDs plus route preference, then updates the URL while retaining the
map manifest. The existing link helper and browser-test sources cover endpoint,
profile, reload and unavailable-link behavior. This capability is already present
in the frozen app; it is separate from physical QR signs. These browser
acceptance suites do **not** specifically retest route-link round trips. See the
[progressive implementation](../../../../app/pages/progressive-visitor-page.tsx),
[route-link helper](../../../../app/indoor-project/route-link.ts) and
[existing link tests](../../../../tests/e2e/indoor-route-links.spec.ts).

The [Drive work folder](https://drive.google.com/drive/folders/1EUFgNbO9Hxcc6cDhZLrFt6BoQAFOfhA8)
contains the exact baseline, numbered paired-source checkpoints and separate raw
evidence archives. Checkpoints are freshly restored and their uploaded bytes
read back and checked. `WORK-STATUS.json` identifies the latest checkpoint. The
live site has not been changed by this completion work.

Final source regeneration, the complete combined build's current physical/policy
and offline acceptance, venue conditions and advertised real phones remain
separate gates. Known-start route URLs are implemented; venue QR sign generation,
installation and physical placement remain unverified. No historical pin or
current accepted-data browser pass is relabelled as final release approval.
