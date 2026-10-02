#!/usr/bin/env python3
"""Check derived cutaways against the independently verified source floor plans."""
import json
from pathlib import Path
from shapely import make_valid
from shapely.geometry import Polygon, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1] / 'app/data/bc-hospital'
read = lambda name: json.loads((ROOT / name).read_text())
raw = read('indoor-map.geojson')['features']
context = read('floor-context.geojson')['features']
originals = {f['id']: f for f in raw}
stacks = read('floor-stacks.json')
assert len(stacks) == 8
assert len({f['id'] for f in context}) == len(context)
expected = {}
for stack in stacks:
    for target in stack['floors']:
        selected = [f for f in raw if f['properties'].get('source_map_id') == target['id']]
        aperture = unary_union([Polygon(ring) for f in selected if f['properties']['feature_type'] == 'corridor'
                               for ring in f['geometry']['coordinates'][1:]])
        for lower in sorted(stack['floors'], key=lambda f: -f['level']):
            if lower['level'] >= target['level'] or aperture.is_empty:
                continue
            below = [f for f in raw if f['properties'].get('source_map_id') == lower['id']]
            for source in below:
                if source['properties']['feature_type'] not in {'unit', 'wall', 'corridor', 'vertical_connection'}:
                    continue
                clipped = make_valid(shape(source['geometry'])).intersection(aperture)
                if clipped.area > 1e-16:
                    expected[(target['level'], source['id'])] = clipped
            floor_slabs = [make_valid(shape(f['geometry'])) for f in below if f['properties']['feature_type'] == 'corridor']
            aperture = aperture.difference(unary_union(floor_slabs))

actual = {}
for feature in context:
    p = feature['properties']
    original = originals[p['source_unit_id']]
    assert p['view_context'] is True
    assert p['level_id'] < p['context_for_level_id']
    assert p['context_depth'] == p['context_for_level_id'] - p['level_id']
    for key in ('building_id', 'source_map_id', 'fill', 'extrusion_height', 'fill-opacity'):
        assert p.get(key) == original['properties'].get(key)
    key = (p['context_for_level_id'], p['source_unit_id'])
    actual.setdefault(key, []).append(shape(feature['geometry']))
assert actual.keys() == expected.keys()
for key, pieces in actual.items():
    assert unary_union(pieces).symmetric_difference(expected[key]).area < 1e-16, key
tac_l2 = [f for f in context if f['properties']['building_id'] == 'tac'
          and f['properties']['context_for_level_id'] == 1 and f['properties']['feature_type'] == 'unit']
assert len({f['properties']['source_unit_id'] for f in tac_l2}) == 50
assert all(f['properties']['level_id'] == 0 for f in tac_l2)
print(f'PASS: {len(context)} clipped polygons match the nearest lower source floors within the actual openings; 50 Teck Level 1 rooms below Level 2.')
