"""Vendored from agents/audit-ends/common.py (Oct 31, 2026) for verify.py.

Only the pieces verify.py needs; no hardcoded scratch paths.  Inputs are passed
explicitly by the caller."""
import json, math


def load_graph(graph_full_path, prepared_routing_path):
    g = json.load(open(graph_full_path))
    guides = {x['edgeId']: x for x in json.load(open(prepared_routing_path))['guides']}
    return g, guides


def map_net_edges(fl, g, guides):
    """net edgeIndex -> graph edge id, by replaying build-complete-network.py's order."""
    nodes = {n['id']: n for n in g['nodes']}
    lids = set()
    for a, b in fl['netNodes']:
        for x in (a, b):
            if x in nodes:
                lids.add(nodes[x].get('levelId'))
    seq = []
    for e in g['edges']:
        if e['kind'] != 'walk' or not e['enabled']:
            continue
        if nodes.get(e['from'], {}).get('levelId') not in lids and nodes.get(e['to'], {}).get('levelId') not in lids:
            continue
        pts = (guides.get(e['id']) or {}).get('pointsFeet') or e.get('pointsFeet') or []
        if len(pts) < 2:
            continue
        seq.append(e)
    nn = fl['netNodes']
    assert len(seq) == len(nn), (len(seq), len(nn))
    for e, (a, b) in zip(seq, nn):
        assert e['from'] == a and e['to'] == b
    return [e['id'] for e in seq], lids


def fit_similarity(fl, g, edge_ids):
    """Fit feet->dm similarity from non-guide net lines (cat 1/3): all points equal pointsFeet."""
    E = {e['id']: e for e in g['edges']}
    P = []
    for line, cat, idx in fl['net']:
        if cat not in (1, 3):
            continue
        pts = E[edge_ids[idx]]['pointsFeet']
        if len(pts) * 2 != len(line):
            continue
        for k, p in enumerate(pts):
            P.append((p[0], p[1], line[2 * k], line[2 * k + 1]))
    n = len(P)
    sx = sum(p[0] for p in P) / n; sy = sum(p[1] for p in P) / n
    se = sum(p[2] for p in P) / n; sn = sum(p[3] for p in P) / n
    na = nb = den = 0.0
    for x, y, e, q in P:
        x, y, e, q = x - sx, y - sy, e - se, q - sn
        na += x * e + y * q; nb += x * q - y * e; den += x * x + y * y
    a, b = na / den, nb / den
    c, d = se - a * sx + b * sy, sn - b * sx - a * sy
    T = lambda p: (a * p[0] - b * p[1] + c, b * p[0] + a * p[1] + d)
    res = max(math.hypot(T((x, y))[0] - e, T((x, y))[1] - q) for x, y, e, q in P)
    return T, {'a': a, 'b': b, 'c': c, 'd': d, 'pairs': n, 'maxResidualDm': res, 'dmPerFoot': math.hypot(a, b)}
