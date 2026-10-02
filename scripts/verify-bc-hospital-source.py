#!/usr/bin/env python3
"""Compare the hospital fixture independently with the user's captured MVF zip."""
import hashlib
import json
import pathlib
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
z = zipfile.ZipFile(sys.argv[1])
read = lambda name: json.loads(z.read(name))
features = json.loads((root / 'app/data/bc-hospital/indoor-map.geojson').read_text())['features']
by_space = {f['properties']['space_id']: f for f in features}
layers = {r['spaceId']: l['name'] for l in read('enterprise/layers.json') for r in l['spaces']}
styles = {s: style for style in read('styles.json').values() for s in style['polygons']}
checked = holes = 0
for name in z.namelist():
    if not name.startswith('space/') or not name.endswith('.geojson'):
        continue
    for source in read(name)['features']:
        sid = source['properties']['id']
        if source['geometry']['type'] != 'Polygon' or layers.get(sid) == 'Void':
            continue
        actual = by_space[sid]
        a, b = source['geometry']['coordinates'], actual['geometry']['coordinates']
        assert len(a) == len(b), sid
        for ra, rb in zip(a, b):
            assert len(ra) == len(rb), sid
            assert all(abs(x-y) <= 5.01e-10 for ca, cb in zip(ra, rb) for x,y in zip(ca[:2],cb)), sid
        holes += len(a)-1
        style = styles.get(sid)
        if style:
            assert actual['properties']['fill'] == style['color'], sid
            assert actual['properties']['extrusion_height'] == style.get('height', 0), sid
            assert actual['properties']['fill-opacity'] == style.get('opacity', 1), sid
        checked += 1
assert checked == len(features)
nodes = {f['properties']['id']: f for f in read('node.geojson')['features']}
routes = json.loads((root / 'app/data/bc-hospital/indoor-routes.geojson').read_text())['features']
expected = {(nid, n['id']): n['weight'] for nid,f in nodes.items() for n in f['properties']['neighbors'] if n['id'] in nodes}
actual = {tuple(f['properties']['source_node_ids']): f['properties']['source_path_weight'] for f in routes if f['geometry']['type'] == 'LineString'}
assert expected == actual, 'Directed graph must exactly match source neighbors/weights'
print(f'PASS: {checked} source polygons, {holes} holes, {len(actual)} directed source edges; colours, heights, opacity unchanged.')
print('Source zip SHA256:', hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
