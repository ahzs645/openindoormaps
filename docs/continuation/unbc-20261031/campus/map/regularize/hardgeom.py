"""Exact hard-constraint geometry for the schematic regularizer (display only).

Units are the floor files' decimetres. A drawn segment VIOLATES the hard rule if
any part of it of positive length lies in the INTERIOR of a forbidden region:

  * a native wall footprint, except the part inside a
    door footprint whose host wall is that same native wall (the door cuts its
    host wall).  Doors with an unknown host do not exempt anything;
  * a native cell hole (inner ring), except where another native cell covers
    the hole, and except inside any door footprint.

Everything is computed with closed-form segment/polygon intersections
(parametric intervals along the segment).  At the declared zero door margin the
door zone is the CLOSED door footprint, clipped exactly in rational arithmetic
(closed_footprint_intervals); the segment/capsule form is kept only for a
positive margin, which the rule does not use.  No raster and no
sampling decides a wall or hole contact, and there is no distance-to-original
allowance.  Only floating-point noise (EPS_LEN = 1e-6 dm of overlap) is ignored.
"""
import math
from collections import defaultdict
from fractions import Fraction

import numpy as np

DOOR_MARGIN = 0.0     # dm: only the door footprint itself cuts its host wall
EPS_LEN = 1e-6        # dm, overlap below this is floating-point noise
GRID = 40.0           # dm


def pts(flat):
    return [(flat[i], flat[i + 1]) for i in range(0, len(flat), 2)]


def _bbox(R):
    return (float(R[:, 0].min()), float(R[:, 1].min()), float(R[:, 0].max()), float(R[:, 1].max()))


def _merge(iv):
    iv = sorted((a, b) for a, b in iv if b > a)
    out = []
    for a, b in iv:
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [tuple(x) for x in out]


def _subtract(iv, cut):
    cut = _merge(cut)
    out = []
    for a, b in iv:
        cur = a
        for c, d in cut:
            if d <= cur or c >= b:
                continue
            if c > cur:
                out.append((cur, c))
            cur = max(cur, d)
            if cur >= b:
                break
        if cur < b:
            out.append((cur, b))
    return out


def _intersect(iv, other):
    other = _merge(other)
    out = []
    for a, b in iv:
        for c, d in other:
            lo, hi = max(a, c), min(b, d)
            if hi > lo:
                out.append((lo, hi))
    return out


def interior_intervals(p, q, R):
    """Parameter intervals t in [0,1] where p + t (q-p) is strictly inside ring R
    (numpy array (n,2), implicit closure).  Boundary contact is not interior."""
    px, py = p; dx, dy = q[0] - px, q[1] - py
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return []
    A = R; B = np.roll(R, -1, axis=0)
    ex = B[:, 0] - A[:, 0]; ey = B[:, 1] - A[:, 1]
    apx = A[:, 0] - px; apy = A[:, 1] - py
    den = dx * ey - dy * ex
    ts = [0.0, 1.0]
    nz = np.abs(den) > 1e-12
    if nz.any():
        t = (apx[nz] * ey[nz] - apy[nz] * ex[nz]) / den[nz]
        u = (apx[nz] * dy - apy[nz] * dx) / den[nz]
        ok = (t > 0) & (t < 1) & (u >= -1e-12) & (u <= 1 + 1e-12)
        ts.extend(t[ok].tolist())
    col = (~nz) & (np.abs(apx * dy - apy * dx) <= 1e-9 * max(1.0, math.sqrt(L2)))
    if col.any():
        for tt in np.concatenate([(apx[col] * dx + apy[col] * dy) / L2,
                                  ((B[col, 0] - px) * dx + (B[col, 1] - py) * dy) / L2]).tolist():
            if 0 < tt < 1:
                ts.append(tt)
    ts = sorted(set(ts))
    mids = [(a, b) for a, b in zip(ts, ts[1:]) if b - a > 1e-12]
    if not mids:
        return []
    tm = np.array([(a + b) / 2 for a, b in mids])
    X = px + dx * tm; Y = py + dy * tm
    # boundary test: distance from each midpoint to every edge
    Xc = X[:, None]; Yc = Y[:, None]
    el2 = ex * ex + ey * ey; el2s = np.where(el2 == 0, 1, el2)
    s = np.clip(((Xc - A[None, :, 0]) * ex + (Yc - A[None, :, 1]) * ey) / el2s, 0, 1)
    dist = np.hypot(Xc - A[None, :, 0] - s * ex, Yc - A[None, :, 1] - s * ey).min(1)
    on_boundary = dist <= 1e-7
    # ray casting
    y1 = A[None, :, 1]; y2 = B[None, :, 1]; x1 = A[None, :, 0]; x2 = B[None, :, 0]
    cond = (y1 > Yc) != (y2 > Yc)
    with np.errstate(divide='ignore', invalid='ignore'):
        xi = x1 + (Yc - y1) * (x2 - x1) / (y2 - y1)
    inside = (np.sum(cond & (Xc < xi), axis=1) % 2 == 1) & ~on_boundary
    return _merge([mids[k] for k in range(len(mids)) if inside[k]])


