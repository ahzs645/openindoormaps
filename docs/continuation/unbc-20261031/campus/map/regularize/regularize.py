"""Schematic regularizer for the UNBC pathway map (display only).

Reads artifact4/floors/*.json and writes artifact5/floors/*.json (plus an
unchanged copy of index.html).  Only the geometry of `net` lines is changed
(`seams` are two-point lines and are already straight; they are copied as-is).
Graph topology is untouched: netNodes, edge order, edge count and every line's
first/last point (the graph node positions) are identical to the input.

Pipeline per floor (all units decimetres, x east, y north):
  A  per-line cleanup: snap interior vertices onto a fixed node point (<= 2.5 dm)
     or a shared leader vertex (<= 3 dm), drop duplicate points, exact back-tracks
     (A,B,A) and short sawtooth spikes (turn > 150 deg, short leg <= 6 dm).
  A3 micro-junction contraction: drawn chains shorter than 0.8 m between two
     junctions are merged into one junction (a fixed node point wins), unless the
     chain is a clean square step (axis-aligned, >= 0.3 m) or the move would pull
     a straight trunk passing through the junction more than 0.15 m off its line.
  B  drawn graph: union of all cleaned lines (vertices = unique points).
     Junctions = fixed node points and drawn vertices of degree != 2.  Each chain
     between junctions is simplified once, so overlapping guides stay overlapping:
     corridor-aware Douglas-Peucker (0.7 m when the replacement segment lies
     within 12 deg of a building axis, else 0.15 m so right-angle corners survive;
     then 0.4 m / 0.2 m if the result is invalid).  Terminal chains <= 5 m that
     end at a node with one drawn neighbour and contain a back-and-forth become
     one straight spur when valid.
  C  orthogonalization: each segment gets a local building frame from the
     native wall footprints within 6 m; segments within 12 deg of the frame axes
     are snapped to exact axis directions by grouping vertices that must share a
     coordinate (least displacement, fixed points never move).  Chains that would
     become invalid are pinned to their phase-B geometry and the solve repeats.
  D  right-angle spurs: a straight terminal spur J->T (T a node with one drawn
     neighbour) that meets the trunk at J obliquely is re-attached at the foot F
     of the perpendicular from T on the trunk (on an existing trunk segment, or
     on the straight extension of the trunk past a corner), so the trunk
     continues straight and the spur leaves at 90 deg.
  E  final check per line against ITS OWN original line; any line that fails is
     restored to its original geometry.

Validity: every output segment is sampled every 1 dm; each sample must lie inside
the union of native cells (outer ring minus holes) and outside every native wall
footprint, or within 3 dm of the original line(s) the piece belongs to.

usage: python3 regularize.py [src_dir] [dst_dir]
"""
import json, math, os, shutil, sys
from collections import defaultdict, Counter

import numpy as np
from PIL import Image, ImageDraw

W = '/home/user/unbc-work'
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(W, 'artifact4')
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(W, 'artifact5')
FLOORS = ['campus-floor-1', 'floor-2', 'campus-floor-3', 'floor-4']

SNAP = 3.0          # dm, vertex snap radius onto a shared leader vertex (phase A)
SNAP_FIXED = 2.5    # dm, vertex snap radius onto a fixed node point (phase A)
SPIKE_TURN = 150.0  # deg
SPIKE_LEG = 6.0     # dm
DP_TOLS = (7.0, 4.0, 2.0)
DP_DIAG = 1.5       # dm, DP tolerance when the replacement segment would be diagonal
TERM_STRAIGHT = 50.0  # dm
AXIS_TOL = 12.0     # deg
FRAME_R = 60.0      # dm
MAX_MOVE = 8.0      # dm, orthogonalization displacement limit
TOL = 3.0           # dm, allowed distance from original outside cells (spec)
TOL_INTERNAL = 2.8  # dm, used internally (margin for integer rounding)
R_TERM = 20.0       # dm, terminal leg length examined for sawtooth (phase A, optional)
TERM_LEG_PER_LINE = False  # per-line terminal straightening (breaks shared trunks; off)
CONTRACT = 8.0      # dm, drawn chains shorter than this between junctions are contracted (phase A3)
SPUR_MAX = 60.0     # dm, max terminal spur length considered in phase D
SPUR_DEG1 = True    # True: only re-attach spurs whose terminal has a single drawn neighbour
EXT_MAX = 30.0      # dm, max straight trunk extension past a corner


