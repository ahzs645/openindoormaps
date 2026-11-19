# UNBC campus walking atlas

These are the Python sources and map template used for the November 18 campus atlas. The application router lives elsewhere in this repository. The atlas reads an exported routing graph, native model geometry and saved field decisions. It shows campus connectivity and compares the result against measured example trips.

The matching model, audit, stock viewer, continuation kit and offline atlas are in the [release handoff](https://drive.google.com/drive/folders/1PdyETAWsVOPcPPC-RAOUSaJmqXEh-rWU). Download its Start Here guide for the file inventory. The archive retains the source and evidence together for historical rebuilds.

## Reproduce the released atlas

Install Python 3.11 or later and Shapely 2.x. Extract UNBC-campus-walking-atlas.zip, then extract its atlas-generator.zip into an empty directory. Supply the uncompressed browser-route-data.json and the matching compressed walking cache from the continuation kit. From the extracted generator directory run:

    python replay_export.py --dataset /path/to/browser-route-data.json --cache /path/to/published-cache.json.gz

The replay verifies source and input hashes, rebuilds the map, and checks the output HTML and stair reports against the published hashes. The result is campus-network/campus-update/screenshot-review/atlas/campus-network.html.

## Work on the next version

Use a separate copy of the extracted generator after the baseline replay. Copy the edited files from this directory over the matching paths in that copy. Run the relevant builder or check there. The archived replay checks the original source hashes, so use it on the untouched copy when comparing releases.

The main renderer and CLI are in campus-network/build.py. The hallway, landing and physical-level modules in the same directory control display geometry. Stair endpoint matching and landing checks are in stair_connections.py and native_stair_caps.py. The template controls the offline viewer. The continuation kit supplies worker validation, graph inputs and historical review material.

For a focused iteration on staircase changes, use the audit directory containing installed-receipt.json, arcs.json and browser-route-data.json:

    python campus-network/build.py --stairs-only --audit-dir /path/to/audit --output-dir /path/to/new-stair-reports

For a new release, rebuild the graph with the application worker and compare directional reachability and policy before publishing the atlas. The full production workflow also uses Node, a browser, and the staged test fixtures recorded in the continuation kit.

## Compare recorded route geometry

`render-route-review.py` creates fixed-scale route figures from the released
atlas's floor geometry and actual worker replies. It requires Python and
Matplotlib. The input replies use the continuation kit's
`browser-measurements.json.gz` schema (`datasetSha256`, `runtimeSha256`, and
`rows` containing `a`, `b`, `mode`, `metres`, `paths`, `departure`, and `arrival`).

```sh
python tools/unbc-atlas/render-route-review.py \
  --atlas /path/to/baseline/campus-network.html \
  --before /path/to/browser-measurements.json.gz \
  --after /path/to/candidate-worker-replies.json \
  --output /path/to/route-review
```

The renderer never smooths or fits route coordinates. Both panels use the same
extent. The old shared overview network is omitted so it cannot be mistaken for
a rebuilt candidate network. The receipt records input hashes, runtime/dataset
identities, figure hashes, route distances and turns within each displayed crop.
Use `--case building-10` (or another name shown by `--help`) for a focused run.
Omit `--after` to capture only the baseline.

When a new prepared routing catalog changes the serialized dataset but leaves
physical context unchanged, pass `--context-receipt` from the actual source
comparison. It must contain `baselineDatasetSha256`, `candidateDatasetSha256`,
and `physicalContext` with the compared `fields` and equal `sha256Before` and
`sha256After`. This retains the candidate's true dataset identity. A receipt
does not substitute for the required route and publication acceptance checks.

`capture-route-review.py` additionally exercises the offline atlas's public
hallway and walk controls with Playwright and captures the map at desktop and
mobile widths. It requires the Python Playwright package and an installed
Chromium (default `/usr/bin/chromium`, override with `--chromium`).

```sh
python tools/unbc-atlas/capture-route-review.py \
  --atlas /path/to/campus-network.html --output /path/to/route-review \
  --label baseline
```

These images document the measured route and the atlas view. They do not
establish native-model enclosure, physical-device behavior, step-free status,
or a newly published visitor package.
