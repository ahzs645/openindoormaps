"""Add `sourceWallCrossings` to each floor: ORIGINAL drawn walks (`net`: accepted
shared guides and original saved walks) whose own geometry overlaps a native wall
footprint away from that wall's own doors, or a cell hole (hardgeom rule).
These are source defects; the schematic keeps them unmodified.

entry: [netIndex, graphEdgeId, category, [[kind, nativeWallId | cellId, overlapDm,
        [x, y] of the longest overlap, cells just before/after it], ...]]
usage: list-source-crossings.py DIR   (rewrites DIR/floors/*.json in place)"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hardgeom import HardConstraints, pts  # noqa: E402
root = sys.argv[1]
summary = {}
for fid in ['campus-floor-1', 'floor-2', 'campus-floor-3', 'floor-4']:
    path = os.path.join(root, 'floors', fid + '.json')
    fl = json.load(open(path))
    H = HardConstraints(fl)
    rows = []
    for li, (l, cat, ei) in enumerate(fl['net']):
        P = [(float(x), float(y)) for x, y in pts(l)]
        hits = H.line(P)
        if not hits:
            continue
        by = {}
        for s, kind, idx, nid, a, b, ln in hits:
            p, q = P[s], P[s + 1]
            key = (kind, str(nid))
            c = by.setdefault(key, [kind, nid, 0.0, None, [], 0.0])
            c[2] += ln
            if ln > c[5]:
                tm = (a + b) / 2; L = math.dist(p, q); e = min(5.0, 0.25 * L) / L
                at = lambda t: (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
                c[3] = [round(at(tm)[0], 1), round(at(tm)[1], 1)]
                c[4] = sorted(set(H.cells_at(*at(max(0.0, a - e))) + H.cells_at(*at(min(1.0, b + e)))))
                c[5] = ln
        contacts = sorted(([k, n, round(o, 2), at_, cells] for k, n, o, at_, cells, _ in by.values()), key=lambda c: -c[2])
        rows.append([li, fl['netEdgeIds'][ei], cat, contacts])
    fl['sourceWallCrossings'] = rows
    json.dump(fl, open(path, 'w'), separators=(',', ':'))
    summary[fid] = {'lines': len(rows), 'acceptedGuideLines': sum(r[2] in (0, 2) for r in rows),
                    'savedWalkLines': sum(r[2] in (1, 3) for r in rows),
                    'wallLines': sum(any(c[0] == 'wall' for c in r[3]) for r in rows),
                    'holeLines': sum(any(c[0] == 'hole' for c in r[3]) for r in rows)}
    print(fid, summary[fid], flush=True)
json.dump(summary, open(os.path.join(root, 'source-wall-crossings.json'), 'w'), indent=1)
