"""Check the offline atlas against the previous distribution, then assemble the verified reader package."""
import csv
import hashlib
import io
import json
import zipfile
from collections import Counter
from pathlib import Path
import os

scripts=Path(__file__).resolve().parent
here=Path(os.environ.get("UNBC_ATLAS_OUTPUT",scripts)).resolve()
campus=scripts.parents[1]
comparison=Path(os.environ.get('UNBC_ATLAS_COMPARISON_DIR',campus)).resolve()
release=here.parent/os.environ.get('UNBC_ATLAS_RELEASE','format-replay')
def read(p):
    return json.loads(p.read_bytes())
def data(p):
    return json.JSONDecoder().raw_decode(p.read_text().split('const data=',1)[1])[0]
def pairs(p):
    with p.open() as f:
        rows=list((r['origin_record'],r['destination_record']) for r in csv.DictReader(f))
    assert len(set(rows))==len(rows)
    return set(rows)
def encode(segment):
    g,a,b=segment
    return g,*sorted((tuple(a),tuple(b)))
def digest(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def ordered(n):
    return f'{n:,}'
m=data(here/'campus-network.html');prior=data(comparison/'campus-network.html');e=read(here/'evidence.json')
s=read(here/'summary.json');rec=read(release/'audit/installed-receipt.json')
assert rec['runtimeSha256']==(release/'map-ready').read_text().strip()==s['runtime']==e['runtimeSha256']
assert s['previousRuntime']==prior['summary']['runtime']==e['previousRuntime']
assert {w['originBuilding'] for w in e['walks'] if w['originBuilding']==w['destinationBuilding']}==set(s['buildings'])
old=pairs(comparison/'all-room-directions.csv');now=pairs(here/'all-room-directions.csv')
with (here/'changed-room-directions.csv').open() as f:delta=list(csv.DictReader(f))
for state,a,b in [('New',now,old),('Lost',old,now)]:
    changed={(r['origin_record'],r['destination_record']) for r in delta if r['change']==state}
    assert len(changed)==sum(r['change']==state for r in delta)
    assert a-b==changed
assert len(now)==s['publicTrips'] and len(old)==e['previousPublicTrips']
if 'allDistinctPairs' in s:
    with (here/'directory-records.csv').open() as f:keys=[r['record'] for r in csv.DictReader(f)]
    with (here/'all-pair-reachability.csv').open() as f:
        table=csv.reader(f);assert next(table)==['origin_record',*keys]
        for a,row in zip(keys,table,strict=True):
            assert row[0]==a and len(row)==len(keys)+1
            assert all(cell==('' if a==b else str(int((a,b) in now))) for b,cell in zip(keys,row[1:]))
    assert s['allDistinctPairs']==len(keys)*(len(keys)-1)

layers=[]
for lid in m['levels']:
    l=str(lid);geo=m['geo'][l];previous=prior['geo'][l]
    a=set(map(encode,geo['network']));b=set(map(encode,previous['network']))
    assert a-b==set(map(encode,geo['currentExtra'])) and b-a==set(map(encode,geo['previousExtra']))
    assert geo['bounds'] and (geo['rings'] or geo['treads'] or geo['fallback'])
    assert (here/f'floor-images/{l}.png').stat().st_size>1800
    layers.append(dict(nativeLevel=lid,name=geo['name'],visitorPlan=geo['exported'],nativeModelStairs=len(geo['treads']),
                       displayedSegments=len(a),newDisplaySegments=len(a-b),previousOnlyDisplaySegments=len(b-a)))
proof=read(here/'display/new-uses-verification.json');thresh=read(here/'display/verified-thresholds.json')
assert not proof['lostDrawings'] and proof['runtimeSha256']==thresh['runtimeSha256']==s['runtime']
browser=(here/'browser.log').read_text()
assert '1300 px passed' in browser and '390 px passed' in browser
verification=dict(runtime=rec['runtimeSha256'],dataset=rec['datasetSha256'],cache=rec['compressedSha256'],previousRuntime=s['previousRuntime'],previousAtlasSha256=digest(comparison/'campus-network.html'),
                  previousDirectionsSha256=digest(comparison/'all-room-directions.csv'),candidateDirectionsSha256=digest(here/'all-room-directions.csv'),
                  buildings=s['buildings'],directory=s['directory'],levels=layers,publicWalks=len(e['walks']),reviewedHallwayViews=len(m['reviewedViews']),
                  multiLevelWalks=sum(len(w['layers'])>1 for w in e['walks']),newDirections=e['gained'],lostDirections=e['lost'],
                  totalDirections=len(now),browserViewports=[1300,390],verifiedTrueRoomThresholds=thresh['finalMapConfirmedThresholds'],
                  localPatches=thresh['localApproachesRebound'],newArcSegmentsPresentInOverview=proof['newArcSegmentsInOriginalOverview'],
                  newArcSegmentsOutsideOverview=proof['newArcSegmentsOutsideOriginalOverview'])
(here/'validation.json').write_text(json.dumps(verification,indent=2)+'\n')
num_native=s['nativeLevels']-s['planLayers']
(here/'README.md').write_text(f"""# UNBC campus walking atlas

Open `campus-network.html` after extracting this ZIP. The map works offline. Use **Tested walk** to follow one of {len(e['walks'])} public walking directions. For a trip covering multiple levels, **Trip level** shows each floor separately. The full-trip distance appears below the map. When offered, **Overlay walk before loop cleanup** draws the earlier measured walk for the same direction in dashed rust. The building and floor connections tab can check both directions between any two directory entries.

The atlas covers {len(s['buildings'])} buildings and {s['nativeLevels']} native levels. Nine levels have visitor plans. The other {num_native} show native geometry. **Previous hallway drawing** restores the network from the previous distributed atlas on the selected floor. **Room numbers and entrances** shows map labels and retained doorway marks.

The public graph connects {ordered(len(now))} ordered pairs of distinct directory entries, including {ordered(e['gained'])} newly reachable directions and {ordered(e['lost'])} lost directions relative to the previous atlas. The CSV files identify each changed pair and summarize changes by the building of origin. Room-number ranges give the first and last observed number on each building's directory floor. Directory floors and physical walking levels can differ.

A public lift, stair or ramp can be isolated from room-to-room directions. Check its two landing counts in the map. Drawn stair outlines mark source geometry. Held transfers require further evidence. The mapped profile is public walking. Step-free directions require their own checks.

`validation.json` records the installed release fingerprints, display checks and map coverage. Each PNG in `floor-images` is one native level, keyed by its model ID in that file.
""".replace('Nine levels',f"{s['planLayers']} levels"))
files=['campus-network.html','campus-network-preview.png','campus-network-mobile.png','all-campus-levels.png','all-room-directions.csv','changed-room-directions.csv',
       'building-connections.csv','floor-connections.csv','building-changes.csv','room-ranges.csv','vertical-links.csv','native-stair-inventory.csv','README.md','summary.json','validation.json',
       'measured-trace-checks.json','display/rebind-proof.json','display/verified-thresholds.json','display/new-uses-verification.json']
if 'allDistinctPairs' in s:
    files.extend(['all-pair-reachability.csv','directory-records.csv'])
    with (here/'README.md').open('a') as f:
        f.write(f"\nThe full matrix covers all {s['allDistinctPairs']:,} ordered pairs of different directory records. A 1 indicates a reachable route and 0 indicates a disconnected direction. The diagonal is blank. Use the directory key CSV to look up each row or column by room number.\n")
extra_files=os.environ.get('UNBC_ATLAS_EXTRA_FILES','').split(',')
files.extend(n for n in extra_files if n)
if 'stair-connections.csv' in extra_files:
    caps=read(here/'native-stair-caps.json')
    report=read(here/'stair-connections.json')
    if report['runtimeSha256'] != s['runtime'] or caps['runtimeSha256'] != s['runtime']:
        raise ValueError('Stair checks belong to another routing build')
    with (here/'README.md').open('a') as f:
        f.write(f"\n## Staircases\n\nThe rebuild checked {report['nativeStairs']} native stair elements and {caps['ends']} ends. "
                "Open [Stair 6 beside the pub](campus-network.html#stair-1779620) to see the two levels and the confirmed upward walk. "
                "stair-connections.csv gives each direction’s stair and hallway status. native-stair-caps.csv lists the native floor geometry at each end. "
                "A nearby slab or an on-site observation alone does not establish a routable landing.\n")
if 'atlas-generator.zip' in extra_files:
    replica=read(here/'source-replay.json')
    assert replica['exactCleanReplay'] and replica['archiveSha256']==digest(here/'atlas-generator.zip')
    assert replica['expectedAtlasSha256']==digest(here/'campus-network.html')
    with (here/'README.md').open('a') as f:
        f.write("\nExtract `atlas-generator.zip` to rebuild the map from the matching routing export. Its README lists the two required inputs and the rebuild command. `source-replay.json` records a successful byte-for-byte rebuild from the archived source.\n")
if 'screenshot-panel-checks.json' in extra_files:
    screens=read(here/'screenshot-panel-checks.json')['newScreens']
    with (here/'README.md').open('a') as f:
        f.write("\n## Mapped locations\n\n")
        for screen in screens:
            f.write(f"- [Open {screen['id']}](campus-network.html#{screen['id']}). {screen['note']}\n")
        f.write("\nThe paired images in `focus-images` and the sheet `screenshot-locations.png` use equal map extents in each comparison. They compare the preceding distributed atlas with this one.\n")

files.extend(f'floor-images/{l}.png' for l in m['levels'])
archive=here/'UNBC-campus-walking-atlas.zip';temp=archive.with_suffix('.tmp')
with zipfile.ZipFile(temp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in files:z.write(here/name,name)
with zipfile.ZipFile(temp) as z:
    assert z.testzip() is None and z.namelist()==files
    for name in files:
        with z.open(name) as file:assert hashlib.file_digest(file,'sha256').hexdigest()==digest(here/name)
temp.replace(archive)
print(archive,archive.stat().st_size,'bytes',digest(archive),'SHA-256')
