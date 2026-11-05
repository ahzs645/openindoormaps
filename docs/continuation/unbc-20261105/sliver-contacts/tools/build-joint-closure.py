"""Compact per-joint result: smallest wall contact-noding tolerance that blocks
each leaking walk locally (walk-closure.ts) plus the material sources of the
contact (contacts.py). usage: build-joint-closure.py WC-0388 WC-RESIDUAL CONTACTS GAP-PATCHES OUT"""
import json, sys
wc0, wcr, contacts, gp, out = sys.argv[1:6]
g = json.load(open(gp)); gaps = {x['gapId']: x for x in g['gaps']}
cont = {c['id']: c for c in json.load(open(contacts))}
def band(j):
    ws = [w for w in j['walksTested'] if w['reproduced']]
    if not ws: return None, 'walk not reproduced by the local material'
    t = [w['closingToleranceFeet'] for w in ws if w.get('closingToleranceFeet') is not None]
    if not t: return None, 'open above 0.1 ft (real opening, facade envelope, column or passage)'
    m = min(t)
    srcs = {s for c in cont.get(j['id'], {}).get('contacts', []) for s in (c['vertexSource'], c['edgeSource'])}
    if m <= 1e-7: return m, ('floating-point residue between RVT-derived sections' if srcs <= {'rvt-section'}
                             else 'sub-1e-7 contact beside a float32 mesh-cut supplement section')
    if m <= 1e-4 and 'mesh-supplement' in srcs: return m, 'float32 mesh-cut supplement section against an RVT section'
    return m, 'measured gap between RVT-derived sections'
rows = []
for name, path in (('inventory-2026-11-03', wc0), ('regeneration-residual-2026-11-05', wcr)):
    for j in json.load(open(path)):
        m, cause = band(j); x = gaps.get(j['id'], {}) if name.startswith('inventory') else {}
        rows.append({'set': name, 'id': j['id'], 'levelId': j['levelId'], 'floor': x.get('floor'), 'class': j.get('class'),
                     'patchId': j.get('patchId'), 'rooms': x.get('rooms') or j.get('walkRooms'), 'pointFeet': j['pointFeet'],
                     'closingToleranceFeet': m, 'closedBy1e7Rule': m is not None and m <= 1e-7, 'cause': cause,
                     'walks': [{k: w.get(k) for k in ('walk', 'reproduced', 'closingToleranceFeet', 'nodedOwners')} for w in j['walksTested']]})
json.dump({'format': 'unbc-sliver-contact-joint-closure-v1', 'method': 'walk-closure.ts: exact local free region (walls, columns, derived parts, patch walls) within 3 ft of the squeeze point; contact noding at 1e-12, 1e-9, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.02, 0.1 ft; the first tolerance at which the saved walk leaves the free region', 'rows': rows}, open(out, 'w'), indent=1)
print(len(rows))
