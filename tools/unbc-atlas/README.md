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
