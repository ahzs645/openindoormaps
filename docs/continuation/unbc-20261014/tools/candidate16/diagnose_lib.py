"""Light diagnosis of the 'door without selection closure' leak locations and the ROOM_CORRIDOR_DOOR flags.
Inputs: candidate-floors/leaks.json, candidate-floors/data/candidate/*, fix-doors/extract/candidate-doors.json
(door-focused extract of data/candidate/dataset-prepared.json, scripts/extract.mjs).
For each unique leak location and each native door near it, measures where the selectable area crosses the
door's measured normal band: through the footprint (door not masked), beside the footprint (tangent gap to the
jamb) or not at all (the leak is elsewhere). Shared loaders."""
import sys, os, json, math
sys.path.insert(0, '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009/candidate-floors-16/scripts')  # candidate-floors-9 copy
from cfrender import RUN, Mode, poly_of, polys
from shapely.geometry import Polygon, Point, LineString, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

CF = os.environ.get('CF_OUT', RUN + '/candidate-floors-16'); FD = CF
L = json.load(open(CF + '/leaks.json'))
X = json.load(open(CF + '/data/extract/candidate-doors.json'))
C = Mode('candidate')
thr = {(d['levelId'], d['nativeElementId']): d for d in X['selectionDoorThresholds']['doors']}
clo = {(d['levelId'], d['nativeElementId']): d for d in X['nativeDoorBoundaryClosures']['doors']}
doors = {}
for d in X['doors']: doors.setdefault(d['nativeElementId'], []).append(d)
edges = {}
for e in X['edges']:
    if e.get('kind') == 'door': edges.setdefault(e['id'], []).append(e)
walls = {}
for w in X['walls']:
    p = poly_of(w['ringsFeet'][0] if w['ringsFeet'] and isinstance(w['ringsFeet'][0][0][0], list) else w['ringsFeet'])
    if p is not None: walls.setdefault(w['levelId'], []).append((w, p))
wtree = {lid: STRtree([p for _, p in v]) for lid, v in walls.items()}
rec = C.rec
DWG = RUN + '/shared-extracts/dwg'
_dwg = {}
def dwg(lid):
    if lid not in _dwg:
        f = f'{DWG}/registered-sections-level-{lid}.json'; W, D = [], []
        if os.path.exists(f):
            for s in json.load(open(f))['sections']: W += s.get('wallSegments', []); D += s.get('doorSegments', [])
        W = [LineString(w) for w in W if len(w) >= 2]; D = [LineString(w) for w in D if len(w) >= 2]
        _dwg[lid] = (W, STRtree(W) if W else None, D, STRtree(D) if D else None)
    return _dwg[lid]
def dwg_near(lid, g, which):
    W, WT, D, DT = dwg(lid); Ls, T = (W, WT) if which == 'wall' else (D, DT)
    return [] if T is None else [Ls[int(i)] for i in T.query(g, predicate='intersects')]

def axes(d):
    n = d['normalFeet']; h = math.hypot(*n); n = (n[0] / h, n[1] / h); t = (-n[1], n[0]); return t, n
def proj(pts, u): v = [p[0] * u[0] + p[1] * u[1] for p in pts]; return min(v), max(v)
def rect(t, n, a0, a1, b0, b1):
    at = lambda a, b: (t[0] * a + n[0] * b, t[1] * a + n[1] * b)
    return Polygon([at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)])

def door_band(lid, d, A):
    """Crossings of area A through the door's normal band within +-3 ft of the footprint ends."""
    t, n = axes(d); fp = Polygon(d['footprintFeet'])
    tb = proj(d['footprintFeet'], t); nb = proj(d['footprintFeet'], n)
    eps = 1e-4
    band = rect(t, n, tb[0] - 3, tb[1] + 3, nb[0] + eps, nb[1] - eps)
    lo_edge = LineString([band.exterior.coords[0], band.exterior.coords[1]]); hi_edge = LineString([band.exterior.coords[2], band.exterior.coords[3]])
    out = []
    for P in polys(A.intersection(band)):
        if P.area < 1e-6: continue
        if P.distance(lo_edge) < 1e-6 and P.distance(hi_edge) < 1e-6:
            pt = proj(list(P.exterior.coords), t)
            where = 'through footprint' if pt[1] > tb[0] + 1e-3 and pt[0] < tb[1] - 1e-3 else ('beside end ' + ('A' if pt[1] <= tb[0] + 1e-3 else 'B'))
            gap = None
            if where.startswith('beside'):
                gap = (tb[0] - pt[0]) if where.endswith('A') else (pt[1] - tb[1])
                # gap measured from the footprint end to the far side of the crossing piece (towards the jamb)
            out.append({'where': where, 'tangentSpanFeet': [round(pt[0] - tb[0], 4), round(pt[1] - tb[0], 4)], 'pieceWidthFeet': round(pt[1] - pt[0], 4), 'gapFromEndFeet': None if gap is None else round(gap, 4), 'area': round(P.area, 4)})
    # tangent distance from each footprint end to nearest wall material along the door line (data.walls, slim)
    jambs = []
    for side, (a0, a1) in (('A', (tb[0] - 1.0, tb[0])), ('B', (tb[1], tb[1] + 1.0))):
        probe = rect(t, n, a0, a1, nb[0] + 0.02, nb[1] - 0.02)
        best = None
        if lid in wtree:
            for i in wtree[lid].query(probe, predicate='intersects'):
                w, wp = walls[lid][int(i)]
                inter = wp.intersection(probe)
                if inter.is_empty: continue
                pt = proj([c for q in polys(inter) for c in q.exterior.coords], t)
                gap = (tb[0] - pt[1]) if side == 'A' else (pt[0] - tb[1])
                if best is None or gap < best[0]: best = (gap, w['nativeElementId'], w['kind'], bool(w.get('reviewPatchId')))
        jambs.append({'side': side, 'gapFeet': None if best is None else round(max(best[0], 0), 5), 'overlap': None if best is None else best[0] < 0, 'wall': None if best is None else best[1], 'kind': None if best is None else best[2], 'patched': None if best is None else best[3]})
    return {'tb': [round(tb[0], 4), round(tb[1], 4)], 'widthFeet': round(tb[1] - tb[0], 4), 'depthFeet': round(nb[1] - nb[0], 4), 'overlapArea': round(A.intersection(fp).area, 5), 'crossings': out, 'jambs': jambs}

