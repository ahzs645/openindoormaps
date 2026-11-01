"""Independent checks of artifact5 against artifact4 (read-only).

1. index.html and index.json byte-identical; every floor key except `net` identical.
2. net: same length, same category and edge index per entry, netNodes identical,
   every line keeps its first/last point (graph node position), >= 2 integer points.
3. Node adjacency from netNodes identical; node -> drawn position map identical.
4. Node positions vs graph-full.json (feet, similarity-fitted from category 1/3 lines).
5. Validity with exact polygon tests (ray casting, not the raster used by the
   regularizer): every sample (1 dm) of every changed line must be inside a native
   cell (outer ring minus holes) and outside wall footprints, or within 3 dm of
   that line's own original geometry.
"""
import filecmp, json, math, os, sys
from collections import defaultdict
import numpy as np

W = '/home/user/unbc-work'
A, B = os.path.join(W, 'artifact4'), os.path.join(W, 'artifact5')
FLOORS = ['campus-floor-1', 'floor-2', 'campus-floor-3', 'floor-4']
sys.path.insert(0, os.path.join(W, 'agents/audit-ends'))
from common import load_graph, map_net_edges, fit_similarity  # noqa: E402


def pts(f):
    return [(f[i], f[i + 1]) for i in range(0, len(f), 2)]


def pip(X, Y, ring):
    R = np.array(pts(ring), float)
    x1, y1 = R[:, 0], R[:, 1]
    x2, y2 = np.roll(x1, -1), np.roll(y1, -1)
    ins = np.zeros(len(X), bool)
    for a, b, c, d in zip(x1, y1, x2, y2):
        if b == d:
            continue
        cond = (b > Y) != (d > Y)
        xi = a + (Y - b) * (c - a) / (d - b)
        ins ^= cond & (X < xi)
    return ins


class Polys:
    def __init__(self, items):
        self.items = []
        for rings in items:
            if not rings:
                continue
            r0 = np.array(pts(rings[0]), float)
            self.items.append((r0[:, 0].min(), r0[:, 1].min(), r0[:, 0].max(), r0[:, 1].max(), rings))

    def contains(self, X, Y):
        out = np.zeros(len(X), bool)
        for x0, y0, x1, y1, rings in self.items:
            m = (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1) & ~out
            if not m.any():
                continue
            idx = np.where(m)[0]
            ins = pip(X[idx], Y[idx], rings[0])
            for h in rings[1:]:
                ins &= ~pip(X[idx], Y[idx], h)
            out[idx[ins]] = True
        return out


def samples(P):
    X, Y = [], []
    for a, b in zip(P, P[1:]):
        n = max(1, int(math.ceil(math.dist(a, b))))
        t = np.linspace(0, 1, n + 1)
        X.append(a[0] + (b[0] - a[0]) * t); Y.append(a[1] + (b[1] - a[1]) * t)
    return np.concatenate(X), np.concatenate(Y)


def dist_to(X, Y, R):
    R = np.asarray(R, float)
    A_, B_ = R[:-1], R[1:]
    D = B_ - A_; L2 = (D ** 2).sum(1); L2[L2 == 0] = 1
    px = X[:, None] - A_[None, :, 0]; py = Y[:, None] - A_[None, :, 1]
    t = np.clip((px * D[None, :, 0] + py * D[None, :, 1]) / L2[None, :], 0, 1)
    return np.sqrt((px - t * D[None, :, 0]) ** 2 + (py - t * D[None, :, 1]) ** 2).min(1)


res = {'indexHtmlIdentical': filecmp.cmp(os.path.join(A, 'index.html'), os.path.join(B, 'index.html'), shallow=False),
       'indexJsonIdentical': filecmp.cmp(os.path.join(A, 'floors/index.json'), os.path.join(B, 'floors/index.json'), shallow=False)}
