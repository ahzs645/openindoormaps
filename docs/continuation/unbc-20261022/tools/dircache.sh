set -e
cd /content/unbc
mkdir -p dircache && cd dircache
rm -rf /content/unbc/dircache/prep /content/unbc/dircache/prof; unzip -o -q /content/unbc/run/output/UNBC.campus-viewer.zip viewer/indoor.json -d .
SHA=$(sha256sum viewer/indoor.json | cut -c1-64); echo "visitor json $SHA"
python3 - "$SHA" <<'PY'
import json
d=json.load(open('viewer/indoor.json')); keys={r['key'] for r in d['records']}
cases=json.load(open('/content/unbc/openindoormaps/docs/continuation/unbc-20261018/directions-and-threshold-blockers/cases.json'))
kept=[c for c in cases if c['from'] in keys and c['to'] in keys]
for mode in ('public','accessible'):
    for transit in (False,True):
        kept.append({"id":"link-4-8-floor2-"+mode+("-transit" if transit else ""),"from":"rm-694-072a835d76b9","to":"rm-694-0179b206bb5d","mode":mode,"options":{"allowOtherRoomTransit":transit,"endpointMode":"hallway"}})
kept.append({"id":"link-08-216-to-08-260","from":"rm-694-3eff6106de76","to":"rm-694-fa60cb06b7c9","mode":"public","options":{"allowOtherRoomTransit":False,"endpointMode":"hallway"}})
json.dump(kept,open('cases.json','w'),indent=1); print('cases',len(cases),'kept',len(kept)-2,'+2 link')
PY
cd /content/unbc/openindoormaps
node --max-old-space-size=16384 --cpu-prof --cpu-prof-dir=/content/unbc/dircache/prof --import tsx scripts/indoor/prepare-directions-candidate.ts /content/unbc/dircache/viewer/indoor.json $SHA /content/unbc/dircache/cases.json /content/unbc/dircache/prep 2>&1 | tail -60
echo DIRCACHE_DONE