def _quad_interval(p, d, c, r):
    """t where |p + t d - c| <= r."""
    fx, fy = p[0] - c[0], p[1] - c[1]
    a = d[0] * d[0] + d[1] * d[1]; b = 2 * (fx * d[0] + fy * d[1]); cc = fx * fx + fy * fy - r * r
    disc = b * b - 4 * a * cc
    if a == 0 or disc < 0:
        return None
    s = math.sqrt(disc)
    return ((-b - s) / (2 * a), (-b + s) / (2 * a))


def _lin_interval(k0, k1, lo, hi):
    """t where lo <= k0 + k1 t <= hi."""
    if k1 == 0:
        return (-math.inf, math.inf) if lo <= k0 <= hi else None
    a, b = (lo - k0) / k1, (hi - k0) / k1
    return (min(a, b), max(a, b))


def _closed_contains(V, x, y):
    """Exact: is (x, y) in the closed polygon V (list of Fraction pairs)?  A point
    on an edge counts as inside; elsewhere the even-odd crossing rule decides."""
    n = len(V)
    inside = False
    for i in range(n):
        (ax, ay), (bx, by) = V[i], V[(i + 1) % n]
        if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) == 0
                and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by)):
            return True
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            inside = not inside
    return inside


def closed_footprint_intervals(p, q, D):
    """Exact t-intervals of segment p->q inside the CLOSED polygon D (zero margin).

    Direct segment/polygon clipping in exact rational arithmetic (Fraction holds
    every float coordinate exactly); D need not be convex.  This is a different
    algorithm from verify.py's convex half-plane clipper on purpose.
      1. Cut the segment at every parameter where it meets the boundary: proper
         crossings and vertices of non-parallel edges, and both ends of every
         edge that is collinear with the segment.
      2. Between consecutive cuts membership is constant, so each piece is
         classified by its exact midpoint: on an edge (boundary) or strictly
         inside both count, because the footprint is closed.  A touch at a
         single point yields no piece.
    No search, sampling or tolerance decides membership."""
    F = Fraction
    px, py = F(float(p[0])), F(float(p[1]))
    dx, dy = F(float(q[0])) - px, F(float(q[1])) - py
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return []
    V = [(F(float(x)), F(float(y))) for x, y in D]
    n = len(V)
    ts = {F(0), F(1)}
    for i in range(n):
        (ax, ay), (bx, by) = V[i], V[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        wx, wy = ax - px, ay - py
        den = dx * ey - dy * ex
        if den != 0:
            t = (wx * ey - wy * ex) / den
            u = (wx * dy - wy * dx) / den
            if 0 < t < 1 and 0 <= u <= 1:
                ts.add(t)
        elif wx * dy - wy * dx == 0:            # edge on the segment's line
            for cx, cy in ((ax, ay), (bx, by)):
                t = ((cx - px) * dx + (cy - py) * dy) / L2
                if 0 < t < 1:
                    ts.add(t)
    ts = sorted(ts)
    out = []
    for a, b in zip(ts, ts[1:]):
        m = (a + b) / 2
        if _closed_contains(V, px + dx * m, py + dy * m):
            if out and out[-1][1] == a:
                out[-1][1] = b
            else:
                out.append([a, b])
    return [(float(a), float(b)) for a, b in out]


def zone_intervals(p, q, D, r):
    """t in [0,1] where p + t (q-p) is inside polygon D or within r of it.
    r == 0 (the declared rule): exact clipping against the closed footprint."""
    if r == 0:
        return closed_footprint_intervals(p, q, D)
    d = (q[0] - p[0], q[1] - p[1])
    out = [(max(0.0, a), min(1.0, b)) for a, b in interior_intervals(p, q, D)]
    n = len(D)
    for i in range(n):
        a = (float(D[i, 0]), float(D[i, 1])); b = (float(D[(i + 1) % n, 0]), float(D[(i + 1) % n, 1]))
        parts = [_quad_interval(p, d, a, r), _quad_interval(p, d, b, r)]
        ex, ey = b[0] - a[0], b[1] - a[1]; Le = math.hypot(ex, ey)
        if Le > 0:
            ux, uy = ex / Le, ey / Le
            along = _lin_interval((p[0] - a[0]) * ux + (p[1] - a[1]) * uy, d[0] * ux + d[1] * uy, 0, Le)
            perp = _lin_interval(-(p[0] - a[0]) * uy + (p[1] - a[1]) * ux, -d[0] * uy + d[1] * ux, -r, r)
            if along and perp:
                lo, hi = max(along[0], perp[0]), min(along[1], perp[1])
                parts.append((lo, hi) if hi >= lo else None)
        parts = [x for x in parts if x]
        if parts:
            lo, hi = min(x[0] for x in parts), max(x[1] for x in parts)
            lo, hi = max(0.0, lo), min(1.0, hi)
            if hi > lo:
                out.append((lo, hi))
    return _merge(out)


class HardConstraints:
    """Forbidden regions of one floor file (walls minus host-door zones, holes
    minus covering cells and door zones)."""

    def __init__(self, fl, margin=DOOR_MARGIN):
        self.margin = margin
        walls = fl.get('walls', [])
        wall_ids = fl.get('wallIds') or [None] * len(walls)
        self.items = []          # (kind, index, native id, ring array, bbox)
        for k, w in enumerate(walls):
            R = np.array(pts(w), float)
            if len(R) >= 3:
                self.items.append(('wall', k, wall_ids[k] if wall_ids[k] is not None else 'wall#%d' % k, R, _bbox(R)))
        self.cells = []
        for ci, (cid, _owners, rings) in enumerate(fl.get('cells', [])):
            if not rings:
                continue
            Rs = [np.array(pts(r), float) for r in rings if len(r) >= 6]
            if not Rs:
                continue
            self.cells.append((cid, Rs, _bbox(Rs[0])))
            for hi, H in enumerate(Rs[1:]):
                self.items.append(('hole', (ci, hi), cid, H, _bbox(H)))
        doors = fl.get('doors', [])
        hosts = fl.get('doorHosts') or [None] * len(doors)
        self.doors = []
        for k, d in enumerate(doors):
            R = np.array(pts(d[0]), float)
            if len(R) >= 3:
                self.doors.append((d[1], hosts[k], R, _bbox(R)))
        self.doors_by_host = defaultdict(list)
        for di, dd in enumerate(self.doors):
            if dd[1] is not None:
                self.doors_by_host[dd[1]].append(di)
        self.grid = defaultdict(list); self.cgrid = defaultdict(list); self.dgrid = defaultdict(list)
        for i, it in enumerate(self.items):
            self._add(self.grid, i, it[4], 0)
        for i, c in enumerate(self.cells):
            self._add(self.cgrid, i, c[2], 0)
        for i, dd in enumerate(self.doors):
            self._add(self.dgrid, i, dd[3], margin)
        self.cache = {}

    @staticmethod
    def _add(grid, i, b, pad):
        for gx in range(int((b[0] - pad) // GRID), int((b[2] + pad) // GRID) + 1):
            for gy in range(int((b[1] - pad) // GRID), int((b[3] + pad) // GRID) + 1):
                grid[(gx, gy)].append(i)

    @staticmethod
    def _near(grid, b):
        out = set()
        for gx in range(int(b[0] // GRID), int(b[2] // GRID) + 1):
            for gy in range(int(b[1] // GRID), int(b[3] // GRID) + 1):
                out.update(grid.get((gx, gy), ()))
        return out

    @staticmethod
    def _side_reject(p, q, b):
        """True if the whole bbox b is strictly on one side of line pq."""
        dx, dy = q[0] - p[0], q[1] - p[1]
        s = [dx * (y - p[1]) - dy * (x - p[0]) for x, y in ((b[0], b[1]), (b[2], b[1]), (b[0], b[3]), (b[2], b[3]))]
        return all(v > 0 for v in s) or all(v < 0 for v in s)

    def segment(self, p, q):
        """Forbidden contacts of segment p-q: list of (kind, index, native id, t0, t1, lengthDm)."""
        p = (float(p[0]), float(p[1])); q = (float(q[0]), float(q[1]))
        key = (p, q)
        hit = self.cache.get(key)
        if hit is not None:
            return hit
        L = math.dist(p, q)
        res = []
        if L > 0:
            sb = (min(p[0], q[0]), min(p[1], q[1]), max(p[0], q[0]), max(p[1], q[1]))
            for i in self._near(self.grid, sb):
                kind, idx, nid, R, b = self.items[i]
                if b[2] < sb[0] or b[0] > sb[2] or b[3] < sb[1] or b[1] > sb[3] or self._side_reject(p, q, b):
                    continue
                iv = interior_intervals(p, q, R)
                if not iv:
                    continue
                if kind == 'hole':
                    cover = []
                    for cj in self._near(self.cgrid, sb):
                        cid, Rs, cb = self.cells[cj]
                        if cid == nid and len(Rs) > 1 and any(H is R for H in Rs[1:]):
                            continue
                        if cb[2] < sb[0] or cb[0] > sb[2] or cb[3] < sb[1] or cb[1] > sb[3]:
                            continue
                        c_iv = interior_intervals(p, q, Rs[0])
                        for H in Rs[1:]:
                            if c_iv:
                                c_iv = _subtract(c_iv, interior_intervals(p, q, H))
                        cover += c_iv
                    iv = _subtract(iv, cover)
                    zone_doors = self._near(self.dgrid, sb)
                else:
                    zone_doors = self.doors_by_host.get(nid, ())
                if iv and zone_doors:
                    cut = []
                    for di in zone_doors:
                        _, _, D, db = self.doors[di]
                        m = self.margin
                        if db[2] + m < sb[0] or db[0] - m > sb[2] or db[3] + m < sb[1] or db[1] - m > sb[3]:
                            continue
                        cut += zone_intervals(p, q, D, m)
                    iv = _subtract(iv, cut)
                for a, b2 in iv:
                    if (b2 - a) * L > EPS_LEN:
                        res.append((kind, idx, nid, a, b2, (b2 - a) * L))
        self.cache[key] = res
        return res

    def line(self, P):
        """All forbidden contacts of polyline P: list of (segment index, contact...)."""
        out = []
        for s, (a, b) in enumerate(zip(P, P[1:])):
            for h in self.segment(a, b):
                out.append((s,) + h)
        return out

    def ok(self, P):
        for a, b in zip(P, P[1:]):
            if self.segment(a, b):
                return False
        return True

    def cells_at(self, x, y):
        out = []
        for ci in self._near(self.cgrid, (x, y, x, y)):
            cid, Rs, b = self.cells[ci]
            if not (b[0] <= x <= b[2] and b[1] <= y <= b[3]):
                continue
            if interior_point(x, y, Rs[0]) and not any(interior_point(x, y, H) for H in Rs[1:]):
                out.append(cid)
        return out


def interior_point(x, y, R):
    h = False
    n = len(R)
    for i in range(n):
        x1, y1 = R[i]; x2, y2 = R[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            h = not h
    return h
