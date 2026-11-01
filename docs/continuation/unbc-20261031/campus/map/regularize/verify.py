"""Independent verifier for the schematic (display-only) drawing.

Self-contained: needs only Python 3 (standard library) and this folder.  It does
NOT import regularize.py or hardgeom.py; its geometry is a separate pure-Python
implementation (winding-number containment, numeric convex search for door
zones) so that a defect in one implementation is unlikely to hide in both.

usage:
  python3 verify.py FLOORS_ROOT [--original ORIGINAL_ROOT]
                    [--graph-full graph-full.json --guides prepared-routing.json]
                    [--output verify.json]

FLOORS_ROOT/floors/*.json carry the accepted drawing in `net` and the schematic
in `schematic` (0 = same as net).  ORIGINAL_ROOT (optional) is the artifact the
regularizer read; its `net` must equal FLOORS_ROOT's `net` byte for byte.

Checks per floor
 1. structure: `schematic` parallel to `net`; every changed line keeps both end
    points, has >= 2 integer points; net/netNodes untouched (vs ORIGINAL_ROOT).
 2. HARD rule (the same rule the regularizer enforces, no allowance): no changed
    schematic line has positive-length overlap (> 1e-6 dm) with
      - a native wall footprint, except inside a door footprint whose
        host wall (doorHosts) is that native wall (wallIds), or
      - a native cell hole not covered by another cell, except inside
        a door footprint.
 3. source defects: every net line whose ORIGINAL geometry overlaps a wall/hole
    must be unchanged in the schematic, and must be listed in
    `sourceWallCrossings` (if the floor carries that list), and vice versa.
 4. SOFT rule (outside walls/holes only): 1 dm samples of a changed line that are
    outside every native cell lie within 0.3 m of that line's own original.
 5. optional: drawn node positions vs graph-full.json (needs --graph-full/--guides).
Exit status 0 only if every floor passes.
"""
import argparse, hashlib, json, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
FLOORS = ['campus-floor-1', 'floor-2', 'campus-floor-3', 'floor-4']
MARGIN = 0.0       # dm: door zone is the door footprint itself
EPS = 1e-6         # dm, overlap below this is floating-point noise
SOFT_TOL = 3.0     # dm, soft rule only (never inside a wall or hole)


def pts(f):
    return [(float(f[i]), float(f[i + 1])) for i in range(0, len(f), 2)]


def bbox(R):
    xs = [p[0] for p in R]; ys = [p[1] for p in R]
    return (min(xs), min(ys), max(xs), max(ys))


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def winding(p, R):
    """Winding number of ring R around p (0 = outside).  p is assumed off the boundary."""
    w = 0; x, y = p; n = len(R)
    for i in range(n):
        (x1, y1), (x2, y2) = R[i], R[(i + 1) % n]
        if y1 <= y:
            if y2 > y and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) > 0:
                w += 1
        elif y2 <= y and (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1) < 0:
            w -= 1
    return w


def on_boundary(p, R, tol=1e-7):
    n = len(R)
    return any(seg_dist(p, R[i], R[(i + 1) % n]) <= tol for i in range(n))


def strictly_inside(p, R):
    return not on_boundary(p, R) and winding(p, R) != 0


