# Prepared walking guides

The indoor viewer calculates the selected route on demand. Preparation compiles reusable planar walking segments from the existing graph, exact native floors, walls and columns. The selected doors, access rules and physical stairs/lifts/ramps remain authoritative. This avoids storing every possible room-to-room route.

## Prepare and open

After Reviter's normal **Prepare OpenIndoorMaps project** export, run from OpenIndoorMaps:

```sh
npm run indoor:prepare-routing -- /absolute/prepared.reviter.zip /absolute/routing-prepared.reviter.zip
```

Import the output with **Import project ZIP** in the updated OpenIndoorMaps build. For local development, run `npm run dev` and open `/projects/indoor`. The [public viewer](https://projects.ahmadjalil.com/openindoormaps/#/projects/indoor) needs this change deployed before it can use the compiled guides. Existing projects continue to load. The compiler writes a `.routing-report.json` beside its output. Input and output paths must differ; the source ZIP is retained.

To create a smaller viewer package containing the compiled guides:

```sh
npm run indoor:export-viewer -- /absolute/routing-prepared.reviter.zip /absolute/routing-prepared.campus-viewer.zip
```

This is an explicit OpenIndoorMaps postprocessing step; Reviter's preparation button does not yet run this additional compiler automatically. Rerun it after regenerating native geometry or completing access/door reviews.

## What is stored and checked

The optional `preparedRouting` field in `viewer/indoor.json` contains versioned edge IDs and model-feet point arrays. Each guide preserves the original graph endpoints and planar elevation. There are no new graph links or changed source reviews.

The binding uses SHA-256 over the routing policy/geometry snapshot, native barriers, alignment and complete node metadata. In-place wall, floor, door, direction, access or node changes invalidate the prepared guides. Unsupported resolver versions and source mismatches use the existing solver. Malformed point arrays or duplicate IDs reject package import.

At request time, Dijkstra selects graph connections as before. The resolver orients and joins the relevant compiled segments, stabilizes native wall frames across JavaScript engines, then rechecks continuous native floor support, obstacles, room ownership, selected door permissions and finite opening bodies. Simplification and curved-corridor guidance still run. A failed geometry/policy candidate uses the existing native resolver. Step-free routes retain their existing source geometry and accessibility proofs.

The preparation exporter changes only `viewer/indoor.json` and its manifest checksum/size. It preserves the exact bytes of model, scene, room annotations, GIS and viewer metadata, including authored JSON formatting. Both master and viewer ZIPs round-trip with the prepared field intact.

## Validation commands

```sh
node --max-old-space-size=4096 --import tsx scripts/indoor/audit-prepared-routing.ts routing-prepared.reviter.zip audit.json
node --import tsx scripts/indoor/audit-resolved-geometry.ts routing-prepared.reviter.zip audit.json.geometry.json clearance.json
INDOOR_PROJECT_ZIP=/absolute/routing-prepared.reviter.zip npx playwright test tests/e2e/indoor-prepared-routing.spec.ts --workers=1
```

The campus audit compares known forward/reverse journeys, unconstrained seeded room pairs and connected random pairs on different floors. It requires matching availability, graph edges, door crossings, unknown-access areas and physical transition geometry. Each new supported planar segment is independently checked against complete native slab coverage, including holes. The separate clearance audit checks native walls, columns and selected source apertures. Blocked source connections stay blocked.

Browser tests observe actual worker responses, compare their graph and geometric paths with the local solver, and follow same-floor, curved multi-floor and stairs/elevator journeys through the visitor interface at desktop and mobile sizes.

## UNBC measurements — October 3, 2026

Preparation compiled 6,787 of 7,155 walking edges; 368 use the existing resolver. It took about 90 seconds and added approximately 347 KB to the full archive. No model/GIS/review assets changed and no graph connections were added.

Across 64 requests, 40 produced routes and 24 stayed blocked in both engines; 38 successful journeys changed floor or used local steps. Median successful public-route calculation fell from 1,245 ms to 650 ms, and the maximum fell from 3,492 ms to 1,539 ms. These are sequential local Node measurements excluding ZIP parsing, not browser/mobile latency guarantees. Some short requests became slightly slower because binding validation adds work.

The real browser checks passed at both sizes, covering six journeys. UI route readiness was about 2.1–3.5 seconds on this machine with software rendering; these timings include endpoint selection and worker communication. Native floor presentation preparation is separate. An additional 170 browser-returned segments passed independent floor and obstacle checks; see `prepared-walking-guides-browser.json` and `prepared-walking-guides-browser-clearance.json`.

The independent floor and obstacle audits checked 864 segments across 144 resolved walking sections, with no unsupported floor intervals or obstacle crossings. See `prepared-walking-guides-audit.json` and `prepared-walking-guides-clearance.json` for measured scope and cases.

Preparation does not repair missing doors, verify public accessibility or authorize unverified elevator stops. Those remain source/review tasks. Native route refinement still runs where compilation could not establish a reusable guide.