def pts(flat):
    return [(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]


def flat(P):
    out = []
    for p in P:
        out += [int(round(p[0])), int(round(p[1]))]
    return out


def turn_deg(a, b, c):
    v1 = (b[0] - a[0], b[1] - a[1]); v2 = (c[0] - b[0], c[1] - b[1])
    l1, l2 = math.hypot(*v1), math.hypot(*v2)
    if l1 == 0 or l2 == 0:
        return 0.0
    cs = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
    return math.degrees(math.acos(max(-1.0, min(1.0, cs))))


def plen(P):
    return sum(math.dist(P[i], P[i + 1]) for i in range(len(P) - 1))


# ---------------------------------------------------------------- metrics
def dedupe(P, eps=1.0):
    out = [P[0]]
    for p in P[1:]:
        if math.dist(p, out[-1]) >= eps:
            out.append(p)
    if len(out) == 1 and len(P) > 1:
        out.append(P[-1])
    return out


def line_metrics(P):
    """Same definitions as agents/audit-ends/audit.py (dedupe 1 dm)."""
    P = dedupe(P)
    bends = rev = 0
    for k in range(1, len(P) - 1):
        t = turn_deg(P[k - 1], P[k], P[k + 1])
        if t > 5:
            bends += 1
        if t > 120 and min(math.dist(P[k - 1], P[k]), math.dist(P[k], P[k + 1])) <= 20:
            rev += 1
    return bends, rev


def drawn_metrics(lines, fixed):
    """Metrics of the drawing itself (shared segments counted once).
    bends are taken at drawn vertices of degree 2 (where a line simply turns):
    rightAngle = within 5 deg of 90, oblique = any other turn over 5 deg;
    sawtooth = degree-2 turn over 120 deg with a leg <= 2 m (a back-and-forth);
    spike tips = drawn dead ends that are not a graph node position."""
    adj = defaultdict(set)
    for P in lines:
        for a, b in zip(P, P[1:]):
            a = (round(a[0]), round(a[1])); b = (round(b[0]), round(b[1]))
            if a != b:
                adj[a].add(b); adj[b].add(a)
    segs = sum(len(v) for v in adj.values()) // 2
    tips = [v for v, n in adj.items() if len(n) == 1 and v not in fixed]
    bends = right = oblique = saw = sawn = 0
    for v, n in adj.items():
        if len(n) == 2:
            a, c = list(n)
            t = turn_deg(a, v, c)
            if t > 5:
                bends += 1
                if abs(t - 90) <= 5:
                    right += 1
                else:
                    oblique += 1
            if t > 120 and min(math.dist(a, v), math.dist(v, c)) <= 20:
                if v in fixed:
                    sawn += 1
                else:
                    saw += 1
    return {'drawnVertices': len(adj), 'drawnSegments': segs, 'drawnBendsOver5': bends,
            'drawnRightAngleBends': right, 'drawnObliqueBends': oblique,
            'drawnSawtoothReversals': saw, 'drawnSharpVAtNodePoint': sawn,
            'spikeTipsNotAtNode': len(tips)}


def visible_spike_tips(lines):
    """agents/audit-ends/audit_visual.py definition: reversal tips (turn > 120 deg,
    leg <= 2 m, 1 dm dedupe) not covered by any other line within 1.5 dm."""
    segs = defaultdict(list)
    for li, P in enumerate(lines):
        for s, (a, b) in enumerate(zip(P, P[1:])):
            for gx in range(int(min(a[0], b[0]) // 20) - 1, int(max(a[0], b[0]) // 20) + 2):
                for gy in range(int(min(a[1], b[1]) // 20) - 1, int(max(a[1], b[1]) // 20) + 2):
                    segs[(gx, gy)].append((li, a, b))
    tips = {}
    for li, P0 in enumerate(lines):
        P = dedupe(P0)
        for k in range(1, len(P) - 1):
            t = turn_deg(P[k - 1], P[k], P[k + 1])
            if t > 120 and min(math.dist(P[k - 1], P[k]), math.dist(P[k], P[k + 1])) <= 20:
                tips.setdefault((round(P[k][0] / 1.5), round(P[k][1] / 1.5)), []).append((li, P[k]))
    vis = 0
    for lst in tips.values():
        p = lst[0][1]; owners = {x[0] for x in lst}
        cov = any(lj not in owners and seg_point_dist(p, a, b) <= 1.5
                  for lj, a, b in segs[(int(p[0] // 20), int(p[1] // 20))])
        vis += not cov
    return vis


# ---------------------------------------------------------------- validity raster
class Validity:
    def __init__(self, fl):
        xs, ys = [], []
        for _, _, rings in fl['cells']:
            for r in rings:
                xs += r[0::2]; ys += r[1::2]
        for l, _, _ in fl['net']:
            xs += l[0::2]; ys += l[1::2]
        self.x0, self.y1 = min(xs) - 20, max(ys) + 20
        self.w, self.h = int(max(xs) + 20 - self.x0) + 1, int(self.y1 - (min(ys) - 20)) + 1
        m = np.zeros((self.h, self.w), dtype=bool)
        for _, _, rings in fl['cells']:
            if not rings:
                continue
            P0 = pts(rings[0])
            bx0 = int(min(p[0] for p in P0) - self.x0) - 1; bx1 = int(max(p[0] for p in P0) - self.x0) + 2
            by0 = int(self.y1 - max(p[1] for p in P0)) - 1; by1 = int(self.y1 - min(p[1] for p in P0)) + 2
            im = Image.new('1', (bx1 - bx0, by1 - by0), 0); d = ImageDraw.Draw(im)
            for k, r in enumerate(rings):
                Q = [(x - self.x0 - bx0, self.y1 - y - by0) for x, y in pts(r)]
                if len(Q) >= 3:
                    d.polygon(Q, fill=1 if k == 0 else 0)
            m[by0:by1, bx0:bx1] |= np.array(im, dtype=bool)
        im = Image.new('1', (self.w, self.h), 0); d = ImageDraw.Draw(im)
        for r in fl['walls']:
            Q = [(x - self.x0, self.y1 - y) for x, y in pts(r)]
            if len(Q) >= 3:
                d.polygon(Q, fill=1)
        m &= ~np.array(im, dtype=bool)
        # conservative: erode by one pixel so raster edge effects never accept a point
        # that an exact polygon test would reject
        e = m.copy()
        e[1:, :] &= m[:-1, :]; e[:-1, :] &= m[1:, :]; e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
        self.m = e

    def inside(self, X, Y):
        c = np.round(X - self.x0).astype(int); r = np.round(self.y1 - Y).astype(int)
        ok = (c >= 0) & (c < self.w) & (r >= 0) & (r < self.h)
        out = np.zeros(len(X), dtype=bool)
        out[ok] = self.m[r[ok], c[ok]]
        return out

    @staticmethod
    def samples(P):
        X, Y = [], []
        for a, b in zip(P, P[1:]):
            n = max(1, int(math.ceil(math.dist(a, b))))
            t = np.linspace(0, 1, n + 1)
            X.append(a[0] + (b[0] - a[0]) * t); Y.append(a[1] + (b[1] - a[1]) * t)
        if not X:
            return np.array([P[0][0]], float), np.array([P[0][1]], float)
        return np.concatenate(X), np.concatenate(Y)

    @staticmethod
    def dist_to(X, Y, R):
        R = np.asarray(R, float)
        if len(R) == 1:
            return np.hypot(X - R[0, 0], Y - R[0, 1])
        A, B = R[:-1], R[1:]
        D = B - A; L2 = (D ** 2).sum(1); L2[L2 == 0] = 1
        px = X[:, None] - A[None, :, 0]; py = Y[:, None] - A[None, :, 1]
        t = np.clip((px * D[None, :, 0] + py * D[None, :, 1]) / L2[None, :], 0, 1)
        dx = px - t * D[None, :, 0]; dy = py - t * D[None, :, 1]
        return np.sqrt(dx * dx + dy * dy).min(1)

    def ok(self, P, refs):
        """P: polyline; refs: list of original polylines.  Samples outside cells must
        be within TOL of every ref."""
        if len(P) < 2:
            return True
        X, Y = self.samples(P)
        out = ~self.inside(X, Y)
        if not out.any():
            return True
        X, Y = X[out], Y[out]
        for R in refs:
            if (self.dist_to(X, Y, R) > TOL_INTERNAL).any():
                return False
        return True


# ---------------------------------------------------------------- frames
class Frames:
    def __init__(self, fl):
        M, A, L = [], [], []
        for r in fl['walls']:
            P = pts(r)
            for i in range(len(P)):
                a, b = P[i], P[(i + 1) % len(P)]
                l = math.dist(a, b)
                if l < 5:
                    continue
                M.append(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
                A.append(math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 90)
                L.append(l)
        self.M = np.array(M); self.A = np.array(A); self.L = np.array(L)
        self.cache = {}

    def at(self, p):
        key = (int(p[0] // 20), int(p[1] // 20))
        if key in self.cache:
            return self.cache[key]
        c = ((key[0] + 0.5) * 20, (key[1] + 0.5) * 20)
        d = np.hypot(self.M[:, 0] - c[0], self.M[:, 1] - c[1])
        sel = d <= FRAME_R
        res = None
        if sel.sum() >= 3:
            a, w = self.A[sel], self.L[sel]
            h = np.zeros(90)
            np.add.at(h, np.floor(a).astype(int) % 90, w)
            hs = h + np.roll(h, 1) + np.roll(h, -1) + 0.5 * (np.roll(h, 2) + np.roll(h, -2))
            pk = int(np.argmax(hs))
            diff = (a - (pk + 0.5) + 45) % 90 - 45
            near = np.abs(diff) <= 3
            sup = w[near].sum() / w.sum()
            if sup >= 0.35:
                res = ((pk + 0.5) + float((diff[near] * w[near]).sum() / w[near].sum())) % 90
        self.cache[key] = res
        return res


# ---------------------------------------------------------------- helpers
def axis_dev(a, b, frames):
    """Angle (deg) between segment a-b and the nearest axis of the local building frame."""
    fr = frames.at(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
    if fr is None or a == b:
        return 90.0
    phi = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    return abs((phi - fr + 45) % 90 - 45)


def dp(P, tol, frames=None, tol_diag=DP_DIAG):
    """Douglas-Peucker with fixed ends.  Corridor-aware: a run may collapse to one
    segment with deviation up to `tol` only if that segment is near a building axis
    (it will be snapped square in phase C); a diagonal replacement is allowed only
    up to `tol_diag`, so right-angle corners (e.g. door -> step in -> arrival) survive."""
    if len(P) <= 2:
        return list(P)
    a, b = np.array(P[0], float), np.array(P[-1], float)
    Q = np.array(P[1:-1], float)
    d = b - a; L = math.hypot(*d)
    if L == 0:
        dist = np.hypot(Q[:, 0] - a[0], Q[:, 1] - a[1])
    else:
        dist = np.abs(d[0] * (Q[:, 1] - a[1]) - d[1] * (Q[:, 0] - a[0])) / L
    i = int(np.argmax(dist))
    lim = tol
    if frames is not None and axis_dev(P[0], P[-1], frames) > AXIS_TOL:
        lim = min(tol, tol_diag)
    if dist[i] <= lim:
        return [P[0], P[-1]]
    i += 1
    return dp(P[:i + 1], tol, frames, tol_diag)[:-1] + dp(P[i:], tol, frames, tol_diag)


class UF:
    def __init__(self):
        self.p = {}

    def f(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x

    def u(self, a, b):
        a, b = self.f(a), self.f(b)
        if a != b:
            self.p[a] = b


def seg_point_dist(p, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    L2 = ax * ax + ay * ay
    if L2 == 0:
        return math.dist(p, a)
    t = max(0.0, min(1.0, ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / L2))
    return math.hypot(p[0] - a[0] - t * ax, p[1] - a[1] - t * ay)


def through_kink(b, a, adj):
    """True if b carries a straight run (two neighbours ~collinear through b) and
    moving b to a would pull that run more than 1.5 dm off its line."""
    nb = [n for n in adj[b] if n != a]
    for i in range(len(nb)):
        for j in range(i + 1, len(nb)):
            if turn_deg(nb[i], b, nb[j]) < 20 and seg_point_dist(a, nb[i], nb[j]) > 1.5:
                return True
    return False


def clean_path(P, fixed):
    """Drop duplicates, exact back-tracks and short sawtooth spikes (interior, non-fixed)."""
    changed = True
    while changed:
        changed = False
        out = []
        for p in P:
            if out and p == out[-1]:
                continue
            if len(out) >= 2 and p == out[-2]:
                out.pop(); changed = True
                continue
            out.append(p)
        P = out
        k = 1
        while k < len(P) - 1:
            if True:
                t = turn_deg(P[k - 1], P[k], P[k + 1])
                if t > SPIKE_TURN and min(math.dist(P[k - 1], P[k]), math.dist(P[k], P[k + 1])) <= SPIKE_LEG:
                    del P[k]; changed = True
                    k = max(1, k - 1)
                    continue
            k += 1
    return P


# ---------------------------------------------------------------- per floor
def regularize(fl):
    net, nn = fl['net'], fl['netNodes']
    orig = [pts(l) for l, _, _ in net]
    V = Validity(fl)
    FR = Frames(fl)
    reasons = Counter()

    fixed = set()
    for P in orig:
        fixed.add(P[0]); fixed.add(P[-1])
    for l in fl['seams'] + fl['approaches']:
        P = pts(l); fixed.add(P[0]); fixed.add(P[-1])
    for l, *_ in fl['links'] + fl['vertical'] + fl['held']:
        P = pts(l); fixed.add(P[0]); fixed.add(P[-1])

    # ---------------- A: snap + cleanup
    use = Counter(p for P in orig for p in set(P[1:-1]))
    grid = defaultdict(list)
    G = SNAP
    leader = {}

    def near_leaders(p):
        gx, gy = int(p[0] // G), int(p[1] // G)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                yield from grid[(gx + dx, gy + dy)]

    for f in fixed:
        grid[(int(f[0] // G), int(f[1] // G))].append(f)
    for p in sorted(use, key=lambda q: (-use[q], q)):
        if p in fixed:
            leader[p] = p; continue
        best = None
        for q in near_leaders(p):
            d = math.dist(p, q)
            if d <= (SNAP_FIXED if q in fixed else SNAP):
                k = (0 if q in fixed else 1, d)
                if best is None or k < best[0]:
                    best = (k, q)
        if best:
            leader[p] = best[1]
        else:
            leader[p] = p; grid[(int(p[0] // G), int(p[1] // G))].append(p)

    lines = []
    excluded = set()
    stats = Counter()
    for i, P in enumerate(orig):
        if len(P) < 2 or P[0] == P[-1]:
            lines.append(list(P)); excluded.add(i); reasons['A: zero-length or closed edge (both nodes drawn at one point, e.g. stair landing = arrival); kept'] += 1
            continue
        Q = [P[0]] + [leader[p] for p in P[1:-1]] + [P[-1]]
        Q = clean_path(Q, fixed)
        if len(Q) < 2:
            Q = [P[0], P[-1]]
        if TERM_LEG_PER_LINE and V.ok(Q, [P]):
            for end in (0, 1):
                R = Q if end == 0 else Q[::-1]
                acc, q = 0.0, len(R) - 1
                for k in range(1, len(R)):
                    acc += math.dist(R[k - 1], R[k])
                    if acc >= R_TERM:
                        q = k; break
                if q < 2 or q == len(R) - 1:
                    continue   # nothing to straighten, or the whole line is short (keep it on the shared trunk)
                turns = [turn_deg(R[k - 1], R[k], R[k + 1]) for k in range(1, q)]
                if not (any(t > 120 for t in turns) or sum(1 for t in turns if t > 30) >= 2):
                    continue
                S = [R[0]] + R[q:]
                if V.ok(S[:2], [P]):
                    Q = S if end == 0 else S[::-1]
                    stats['A: zigzag terminal legs replaced by one straight spur'] += 1
        if not V.ok(Q, [P]):
            lines.append(list(P)); excluded.add(i); reasons['A: snapped/cleaned line would leave cells (>0.3 m off original)'] += 1
            continue
        lines.append(Q)

    # ---------------- A3: contract micro-junction clusters (short drawn chains)
    for rnd in range(6):
        adj = defaultdict(set)
        for i in range(len(lines)):
            if i in excluded:
                continue
            P = lines[i]
            for a, b in zip(P, P[1:]):
                adj[a].add(b); adj[b].add(a)
        junc = {v for v, n in adj.items() if len(n) != 2 or v in fixed}
        uf = UF()
        seen = set(); merges = 0
        for j in junc:
            for nb in adj[j]:
                C = [j, nb]; L = math.dist(j, nb)
                while C[-1] not in junc and L < CONTRACT:
                    a, b = list(adj[C[-1]])
                    C.append(a if a != C[-2] else b); L += math.dist(C[-2], C[-1])
                if C[-1] not in junc or L >= CONTRACT or C[-1] == j:
                    continue
                if len(C) == 2 and L >= 3 and axis_dev(C[0], C[1], FR) <= AXIS_TOL:
                    continue   # a clean square step (e.g. door -> step inside): keep the right angle
                a, b = uf.f(j), uf.f(C[-1])
                if a == b or (a in fixed and b in fixed):
                    continue
                # fixed point (or the busier junction) represents the merged cluster
                if b in fixed or (a not in fixed and len(adj[b]) > len(adj[a])):
                    a, b = b, a
                if through_kink(b, a, adj):
                    stats['A3: contraction refused (would kink a straight trunk)'] += 1
                    continue
                uf.p[b] = a; uf.p.setdefault(a, a); merges += 1
        if not merges:
            break
        rep = {}
        for v in list(uf.p):
            rep[v] = uf.f(v)
        for i in range(len(lines)):
            if i in excluded:
                continue
            P = lines[i]
            Q = [P[0]] + [rep.get(p, p) for p in P[1:-1]] + [P[-1]]
            Q = clean_path(Q, fixed)
            if len(Q) < 2:
                Q = [P[0], P[-1]]
            if Q != P and V.ok(Q, [orig[i]]):
                lines[i] = Q
            elif Q != P:
                stats['A3: contraction skipped for a line (would leave cells)'] += 1
        stats['A3: micro-junctions contracted'] += merges

    # ---------------- B: drawn graph, chains, simplification
    active = [i for i in range(len(lines)) if i not in excluded]
    adj = defaultdict(set)
    for i in active:
        P = lines[i]
        for a, b in zip(P, P[1:]):
            adj[a].add(b); adj[b].add(a)
    junction = {v for v, n in adj.items() if len(n) != 2 or v in fixed}
    chain_of = {}   # directed (u,v) first step -> (chain id, forward?)
    chains = []
    for j in list(junction):
        for nb in adj[j]:
            if (j, nb) in chain_of:
                continue
            C = [j, nb]
            while C[-1] not in junction:
                a, b = list(adj[C[-1]])
                C.append(a if a != C[-2] else b)
                if C[-1] == C[0]:
                    break
            cid = len(chains); chains.append(C)
            chain_of[(C[0], C[1])] = (cid, True)
            chain_of[(C[-1], C[-2])] = (cid, False)
    covered = {v for C in chains for v in C}
    for v in list(adj):   # pure cycles without junction
        if v in covered:
            continue
        for nb in list(adj[v])[:1]:
            if (v, nb) not in chain_of:
                junction.add(v)
                C = [v, nb]
                while C[-1] != v:
                    a, b = list(adj[C[-1]])
                    C.append(a if a != C[-2] else b)
                cid = len(chains); chains.append(C); covered.update(C)
                chain_of[(C[0], C[1])] = (cid, True); chain_of[(C[-1], C[-2])] = (cid, False)

    def decompose(P):
        seq = []; k = 0
        while k < len(P) - 1:
            cid, fwd = chain_of[(P[k], P[k + 1])]
            n = len(chains[cid]) - 1
            seq.append((cid, fwd)); k += n
        assert k == len(P) - 1
        return seq

    line_chains = {i: decompose(lines[i]) for i in active}
    chain_lines = defaultdict(set)
    for i, seq in line_chains.items():
        for cid, _ in seq:
            chain_lines[cid].add(i)
    refs = {cid: [orig[i] for i in chain_lines[cid]] for cid in range(len(chains))}

    def degree(v):
        return len(adj[v])

    simp = []
    chain_stats = Counter()
    for cid, C in enumerate(chains):
        R = refs[cid]
        cand = []
        a, b = C[0], C[-1]
        term = (a in fixed and degree(a) == 1) or (b in fixed and degree(b) == 1)
        if term and len(C) > 2 and plen(C) <= TERM_STRAIGHT and a != b and line_metrics(C)[1] > 0:
            # zigzag terminal leg (back-and-forth near a door/arrival): one straight spur
            cand.append(('straight', [a, b]))
        for t in DP_TOLS:
            cand.append((f'dp{t:g}', dp(C, t, FR)))
        chosen = None
        for name, S in cand:
            if len(S) == len(C):
                chosen = (name, S); break
            if V.ok(S, R):
                chosen = (name, S); break
        if chosen is None:
            chosen = ('kept', list(C)); reasons['B: chain kept as cleaned (every simplification leaves cells)'] += 1
        elif chosen[0] == 'dp2':
            reasons['B: chain needed fine DP 0.2 m (coarser leaves cells)'] += 1
        elif chosen[0] == 'dp4':
            reasons['B: chain needed DP 0.4 m (0.7 m leaves cells)'] += 1
        chain_stats[chosen[0]] += 1
        simp.append(chosen[1])
    simpB = [list(S) for S in simp]

    # ---------------- C: orthogonalize
    pinned = set(fixed)
    seg_info = {}
    for cid, S in enumerate(simp):
        for a, b in zip(S, S[1:]):
            if a == b:
                continue
            fr = FR.at(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2))
            if fr is None:
                continue
            phi = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
            d = (phi - fr + 45) % 90 - 45
            if abs(d) > AXIS_TOL:
                continue
            frk = round(fr) % 90
            along = abs((phi - fr + 90) % 180 - 90) <= AXIS_TOL  # parallel to frame axis
            nang = frk + 90 if along else frk
            seg_info[(cid, a, b)] = (nang % 180, fr)
    # exact frame angle per key: mean
    keyang = defaultdict(list)
    for (nang, fr) in seg_info.values():
        keyang[nang].append(fr)
    nvec = {}
    for k, frs in keyang.items():
        base = k % 90
        f = base + float(np.mean([(x - base + 45) % 90 - 45 for x in frs]))
        ang = f if k < 90 else f + 90   # k < 90: normal along the frame axis
        nvec[k] = (math.cos(math.radians(ang)), math.sin(math.radians(ang)))

    def solve():
        ufs = defaultdict(UF)
        anchors = defaultdict(list)
        members = defaultdict(list)
        cons_edges = []
        for (cid, a, b), (k, _) in seg_info.items():
            n = nvec[k]
            pa, pb = a in pinned, b in pinned
            if pa and pb:
                continue
            if not pa and not pb:
                ufs[k].u(a, b)
            cons_edges.append((k, a, b))
        for k, a, b in cons_edges:
            n = nvec[k]
            for x, y in ((a, b), (b, a)):
                if x not in pinned:
                    r = (k, ufs[k].f(x))
                    if y in pinned:
                        anchors[r].append(n[0] * y[0] + n[1] * y[1])
                    members[r].append(x)
        val = {}
        for r, mem in members.items():
            k = r[0]; n = nvec[k]
            an = anchors.get(r)
            if an:
                if max(an) - min(an) > 1.5:
                    continue
                val[r] = float(np.mean(an))
            else:
                ms = set(mem)
                val[r] = float(np.mean([n[0] * m[0] + n[1] * m[1] for m in ms]))
        cons = defaultdict(dict)
        for r, mem in members.items():
            if r in val:
                for m in set(mem):
                    cons[m][r[0]] = val[r]
        newpos = {}
        for v, cs in cons.items():
            p = np.array(v, float)
            if len(cs) == 1:
                (k, c), = cs.items(); n = np.array(nvec[k])
                q = p + (c - n @ p) * n
            else:
                N = np.array([nvec[k] for k in cs]); c = np.array(list(cs.values()))
                A = N.T @ N
                if abs(np.linalg.det(A)) < 1e-6:
                    k, c0 = next(iter(cs.items())); n = np.array(nvec[k]); q = p + (c0 - n @ p) * n
                else:
                    q = np.linalg.solve(A, N.T @ c)
            newpos[v] = (float(q[0]), float(q[1]))
        return newpos

    for it in range(12):
        newpos = solve()
        bad = []
        for v, q in newpos.items():
            if math.dist(v, q) > MAX_MOVE:
                bad.append(v)
        if bad:
            pinned.update(bad); continue
        fail = []
        for cid, S in enumerate(simpB):
            T = [newpos.get(p, p) for p in S]
            if T != S and not V.ok(T, refs[cid]):
                fail.append(cid)
        if not fail:
            break
        for cid in fail:
            pinned.update(simpB[cid])
    else:
        newpos = {}
    nfail_c = sum(1 for cid, S in enumerate(simpB) if any(p in pinned and p not in fixed for p in S[1:-1]))
    reasons['C: chain pinned to its simplified shape (axis snap would leave cells or move >0.8 m)'] += nfail_c
    simp = [[newpos.get(p, p) for p in S] for S in simpB]
    # drop near-collinear interior vertices that are not fixed
    for cid, S in enumerate(simp):
        k = 1
        while k < len(S) - 1:
            if S[k] not in fixed and (turn_deg(S[k - 1], S[k], S[k + 1]) < 2 or math.dist(S[k], S[k - 1]) < 0.5):
                T = S[:k] + S[k + 1:]
                if V.ok(T, refs[cid]):
                    S = T; continue
            k += 1
        simp[cid] = S

    # position map for chain endpoints (junction may have moved)
    def pos(v):
        return newpos.get(v, v)

    # rebuild lines as point lists, remember chain usage
    def line_points(i):
        out = []
        for cid, fwd in line_chains[i]:
            S = simp[cid] if fwd else simp[cid][::-1]
            out += S if not out else S[1:]
        return out

    # ---------------- D: perpendicular spurs
    # graph over simplified geometry
    sadj = defaultdict(set)
    for S in simp:
        for a, b in zip(S, S[1:]):
            if a != b:
                sadj[a].add(b); sadj[b].add(a)
    spur = {}   # chain id -> (F, extension?) ; chain oriented J ... T
    spur_stats = Counter()
    for cid, S in enumerate(simp):
        if len(S) != 2:
            continue
        for J, T in ((S[0], S[1]), (S[1], S[0])):
            if T not in fixed or (SPUR_DEG1 and len(sadj[T]) != 1):
                continue
            if J == T or math.dist(J, T) > SPUR_MAX or math.dist(J, T) < 3:
                continue
            others = [K for K in sadj[J] if K != T]
            if not others:
                continue
            best = None
            for K in others:
                u = np.array(K, float) - np.array(J, float); L = float(np.hypot(*u))
                if L < 3:
                    continue
                u /= L
                w = np.array(T, float) - np.array(J, float)
                t = float(w @ u)
                perp_dev = abs(90 - math.degrees(math.acos(max(-1, min(1, t / max(1e-9, float(np.hypot(*w))))))))
                if perp_dev <= 5:
                    best = None; break     # already square to this trunk
                ext = False
                if 2 <= t <= L - 1:
                    F = (float(J[0] + t * u[0]), float(J[1] + t * u[1]))
                elif -EXT_MAX <= t <= -2 and len(sadj[J]) == 2:
                    # straight continuation of K->J past the corner J
                    if turn_deg(K, J, T) < 20:
                        continue
                    F = (float(J[0] + t * u[0]), float(J[1] + t * u[1])); ext = True
                else:
                    continue
                if math.dist(F, T) < 2:
                    continue
                geom = [J, F, T] if ext else [F, T]
                if not V.ok(geom, refs[cid]):
                    spur_stats['spur rejected: perpendicular leaves cells'] += 1
                    continue
                score = (1 if ext else 0, abs(t))
                if best is None or score < best[0]:
                    best = (score, F, ext, K)
            if best:
                spur[cid] = (J, T, best[1], best[2], best[3])
                spur_stats['extension' if best[2] else 'foot on trunk'] += 1
    reasons.update({'D: ' + k: v for k, v in spur_stats.items() if 'rejected' in k})

    out_lines = []
    for i in range(len(lines)):
        if i in excluded:
            out_lines.append(orig[i]); continue
        P = []
        for cid, fwd in line_chains[i]:
            S = simp[cid] if fwd else simp[cid][::-1]
            if cid in spur:
                J, T, F, ext, K = spur[cid]
                if S[0] == J:
                    S = [J, F, T]
                else:
                    S = [T, F, J]
            P += S if not P else S[1:]
        # remove collinear reversal at J (path came along trunk past F)
        k = 1
        while k < len(P) - 1:
            a, b, c = P[k - 1], P[k], P[k + 1]
            if turn_deg(a, b, c) > 178:
                del P[k]; k = max(1, k - 1); continue
            if b == a:
                del P[k]; continue
            k += 1
        out_lines.append(P)

    # ---------------- E: final per-line check against own original, rounding
    final = []
    for i, P in enumerate(out_lines):
        Q = [(int(round(p[0])), int(round(p[1]))) for p in P]
        Q = [q for k, q in enumerate(Q) if k == 0 or q != Q[k - 1]]
        Q[0], Q[-1] = orig[i][0], orig[i][-1]
        if len(Q) < 2:
            Q = [orig[i][0], orig[i][-1]]
        if i not in excluded and Q != orig[i] and not V.ok(Q, [orig[i]]):
            reasons['E: line restored (rounded/combined result >0.3 m off original outside cells)'] += 1
            Q = orig[i]
        final.append(Q)
    spur_stats.update(stats)
    spur_stats.update({'B chains: ' + k: v for k, v in chain_stats.items()})
    spur_stats['B chains: total'] = len(chains)
    return final, orig, fixed, reasons, spur_stats, V


def main():
    os.makedirs(os.path.join(DST, 'floors'), exist_ok=True)
    shutil.copyfile(os.path.join(SRC, 'index.html'), os.path.join(DST, 'index.html'))
    for fn in os.listdir(os.path.join(SRC, 'floors')):
        if not any(fn == f + '.json' for f in FLOORS):
            shutil.copyfile(os.path.join(SRC, 'floors', fn), os.path.join(DST, 'floors', fn))
    report = {}
    for fid in FLOORS:
        fl = json.load(open(os.path.join(SRC, 'floors', fid + '.json')))
        final, orig, fixed, reasons, spur_stats, V = regularize(fl)
        before = [line_metrics(P) for P in orig]
        after = [line_metrics(P) for P in final]
        m = {
            'netLines': len(orig),
            'linesChanged': sum(1 for a, b in zip(orig, final) if a != b),
            'lineVertices': [sum(len(P) for P in orig), sum(len(P) for P in final)],
            'lineBendsOver5': [sum(b for b, _ in before), sum(b for b, _ in after)],
            'lineZigzagReversals': [sum(r for _, r in before), sum(r for _, r in after)],
            'linesWithZigzag': [sum(1 for _, r in before if r), sum(1 for _, r in after if r)],
            'drawnBefore': drawn_metrics(orig, fixed),
            'drawnAfter': drawn_metrics(final, fixed),
            'visibleSpikeTips': [visible_spike_tips(orig), visible_spike_tips(final)],
            'piecesKeptOriginalOrPartial': dict(reasons),
            'spurs': dict(spur_stats),
            'lengthDm': [round(sum(plen(P) for P in orig)), round(sum(plen(P) for P in final))],
        }
        out = dict(fl)
        out['net'] = [[flat(P), cat, ei] for P, (_, cat, ei) in zip(final, fl['net'])]
        json.dump(out, open(os.path.join(DST, 'floors', fid + '.json'), 'w'), separators=(',', ':'))
        report[fid] = m
        print(fid, json.dumps(m))
    json.dump(report, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'metrics.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
