"""Archive the renderer, native replay and gate sources plus the final audited map inputs."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

review=Path(__file__).resolve().parent
campus=review.parents[1];root=campus.parent;update=review.parent
release=review/os.environ.get('UNBC_SCREEN_RELEASE_DIR','final-release');out=review/'atlas';history=campus/'hallway-review'
def digest(p):
    with p.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
sources={}
def include(folder,names):
    for name in names.split():
        p=folder/name
        sources[p.relative_to(root).as_posix()]=p
include(root,'staircase-connections.csv')
include(campus,'build.py stair_connections.py native_stair_caps.py stair-cap-evidence.json stair-observations.json template.html landing_overview.py physical_level_overview.py hallway_overview.py hallway_tip.py overview.py check-map.cjs')
include(history/'release/display','rebind.py verify-new.py verify-thresholds.py')
include(history/'thresholds','build.py')
include(history/'building08','check.mts proposals.json physical-checks.json display-patch.json')
include(history/'junction','physical-checks.mts candidates.json physical-checks.json display-patch.json')
include(update/'atlas','evidence.py check-traces.py verify-tip.py package.py')
include(update/'verification','crossings.py prior-crossing-browser.json')
include(update/'loop-review/building04-upper','observed.json')
include(update/'format-replay','browser-measurements.json installed-receipt.json')
include(update/'final-atlas','campus-network.html')
include(update/'final-checked/trips','current-worker.json')
include(review,'atlas_pipeline.py atlas_screens.py check_parallel.py contact-sheet.py capture-screens.cjs generator_archive.py replay_export.py')
include(review/'landing-followup','test_stair_connections.py check-stair-map.cjs')
include(review/'b09','inventory.py shared_landings.py check.py figure.py check-preview.cjs finish_preview.py proof.json checks.json')
include(review/'rotundas','check-upper-display.py upper-display-proof.json')
include(review/'verification','check_drawn_spans.py check_atlas.cjs')
include(out/'display','thresholds/patch.json junction/display-patch.json building08/display-patch.json floor1-tip-replay.json rebind-proof.json')
include(out,'agora-parallel-check.json evidence.json')
include(release,'map-ready screenshot-pairs.json trips/current-worker.json')
if (release/'upper-landing-observation.json').is_file():include(release,'upper-landing-observation.json')
if (release/'audit/stop-vertex-proof.json').is_file():include(release,'correct-stop-vertices.cjs audit/stop-vertex-proof.json')
include(release/'audit','installed-receipt.json campus-connectivity.html visitor-display-proof.json arcs.json stops.json all-branches.json public-room-branches.json trip-destinations.csv review-graph.json')
sources['replay_export.py']=review/'replay_export.py'
receipt=json.loads((release/'audit/installed-receipt.json').read_bytes())
externals={'dataset':release/'audit/browser-route-data.json','cache':release/'openindoormaps/public'/receipt['url'].lstrip('/')}
manifest={'files':{n:digest(p) for n,p in sorted(sources.items())},
          'external':{n:dict(location=p.relative_to(root).as_posix(),sha256=digest(p),bytes=p.stat().st_size) for n,p in externals.items()},
          'stairReportHashes':{name:digest(out/name) for name in ('stair-connections.json','stair-connections.csv','native-stair-caps.json','native-stair-caps.csv')},
          'expectedAtlasSha256':digest(out/'campus-network.html'),'runtime':receipt['runtimeSha256'],'release':release.name}
assert manifest['external']['dataset']['sha256']==receipt['datasetSha256'] and manifest['external']['cache']['sha256']==receipt['compressedSha256']
docs="""# Rebuild the UNBC walking atlas

Extract this archive to an empty directory. Install Python 3.11 or later and Shapely 2.x. Supply the matching exported routing JSON and the compressed published walking cache. The final application archive contains the cache under `viewer/data/unbc-routing`. The raw JSON is the browser-route-data.json exported during the routing audit. The content, size and destination of both inputs are recorded in reproduction.json.

Run the following from the extracted directory.

    python replay_export.py --dataset /path/to/browser-route-data.json --cache /path/to/published-cache.json.gz

The command verifies the source and input hashes, rebuilds all twelve floor layers and the campus room matrix, and replays the measured walking examples and screenshot views. It verifies the finished HTML byte for byte against the distribution. The regenerated file is campus-network/campus-update/screenshot-review/atlas/campus-network.html.

## Checking only staircases

From the extracted unbc-connections directory layout, run `python campus-network/build.py --stairs-only --audit-dir PATH_TO_AUDIT --output-dir PATH_TO_REPORTS` after supplying the routing JSON. This recomputes both ends of every native stair and follows the public graph to and from its landings. The reports include source-floor checks and directional field observations. A change to the referenced source evidence invalidates its old binding. Open campus-network.html#stair-1779620 in the resulting full atlas to inspect the pub staircase.

## Updating a later export

The renderer is campus-network/build.py. landing_overview.py examines real two-way graph alternatives on a native face before merging duplicate landing approaches. physical_level_overview.py places flat walks between level-change landings on their physical elevation. template.html contains the map, floor selection and landing controls.

For a fresh audit in the existing research workspace, put the new stage beside screenshot-review/final-release and run `UNBC_SCREEN_RELEASE_DIR=stage-name python atlas_pipeline.py` from screenshot-review. The full pipeline expects the project’s OpenIndoorMaps and Reviter installations, the historical rotunda audit for local drawing proofs, the preceding final-checked audit and final-atlas distribution, plus Node 22 with tsx/Playwright, Chromium, Shapely and Pillow. Each stage supplies map-ready, the native application and published cache, trips/current-worker.json, screenshot-pairs.json and the audit exports. The builder recomputes physical evidence, hallway and room-entrance display patches, compares all directory pairs, tests both viewport sizes and regenerates the images and archives. The immutable inputs included here reproduce this edition. Later exports must use their own audited arcs and stops. Screenshot-focused claims are tied to this edition’s evidence and should be rechecked before publication.

reproduction.json lists SHA-256 digests for the archived source and audited inputs. The small diagram, native replay and acceptance scripts retain their original project paths for reuse in a full research checkout.
"""
archive=out/'atlas-generator.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=4) as z:
    for name,p in sorted(sources.items()):z.write(p,name)
    z.writestr('reproduction.json',json.dumps(manifest,indent=2)+'\n');z.writestr('README.md',docs)
with tempfile.TemporaryDirectory(prefix='unbc-atlas-replay-') as tmp:
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None;z.extractall(tmp)
    e=dict(os.environ,PYTHONPATH=os.pathsep.join([str(root/'py'),os.environ.get('PYTHONPATH','')]))
    with (out/'source-replay.log').open('w') as stream:
        subprocess.run([sys.executable,'replay_export.py','--dataset',str(externals['dataset']),'--cache',str(externals['cache'])],cwd=tmp,env=e,stdout=stream,stderr=subprocess.STDOUT,check=True)
verified={'archive':archive.name,'archiveSha256':digest(archive),'bytes':archive.stat().st_size,'filesChecked':len(sources),
          'expectedAtlasSha256':manifest['expectedAtlasSha256'],'exactCleanReplay':True}
(out/'source-replay.json').write_text(json.dumps(verified,indent=2)+'\n')
print(verified)
