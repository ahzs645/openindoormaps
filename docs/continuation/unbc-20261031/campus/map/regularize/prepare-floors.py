"""Prepare artifact8 input floors: the accepted/original drawing of artifact4
plus native identities needed by the hard wall/hole rule.

Adds to each floor (nothing existing is changed):
  wallIds    native wall element id for every `walls` polygon (exact match of the
             transformed native ring, by build-native-floors.py's order)
  doorHosts  host wall native element id for every `doors` footprint
  crossings  enabled door/opening crossings (copied from the committed map,
             produced by add-crossings.py from graph-full.json)
  netEdgeIds graph edge id for every `net` line (build-complete-network.py order)
usage: prepare-floors.py ARTIFACT4 ARTIFACT6 PREVIEW WALLS_NATIVE DOORS_NATIVE GRAPH GUIDES OUT"""
import json, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fit import load_fit, STOREYS, floor_levels
a4, a6, preview, wpath, dpath, gpath, guides_path, out = sys.argv[1:9]
line, levels, _ = load_fit(preview)
W = json.load(open(wpath)); D = json.load(open(dpath))
assert W['fields'][:4] == ['levelId', 'nativeElementId', 'id', 'ringsFeet']
assert D['fields'] == ['levelId', 'nativeElementId', 'hostWallNativeElementId', 'footprintFeet', 'state']
walls_by = defaultdict(list)
for lid, nid, wid, rings in W['rows']:
    walls_by[lid].append((nid, rings))
door_by = {}
for lid, nid, host, fp, st in D['rows']:
    if fp:
        door_by[(lid, nid)] = (host, line(fp))
g = json.load(open(gpath))
guides = {x['edgeId'] for x in json.load(open(guides_path))['guides']}
guides_pts = {x['edgeId']: x['pointsFeet'] for x in json.load(open(guides_path))['guides']}
node_level = {n['id']: n.get('levelId') for n in g['nodes']}
os.makedirs(os.path.join(out, 'floors'), exist_ok=True)
summary = {}
for fid, storey in STOREYS.items():
    fl = json.load(open(os.path.join(a4, 'floors', fid + '.json')))
    f6 = json.load(open(os.path.join(a6, 'floors', fid + '.json')))
    lids = floor_levels(levels, storey)
    ids, flat = [], []
    for lid in lids:
        for nid, rings in walls_by.get(int(lid), []):
            for rg in rings or []:
                if len(rg) >= 3:
                    ids.append(nid); flat.append(line(rg))
    assert flat == fl['walls'], fid + ': wall polygons do not match native walls'
    hosts = []
    for d in fl['doors']:
        m = [door_by[(int(l), d[1])] for l in lids if (int(l), d[1]) in door_by]
        m = [h for h, fp in m if fp == d[0]]
        assert len(m) == 1, (fid, d[1], len(m))
        hosts.append(m[0])
    # net edge ids, same order as build-complete-network.py
    seq = []
    for e in g['edges']:
        if e['kind'] != 'walk' or not e['enabled']:
            continue
        if node_level.get(e['from']) not in set(map(int, lids)) | set(lids) and node_level.get(e['to']) not in set(map(int, lids)) | set(lids):
            continue
        pts = guides_pts.get(e['id']) or e.get('pointsFeet') or []
        if len(pts) < 2:
            continue
        seq.append(e)
    assert len(seq) == len(fl['netNodes']) and all(e['from'] == a and e['to'] == b for e, (a, b) in zip(seq, fl['netNodes'])), fid
    for (l, cat, ei), e in zip(fl['net'], [seq[x[2]] for x in fl['net']]):
        assert (cat & 1) == (0 if e['id'] in guides else 1)
    fl['wallIds'] = ids
    fl['doorHosts'] = hosts
    fl['crossings'] = f6['crossings']
    fl['netEdgeIds'] = [e['id'] for e in seq]
    json.dump(fl, open(os.path.join(out, 'floors', fid + '.json'), 'w'), separators=(',', ':'))
    summary[fid] = {'walls': len(ids), 'doors': len(hosts), 'doorsWithHost': sum(h is not None for h in hosts), 'net': len(fl['net']), 'crossings': len(fl['crossings'])}
    print(fid, summary[fid])