def inside_intervals(p, q, R):
    """t-intervals of p->q strictly inside ring R."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return []
    cuts = {0.0, 1.0}
    n = len(R)
    for i in range(n):
        a, b = R[i], R[(i + 1) % n]
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = dx * ey - dy * ex
        wx, wy = a[0] - p[0], a[1] - p[1]
        if den != 0:
            t = (wx * ey - wy * ex) / den; u = (wx * dy - wy * dx) / den
            if 0 < t < 1 and -1e-12 <= u <= 1 + 1e-12:
                cuts.add(t)
        else:
            for c in (a, b):
                t = ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / L2
                if 0 < t < 1 and abs((c[0] - p[0]) * dy - (c[1] - p[1]) * dx) <= 1e-9 * math.sqrt(L2):
                    cuts.add(t)
    cuts = sorted(cuts); out = []
    for a, b in zip(cuts, cuts[1:]):
        if b - a <= 1e-12:
            continue
        m = (a + b) / 2
        if strictly_inside((p[0] + dx * m, p[1] + dy * m), R):
            if out and abs(out[-1][1] - a) <= 1e-15:
                out[-1] = (out[-1][0], b)
            else:
                out.append((a, b))
    return out


def poly_dist(x, R):
    if strictly_inside(x, R) or on_boundary(x, R):
        return 0.0
    n = len(R)
    return min(seg_dist(x, R[i], R[(i + 1) % n]) for i in range(n))


def zone_interval(p, q, D, r):
    """{t in [0,1] : dist(p+t(q-p), polygon D) <= r} for a CONVEX door footprint D.
    dist to a convex polygon is convex along a line, so the set is an interval:
    golden-section search for the minimum, then bisection for both ends."""
    f = lambda t: poly_dist((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t), D)
    lo, hi = 0.0, 1.0; g = (math.sqrt(5) - 1) / 2
    c, d = hi - g * (hi - lo), lo + g * (hi - lo)
    fc, fd = f(c), f(d)
    for _ in range(80):
        if fc < fd:
            hi, d, fd = d, c, fc; c = hi - g * (hi - lo); fc = f(c)
        else:
            lo, c, fc = c, d, fd; d = lo + g * (hi - lo); fd = f(d)
    tm = (lo + hi) / 2
    cands = [(f(tm), tm), (f(0.0), 0.0), (f(1.0), 1.0)]
    fm, tm = min(cands)
    if fm > r:
        return None

    def edge(a, b):   # f(a) <= r < f(b) -> boundary between
        for _ in range(80):
            m = (a + b) / 2
            if f(m) <= r:
                a = m
            else:
                b = m
        return a
    t0 = 0.0 if f(0.0) <= r else edge(tm, 0.0)
    t1 = 1.0 if f(1.0) <= r else edge(tm, 1.0)
    return (min(t0, t1), max(t0, t1))


def convex(D):
    n = len(D); s = 0
    for i in range(n):
        a, b, c = D[i], D[(i + 1) % n], D[(i + 2) % n]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if cr != 0:
            if s and (cr > 0) != (s > 0):
                return False
            s = cr
    return True


def subtract(iv, cut):
    for c, d in sorted(cut):
        nxt = []
        for a, b in iv:
            if d <= a or c >= b:
                nxt.append((a, b)); continue
            if c > a:
                nxt.append((a, c))
            if d < b:
                nxt.append((d, b))
        iv = nxt
    return iv


class Floor:
    def __init__(self, fl):
        self.walls = []
        ids = fl.get('wallIds')
        for k, w in enumerate(fl['walls']):
            R = pts(w)
            if len(R) >= 3:
                self.walls.append((ids[k] if ids else ('wall#%d' % k), R, bbox(R)))
        self.cells = []
        self.holes = []
        for cid, _o, rings in fl['cells']:
            Rs = [pts(r) for r in rings if len(r) >= 6]
            if not Rs:
                continue
            self.cells.append((cid, Rs, bbox(Rs[0])))
            for H in Rs[1:]:
                self.holes.append((cid, H, bbox(H)))
        hosts = fl.get('doorHosts') or [None] * len(fl['doors'])
        self.doors = []
        for (d, nid, _st), h in zip(fl['doors'], hosts):
            D = pts(d)
            assert convex(D), 'non-convex door footprint %s' % nid
            self.doors.append((nid, h, D, bbox(D)))
        self.by_host = defaultdict(list)
        for dd in self.doors:
            if dd[1] is not None:
                self.by_host[dd[1]].append(dd)
        self.G = 50.0
        self.wg = self._grid([w[2] for w in self.walls]); self.hg = self._grid([h[2] for h in self.holes])
        self.cg = self._grid([c[2] for c in self.cells]); self.dg = self._grid([d[3] for d in self.doors], MARGIN)

    def _grid(self, boxes, pad=0.0):
        g = defaultdict(list)
        for i, b in enumerate(boxes):
            for gx in range(int((b[0] - pad) // self.G), int((b[2] + pad) // self.G) + 1):
                for gy in range(int((b[1] - pad) // self.G), int((b[3] + pad) // self.G) + 1):
                    g[(gx, gy)].append(i)
        return g

    def _q(self, g, b):
        s = set()
        for gx in range(int(b[0] // self.G), int(b[2] // self.G) + 1):
            for gy in range(int(b[1] // self.G), int(b[3] // self.G) + 1):
                s.update(g.get((gx, gy), ()))
        return s

    @staticmethod
    def _hit(b, sb, pad=0.0):
        return not (b[2] + pad < sb[0] or b[0] - pad > sb[2] or b[3] + pad < sb[1] or b[1] - pad > sb[3])

    def zones(self, p, q, doors, sb):
        out = []
        for _nid, _h, D, db in doors:
            if self._hit(db, sb, MARGIN):
                z = zone_interval(p, q, D, MARGIN)
                if z:
                    out.append(z)
        return out

    def contacts(self, P):
        """[(kind, id, overlapDm, segment index)] of polyline P."""
        out = []
        for s, (p, q) in enumerate(zip(P, P[1:])):
            L = math.dist(p, q)
            if L == 0:
                continue
            sb = (min(p[0], q[0]), min(p[1], q[1]), max(p[0], q[0]), max(p[1], q[1]))
            for i in self._q(self.wg, sb):
                nid, R, b = self.walls[i]
                if not self._hit(b, sb):
                    continue
                iv = inside_intervals(p, q, R)
                if iv:
                    iv = subtract(iv, self.zones(p, q, self.by_host.get(nid, ()), sb))
                ln = sum(b2 - a for a, b2 in iv) * L
                if ln > EPS:
                    out.append(('wall', nid, ln, s))
            for i in self._q(self.hg, sb):
                cid, H, b = self.holes[i]
                if not self._hit(b, sb):
                    continue
                iv = inside_intervals(p, q, H)
                if iv:
                    cover = []
                    for j in self._q(self.cg, sb):
                        ccid, Rs, cb = self.cells[j]
                        if not self._hit(cb, sb):
                            continue
                        civ = inside_intervals(p, q, Rs[0])
                        for HH in Rs[1:]:
                            if civ:
                                civ = subtract(civ, inside_intervals(p, q, HH))
                        cover += civ
                    iv = subtract(iv, cover)
                if iv:
                    iv = subtract(iv, self.zones(p, q, [self.doors[j] for j in self._q(self.dg, sb)], sb))
                ln = sum(b2 - a for a, b2 in iv) * L
                if ln > EPS:
                    out.append(('hole', cid, ln, s))
        return out

    def in_cells(self, x):
        for j in self._q(self.cg, (x[0], x[1], x[0], x[1])):
            cid, Rs, b = self.cells[j]
            if b[0] <= x[0] <= b[2] and b[1] <= x[1] <= b[3] and winding(x, Rs[0]) != 0 and not any(winding(x, H) != 0 for H in Rs[1:]):
                return True
        return False


def samples(P):
    for a, b in zip(P, P[1:]):
        n = max(1, int(math.ceil(math.dist(a, b))))
        for k in range(n + 1):
            t = k / n
            yield (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('root'); ap.add_argument('--original'); ap.add_argument('--graph-full'); ap.add_argument('--guides')
    ap.add_argument('--output'); ap.add_argument('--floors', default=','.join(FLOORS))
    a = ap.parse_args()
    res = {'verifier': 'verify.py', 'verifierSha256': hashlib.sha256(open(__file__, 'rb').read()).hexdigest(),
           'rule': 'hard: no overlap > 1e-6 dm with a native wall (except inside a door hosted by that wall) or an uncovered cell hole (except inside a door); soft (outside walls/holes only): samples outside every cell within 0.3 m of own original',
           'inputs': {}}
    g = guides = None
    if a.graph_full and a.guides:
        sys.path.insert(0, HERE)
        from common import load_graph, map_net_edges, fit_similarity
        g, guides = load_graph(a.graph_full, a.guides)
        gnode = {n['id']: n for n in g['nodes']}
    allok = True
    for fid in a.floors.split(','):
        path = os.path.join(a.root, 'floors', fid + '.json')
        raw = open(path, 'rb').read()
        res['inputs'][fid] = hashlib.sha256(raw).hexdigest()
        fl = json.loads(raw)
        r = {}
        net, sch = fl['net'], fl.get('schematic')
        r['schematicPresent'] = sch is not None and len(sch) == len(net)
        if not r['schematicPresent']:
            res[fid] = r; allok = False; continue
        if a.original:
            o = json.load(open(os.path.join(a.original, 'floors', fid + '.json')))
            r['netIdenticalToOriginal'] = o['net'] == net and o['netNodes'] == fl['netNodes']
        F = Floor(fl)
        changed = ends = ints = short = 0
        hard_viol, defects, defect_changed, soft_samples, soft_viol = [], [], [], 0, []
        for i, ((l, cat, ei), s) in enumerate(zip(net, sch)):
            P = pts(l)
            oc = F.contacts(P)
            if oc:
                defects.append(i)
                if s:
                    defect_changed.append(i)
            if not s:
                continue
            changed += 1
            Q = pts(s)
            ends += Q[0] == P[0] and Q[-1] == P[-1]
            ints += all(isinstance(v, int) for v in s)
            short += len(Q) < 2
            c = F.contacts(Q)
            if c:
                hard_viol.append([i, fl['netNodes'][ei], [[k, nid, round(ln, 3)] for k, nid, ln, _ in c], bool(oc)])
            for x in samples(Q):
                if F.in_cells(x):
                    continue
                d = min(seg_dist(x, P[k], P[k + 1]) for k in range(len(P) - 1)) if len(P) > 1 else math.dist(x, P[0])
                soft_samples += 1
                if d > SOFT_TOL + 1e-6:
                    soft_viol.append([i, round(d, 2)]); break
        listed = fl.get('sourceWallCrossings')
        r.update({
            'netLines': len(net), 'changedLines': changed, 'changedLinesKeepingEndpoints': ends,
            'changedLinesIntegerPoints': ints, 'changedLinesUnder2Points': short,
            'hardRuleViolations': len(hard_viol),
            'hardRuleViolationsWhereOriginalWasClear': sum(1 for x in hard_viol if not x[3]),
            'hardRuleViolationExamples': hard_viol[:10],
            'sourceDefectLines': len(defects), 'sourceDefectLinesChanged': len(defect_changed),
            'softRuleSamplesOutsideCells': soft_samples, 'softRuleViolations': len(soft_viol),
            'softRuleViolationExamples': soft_viol[:10],
        })
        if listed is not None:
            r['sourceDefectListMatches'] = sorted({x[0] for x in listed}) == defects
        if g is not None:
            edge_ids, _ = map_net_edges(fl, g, guides)
            T, fit = fit_similarity(fl, g, edge_ids)
            dmax = 0.0
            for (l, cat, ei) in net:
                u, v = fl['netNodes'][ei]; P = pts(l)
                for nid, p in ((u, P[0]), (v, P[-1])):
                    n = gnode.get(nid)
                    if n and n.get('pointFeet'):
                        dmax = max(dmax, math.dist(p, T(n['pointFeet'])))
            r['graphFullFit'] = {'pairs': fit['pairs'], 'maxResidualDm': round(fit['maxResidualDm'], 2)}
            r['maxNodeOffsetFromGraphFullDm'] = round(dmax, 2)
            if a.graph_full and 'netEdgeIds' in fl:
                r['netEdgeIdsMatchGraph'] = fl['netEdgeIds'] == edge_ids
        ok = (ends == changed and ints == changed and short == 0 and not hard_viol and not defect_changed
              and not soft_viol and r.get('netIdenticalToOriginal', True) and r.get('sourceDefectListMatches', True)
              and r.get('netEdgeIdsMatchGraph', True))
        r['PASS'] = ok
        allok &= ok
        res[fid] = r
        print(fid, json.dumps({k: v for k, v in r.items() if not k.endswith('Examples')}), flush=True)
    res['ALL_PASS'] = allok
    print('ALL_PASS', allok)
    if a.output:
        json.dump(res, open(a.output, 'w'), indent=1)
    sys.exit(0 if allok else 1)


if __name__ == '__main__':
    main()