g, guides = load_graph()
gnode = {n['id']: n for n in g['nodes']}
allok = res['indexHtmlIdentical'] and res['indexJsonIdentical']
for fid in FLOORS:
    a = json.load(open(os.path.join(A, 'floors', fid + '.json')))
    b = json.load(open(os.path.join(B, 'floors', fid + '.json')))
    r = {}
    r['otherKeysIdentical'] = sorted(a) == sorted(b) and all(a[k] == b[k] for k in a if k != 'net')
    r['netNodesIdentical'] = a['netNodes'] == b['netNodes']
    r['netCount'] = [len(a['net']), len(b['net'])]
    r['catAndIndexIdentical'] = all(x[1:] == y[1:] for x, y in zip(a['net'], b['net']))
    ends_ok = ints = short = 0
    for x, y in zip(a['net'], b['net']):
        P, Q = pts(x[0]), pts(y[0])
        ends_ok += P[0] == Q[0] and P[-1] == Q[-1]
        ints += all(isinstance(v, int) for v in y[0])
        short += len(Q) < 2
    r['linesKeepingBothEndpoints'] = ends_ok
    r['integerLines'] = ints
    r['linesUnder2Points'] = short
    # node adjacency and node positions
    def nodemap(fl):
        pos = defaultdict(set); adj = defaultdict(set)
        for (l, c, ei) in fl['net']:
            u, v = fl['netNodes'][ei]; P = pts(l)
            pos[u].add(P[0]); pos[v].add(P[-1]); adj[u].add(v); adj[v].add(u)
        return pos, adj
    pa, aa = nodemap(a); pb, ab = nodemap(b)
    r['nodeAdjacencyIdentical'] = aa == ab
    r['nodes'] = len(pa)
    r['nodePositionsIdentical'] = pa == pb
    r['nodesWithOneDrawnPosition'] = sum(1 for v in pb.values() if len(v) == 1)
    # graph-full node positions
    edge_ids, lids = map_net_edges(a, g, guides)
    T, fit = fit_similarity(a, g, edge_ids)
    dmax = 0.0; worst = None
    for nid, ps in pb.items():
        n = gnode.get(nid)
        if not n or not n.get('pointFeet'):
            continue
        q = T(n['pointFeet'])
        for p in ps:
            d = math.dist(p, q)
            if d > dmax:
                dmax, worst = d, nid
    r['graphFullFit'] = {'pairs': fit['pairs'], 'maxResidualDm': round(fit['maxResidualDm'], 2)}
    r['maxNodeOffsetFromGraphFullDm'] = round(dmax, 2)
    r['worstNode'] = worst
    # validity
    cells = Polys([rings for _, _, rings in a['cells']])
    walls = Polys([[w] for w in a['walls']])
    changed = viol = 0; samp = outside_ok = 0; worst_v = []
    for x, y in zip(a['net'], b['net']):
        if x[0] == y[0]:
            continue
        changed += 1
        P, Q = pts(x[0]), pts(y[0])
        X, Y = samples(Q)
        samp += len(X)
        inside = cells.contains(X, Y) & ~walls.contains(X, Y)
        if inside.all():
            continue
        d = dist_to(X[~inside], Y[~inside], P)
        outside_ok += int((d <= 3.0 + 1e-6).sum())
        if (d > 3.0 + 1e-6).any():
            viol += 1
            worst_v.append((round(float(d.max()), 2), x[2], a['netNodes'][x[2]]))
    r['changedLines'] = changed
    r['samplesChecked'] = samp
    r['samplesOutsideCellsButWithin3dmOfOriginal'] = outside_ok
    r['linesViolatingValidity'] = viol
    r['violations'] = sorted(worst_v, reverse=True)[:10]
    ok = (r['otherKeysIdentical'] and r['netNodesIdentical'] and r['catAndIndexIdentical'] and
          ends_ok == len(a['net']) and ints == len(b['net']) and short == 0 and r['nodeAdjacencyIdentical'] and
          r['nodePositionsIdentical'] and viol == 0 and r['netCount'][0] == r['netCount'][1])
    r['PASS'] = ok
    allok &= ok
    res[fid] = r
    print(fid, json.dumps(r))
res['ALL_PASS'] = allok
print('ALL_PASS', allok)
json.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify.json'), 'w'), indent=1)
