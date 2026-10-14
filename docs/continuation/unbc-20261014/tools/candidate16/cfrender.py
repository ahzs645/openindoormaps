"""Owner-facing floor-plan renderer for the UNBC candidate (style of the earlier plan-floor-*.png: render.py/combined.py).
Reads the slim outputs of derive-areas.mts (data/<mode>/level-<id>.json, records.json, walls-<id>.json).
Light: matplotlib + shapely only. CF_DATA / CF_OUT override the data and output directories."""
import json, math, os, re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from matplotlib.patches import PathPatch, Rectangle, Polygon as MPoly
from matplotlib.path import Path
from shapely.geometry import Polygon, MultiPolygon, box, GeometryCollection, LineString, MultiLineString
from shapely.geometry.polygon import orient
from shapely.ops import unary_union, polylabel
from shapely import make_valid
from shapely.strtree import STRtree
from shapely.prepared import prep

RUN = '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009'
DATA = os.environ.get('CF_DATA', RUN + '/candidate-floors-16/data')  # candidate-floors-9 copy
OUT = os.environ.get('CF_OUT', RUN + '/candidate-floors-16')
plt.rcParams['hatch.linewidth'] = 0.5
plt.rcParams['font.family'] = 'DejaVu Sans'
ROT = 0.2832500807584849  # plan-up to north, as in render.py

COL = {'circ': '#bfe3b4', 'nowalk': '#b4b4b4', 'office': '#f7d794', 'class': '#b9a8e3', 'wash': '#7fd0d6', 'store': '#dba98c', 'other': '#efe9dd', 'none': '#f6f6f6'}
LAB = {'circ': 'Public circulation, vestibules, ordinary stairs', 'nowalk': 'Non-walkable / shaft', 'office': 'Offices', 'class': 'Classrooms, labs, meeting', 'wash': 'Washrooms',
       'store': 'Storage, utility, mechanical', 'other': 'Other rooms', 'none': 'Selectable area with no room assigned'}
WALL = '#2a2a2a'
PURPLE = '#7b1fa2'; GREEN = '#1aa33a'; ORANGE = '#f08a00'; CHANGED = '#0a3cff'; REMOVED = '#555555'

LEVELS = [(2295121, '0', 'Floor 0 (Basement)'), (1450417, '0.5', 'Floor 0.5'), (311, '1', 'Floor 1 (Main)'), (1487816, '1.25', 'Floor 1.25'), (1425915, '1.5', 'Floor 1.5'),
          (694, '2', 'Floor 2'), (400176, '3', 'Floor 3'), (1487353, '3.5', 'Floor 3.5'), (402367, '4', 'Floor 4')]
NAME = {l: t for l, _, t in LEVELS}
SIG = 0.5  # sq ft: smallest area piece that counts as a change (ignores numerical slivers)


def classify_name(n):
    s = (n or '').lower()
    if re.search(r'wash|all gender|restroom|toilet|w\.?c\b|shower', s): return 'wash'
    if re.search(r'corridor|hallway|lobby|atrium|vestibule|circulation|rotunda|entrance|ramp|crosswalk|stair|alcove|open area|waiting|landing|walkway|foyer|lounge|concourse|bridge', s): return 'circ'
    if re.search(r'class|lab|lecture|seminar|meeting|study|pbl|exam|tutor|theatre|prep|computer|project|instrument|group|classrm|studio|library|reading', s): return 'class'
    if re.search(r'office|reception|counsel|ot office|work area|support|admin', s): return 'office'
    if re.search(r'stor|janitor|mech|elect|comm|print|copy|closet|file|equip|utili|sprink|kitchen|coffee|a,v|server|shaft|chase|garbage|recycl|loading|cage|custod', s): return 'store'
    return 'other'


def polys(g):
    if g is None or g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if hasattr(g, 'geoms'): return [p for x in g.geoms for p in polys(x)]
    return []


def poly_of(rings):
    rings = [r for r in rings if len(r) >= 3]
    if not rings: return None
    p = Polygon(rings[0], rings[1:])
    if not p.is_valid:  # outer minus holes semantics (production rings), not even-odd re-noding
        p = unary_union(polys(make_valid(p, method='structure')))
    return p if not p.is_empty else None


class Mode:
    def __init__(s, mode):
        s.mode = mode; s.dir = f'{DATA}/{mode}'
        s.rec = {r['key']: r for r in json.load(open(s.dir + '/records.json'))}
        s._lv = {}
    def level(s, lid):
        if lid not in s._lv: s._lv[lid] = Level(s, lid)
        return s._lv[lid]
    def has(s, lid): return os.path.exists(f'{s.dir}/level-{lid}.json')


class Level:
    def __init__(s, M, lid):
        s.M = M; s.lid = lid
        d = json.load(open(f'{M.dir}/level-{lid}.json'))
        s.meta = {k: v for k, v in d.items() if k != 'regions'}
        s.regions = []
        for g in d['regions']:
            if g['area'] < 0.05: continue
            geom = poly_of(g['rings'])
            if geom is None or geom.area < 0.05: continue
            g['geom'] = geom
            s.regions.append(g)
        s.walls = []
        wf = f'{M.dir}/walls-{lid}.json'
        if os.path.exists(wf):
            for w in json.load(open(wf)):
                p = poly_of(w['rings'])
                if p is not None: s.walls.append(p)
        s.tree = STRtree([g['geom'] for g in s.regions])
        s.union = unary_union([g['geom'] for g in s.regions])
    def rooms(s, g): return [s.M.rec[k] for k in g['roomKeys'] if k in s.M.rec]
    def numbers(s, g):
        return sorted({r['number'] for r in s.rooms(g) if r.get('number')})
    def cls(s, g):
        rooms = s.rooms(g)
        if not rooms: return 'none', False
        if all(r.get('walkable') is False for r in rooms): return 'nowalk', False
        dom = max(rooms, key=lambda r: r.get('area') or 0)
        if dom.get('stair') or dom.get('circulation') or dom['key'].startswith(('circulation:', 'landing:')): c = 'circ'
        else: c = classify_name(dom.get('name'))
        numbered = [r for r in rooms if r.get('number')]
        staff = bool(numbered) and all(r.get('access') == 'staff' for r in numbered)
        return c, staff
    def find(s, number):
        return [g for g in s.regions if number in s.numbers(g)]
    def total(s): return sum(g['area'] for g in s.regions)


# ---------------------------------------------------------------- comparison
def compare(B, C):
    """B, C: Level (before, candidate) of one native level. Returns the change layers."""
    res = {'split': [], 'merged': [], 'changed': [], 'newWalk': None, 'removed': None, 'separations': [], 'enclosed': []}
    nb = B.union; nc = C.union
    newwalk = [p for p in polys(nc.difference(nb)) if p.area >= SIG]
    removed = [p for p in polys(nb.difference(nc)) if p.area >= SIG]
    res['newWalk'] = unary_union(newwalk) if newwalk else None
    res['removed'] = unary_union(removed) if removed else None
    ov = {}  # (bi, ci) -> overlap area
    for ci, c in enumerate(C.regions):
        for bi in B.tree.query(c['geom']):
            bi = int(bi); a = B.regions[bi]['geom'].intersection(c['geom']).area
            if a >= max(SIG, 0.02 * min(B.regions[bi]['area'], c['area'])): ov[(bi, ci)] = a
    byB, byC = {}, {}
    for (bi, ci), a in ov.items():
        byB.setdefault(bi, []).append(ci); byC.setdefault(ci, []).append(bi)
    for bi, cis in byB.items():
        if len(cis) >= 2:
            b = B.regions[bi]
            inner = b['geom'].buffer(-0.03)
            lines = []
            for ci in cis:
                bd = C.regions[ci]['geom'].boundary.intersection(inner)
                if not bd.is_empty: lines.append(bd)
            res['separations'].append({'before': b, 'after': [C.regions[ci] for ci in cis], 'lines': unary_union(lines) if lines else None})
            res['split'].append({'before': b['id'], 'beforeNumbers': B.numbers(b), 'beforeArea': round(b['area'], 2),
                                 'after': [{'id': C.regions[ci]['id'], 'numbers': C.numbers(C.regions[ci]), 'area': round(C.regions[ci]['area'], 2)} for ci in cis]})
    for ci, bis in byC.items():
        c = C.regions[ci]
        # a merge needs two published areas that each contribute a real part (not slivers around columns or seams)
        bis = [bi for bi in bis if ov[(bi, ci)] >= max(5.0, 0.10 * B.regions[bi]['area'])]
        if len(bis) >= 2:
            res['merged'].append({'after': c, 'before': [B.regions[bi] for bi in bis]})
    # changed: geometry or room membership differs from the single best-matching before region
    for ci, c in enumerate(C.regions):
        bis = byC.get(ci, [])
        if not bis:
            res['changed'].append(c); res['enclosed'].append(c); continue
        best = max(bis, key=lambda bi: ov[(bi, ci)]); b = B.regions[best]
        sym = b['geom'].symmetric_difference(c['geom']).area
        if sym >= max(2.0, 0.01 * c['area']) or set(B.numbers(b)) != set(C.numbers(c)) or len(bis) > 1 or len(byB.get(best, [])) > 1:
            res['changed'].append(c)
    return res


# ---------------------------------------------------------------- drawing helpers
def path_of(geom, f=None):
    verts, codes = [], []
    for p in polys(geom):
        p = orient(p, 1.0)
        for ring in [p.exterior] + list(p.interiors):
            c = list(ring.coords)
            if f: c = [f(x, y) for x, y in c]
            verts += c; codes += [Path.MOVETO] + [Path.LINETO] * (len(c) - 2) + [Path.CLOSEPOLY]
    return Path(verts, codes) if verts else None


def lines_of(geom):
    if geom is None or geom.is_empty: return []
    if geom.geom_type == 'LineString': return [list(geom.coords)]
    if geom.geom_type == 'LinearRing': return [list(geom.coords)]
    if hasattr(geom, 'geoms'): return [l for g in geom.geoms for l in lines_of(g)]
    return []


class Canvas:
    def __init__(s, W, H):
        s.W, s.H = W, H
        s.fig = plt.figure(figsize=(W / 100, H / 100), dpi=100, facecolor='white')
        s.ax = s.fig.add_axes([0, 0, 1, 1]); s.ax.set_xlim(0, W); s.ax.set_ylim(0, H); s.ax.axis('off')
    def save(s, fn):
        s.fig.savefig(fn, dpi=100, facecolor='white'); plt.close(s.fig)


class Panel:
    """Plan window (feet) mapped onto a pixel rectangle (y up)."""
    def __init__(s, cv, win, rect, frame=True):
        s.cv = cv; s.ax = cv.ax
        x0, y0, x1, y1 = win; px0, py0, pw, ph = rect
        s.s = min(pw / (x1 - x0), ph / (y1 - y0))
        s.ox = px0 + (pw - (x1 - x0) * s.s) / 2; s.oy = py0 + (ph - (y1 - y0) * s.s) / 2
        s.win = win; s.winpoly = box(*win)
        s.clip = Rectangle((s.ox, s.oy), (x1 - x0) * s.s, (y1 - y0) * s.s, transform=s.ax.transData)
        if frame: s.ax.add_patch(Rectangle((s.ox, s.oy), (x1 - x0) * s.s, (y1 - y0) * s.s, fc='white', ec='#999', lw=0.6, zorder=0.5))
        s.placed = []; s.nlab = 0; s.nskip = 0
    def f(s, x, y): return (s.ox + (x - s.win[0]) * s.s, s.oy + (y - s.win[1]) * s.s)
    def add(s, patch, z):
        patch.set_zorder(z); s.ax.add_patch(patch); patch.set_clip_path(s.clip); return patch
    def fill(s, geom, z, **kw):
        if geom is None or geom.is_empty or not geom.intersects(s.winpoly): return
        p = path_of(geom, s.f)
        if p is not None: s.add(PathPatch(p, **kw), z)
    def lines(s, geom, z, **kw):
        if geom is None or geom.is_empty: return
        for l in lines_of(geom):
            xs, ys = zip(*[s.f(x, y) for x, y in l])
            ln, = s.ax.plot(xs, ys, zorder=z, solid_capstyle='round', **kw); ln.set_clip_path(s.clip)
    def text(s, x, y, txt, fs, z=7, **kw):
        t = s.ax.text(x, y, txt, fontsize=fs, ha='center', va='center', zorder=z, clip_on=True, linespacing=1.05,
                      path_effects=[pe.withStroke(linewidth=1.6, foreground='white', alpha=0.85)], **kw)
        t.set_clip_path(s.clip); return t


def draw_level(P, L, z=1, walls=True, alpha=1.0, edge='#7a7a7a', lw=0.3, staff_hatch=True, faded=False):
    for g in L.regions:
        if not g['geom'].intersects(P.winpoly): continue
        c, staff = L.cls(g)
        fc = COL[c]
        if faded:
            P.fill(g['geom'], z, fc=fc, ec='#bdbdbd', lw=lw, alpha=0.38)
        else:
            P.fill(g['geom'], z, fc=fc, ec=edge, lw=lw, alpha=alpha)
            if staff and staff_hatch: P.fill(g['geom'], z + 0.05, fc='none', ec='#6a6a6a', lw=0, hatch='////', alpha=alpha)
    if walls:
        wz = z + 0.5
        for w in L.walls:
            if w.intersects(P.winpoly): P.fill(w, wz, fc=WALL, ec=WALL, lw=0.2, alpha=(0.55 if faded else 0.92))


def wrap_items(items, per):
    return [' · '.join(items[i:i + per]) for i in range(0, len(items), per)]


def place_labels(P, L, regions=None, sizes=(7.0, 6.4, 5.8, 5.2, 4.7), bold=(), maxlines=6, slack_px=2.5, color='#111'):
    """Label each region with all its room numbers where the label fits inside the region (no overlap)."""
    cand = []
    for g in (regions if regions is not None else L.regions):
        nums = L.numbers(g)
        if not nums or not g['geom'].intersects(P.winpoly): continue
        cand.append((g['area'], g, nums))
    cand.sort(key=lambda t: -t[0])
    for area, g, nums in cand:
        geom = g['geom'].intersection(P.winpoly)
        parts = polys(geom)
        if not parts: continue
        part = max(parts, key=lambda p: p.area)
        try: anchor = polylabel(part, tolerance=max(0.05, math.sqrt(part.area) / 50))
        except Exception: anchor = part.representative_point()
        slack = slack_px / P.s
        region_ok = prep(part.buffer(slack, join_style=2))
        done = False
        n = len(nums)
        pers = sorted({math.ceil(n / k) for k in range(1, min(n, max(maxlines, math.ceil(n / 6))) + 1)}, reverse=True)
        for fs in sizes:
            cw = fs * 0.61 * 100 / 72; lh = fs * 1.2 * 100 / 72
            if (min(len(x) for x in nums) * cw) / P.s > max(part.bounds[2] - part.bounds[0], part.bounds[3] - part.bounds[1]) + 2 * slack: continue
            for per in pers:
                lines = wrap_items(nums, per)
                for rot in (0, 90):
                    wpx = max(len(l) for l in lines) * cw + 2; hpx = len(lines) * lh
                    if rot: wpx, hpx = hpx, wpx
                    wf, hf = wpx / P.s, hpx / P.s
                    bx = box(anchor.x - wf / 2, anchor.y - hf / 2, anchor.x + wf / 2, anchor.y + hf / 2)
                    if not region_ok.contains(bx): continue
                    cx, cy = P.f(anchor.x, anchor.y)
                    pb = (cx - wpx / 2, cy - hpx / 2, cx + wpx / 2, cy + hpx / 2)
                    if any(not (pb[2] < q[0] or pb[0] > q[2] or pb[3] < q[1] or pb[1] > q[3]) for q in P.placed): continue
                    P.placed.append(pb)
                    P.text(cx, cy, '\n'.join(lines), fs, rotation=rot, color=color, fontweight=('bold' if g['id'] in bold else 'normal'))
                    P.nlab += 1; done = True; break
                if done: break
            if done: break
        if not done: P.nskip += 1


def north_arrow(ax, cx, cy, L=40):
    dx, dy = math.sin(ROT) * L, math.cos(ROT) * L
    ax.add_patch(MPoly([(cx + dx, cy + dy), (cx - dy * 0.28 - dx * 0.1, cy + dx * 0.28 - dy * 0.1), (cx, cy), (cx + dy * 0.28 - dx * 0.1, cy - dx * 0.28 - dy * 0.1)], closed=True, fc='#222', ec='#222', lw=0.8, zorder=9))
    ax.text(cx + dx * 1.3, cy + dy * 1.3, 'N', fontsize=12, fontweight='bold', ha='center', va='center', zorder=9)
    ax.text(cx, cy - 16, 'north (about 16° east of plan-up)', fontsize=6.5, ha='center', va='top', color='#444')


def scale_bar(ax, x, y, s, maxpx=220):
    FT = 0.3048
    mlen = max([m for m in [1, 2, 5, 10, 20, 25, 50, 100] if m / FT * s <= maxpx] or [1]); flen = max([f for f in [5, 10, 20, 25, 50, 100, 200] if f * s <= maxpx] or [5])
    ax.add_patch(Rectangle((x - 8, y - 6), max(mlen / FT * s, flen * s) + 56, 76, fc='white', ec='#bbb', lw=0.5, alpha=0.9, zorder=8.5))
    for i, (L, lab) in enumerate([(mlen / FT * s, f'{mlen} m'), (flen * s, f'{flen} ft')]):
        yy = y + i * 24
        for k in range(4): ax.add_patch(Rectangle((x + L / 4 * k, yy), L / 4, 6, fc='#222' if k % 2 == 0 else 'white', ec='#222', lw=0.7, zorder=9))
        ax.text(x + L + 6, yy + 3, lab, fontsize=8, va='center', zorder=9)
        ax.text(x, yy + 9, '0', fontsize=6.5, va='bottom', ha='center', zorder=9)
    ax.text(x, y + 54, 'Scale (true scale)', fontsize=7.5, color='#333', va='bottom', zorder=9)


def legend(ax, x, ytop, types, extra=(), colw=330, rows=6, fs=8.3, title='Legend'):
    """Grid legend in the header band. extra: (kind, colour, text) with kind fill|outline|line|hatch|wall."""
    ax.text(x, ytop, title, fontsize=10.5, fontweight='bold', va='top')
    items = [('fill', COL[k], LAB[k]) for k in ['circ', 'nowalk', 'office', 'class', 'wash', 'store', 'other', 'none'] if k in types]
    items += [('hatch', '#666', 'Staff-only area (hatched)'), ('wall', WALL, 'Walls and columns')] + list(extra)
    y0 = ytop - 24
    for i, (kind, col, txt) in enumerate(items):
        cx = x + (i // rows) * colw; cy = y0 - (i % rows) * 20
        if kind == 'fill': ax.add_patch(Rectangle((cx, cy - 11), 24, 13, fc=col, ec='#777', lw=0.5))
        elif kind == 'hatch':
            ax.add_patch(Rectangle((cx, cy - 11), 24, 13, fc='white', ec='#666', lw=0, hatch='////')); ax.add_patch(Rectangle((cx, cy - 11), 24, 13, fc='none', ec='#777', lw=0.5))
        elif kind == 'wall': ax.add_patch(Rectangle((cx, cy - 7), 24, 5, fc=col, ec=col, lw=0.3))
        elif kind == 'outline': ax.add_patch(Rectangle((cx, cy - 11), 24, 13, fc='none', ec=col, lw=2.2))
        elif kind == 'fillalpha': ax.add_patch(Rectangle((cx, cy - 11), 24, 13, fc=col, ec=col, lw=1.0, alpha=0.6))
        elif kind == 'line': ax.plot([cx, cx + 24], [cy - 4, cy - 4], color=col, lw=3.0, solid_capstyle='round')
        elif kind == 'removed': ax.add_patch(Rectangle((cx, cy - 11), 24, 13, fc='white', ec=col, lw=0.8, hatch='xxxx'))
        ax.text(cx + 32, cy - 4, txt, fontsize=fs, va='center')
    return y0 - rows * 20


CHANGE_LEGEND = [('line', PURPLE, 'New separation (boundary that did not exist before)'), ('fillalpha', GREEN, 'Newly walkable / selectable floor'),
                 ('fillalpha', ORANGE, 'Newly merged area (joins areas that were separate)'), ('outline', CHANGED, 'Changed area (shape or rooms differ)'),
                 ('removed', REMOVED, 'No longer selectable (was selectable before)')]


def draw_changes(P, B, C, ch, z=10, lw=1.0):
    if ch['removed'] is not None: P.fill(ch['removed'], z, fc='white', ec=REMOVED, lw=0.6 * lw, hatch='xxxx', alpha=0.9)
    if ch['newWalk'] is not None: P.fill(ch['newWalk'], z + 0.1, fc=GREEN, ec=GREEN, lw=0.8 * lw, alpha=0.55)
    for m in ch['merged']: P.fill(m['after']['geom'], z + 0.2, fc=ORANGE, ec=ORANGE, lw=1.6 * lw, alpha=0.42)
    for c in ch['changed']: P.fill(c['geom'], z + 0.3, fc='none', ec=CHANGED, lw=1.5 * lw)
    for m in ch['merged']:  # old boundaries that disappeared inside a merged area: thin dashed orange
        for b in m['before']:
            P.lines(b['geom'].boundary.intersection(m['after']['geom'].buffer(-0.03)), z + 0.35, color='#a35a00', lw=0.8 * lw, ls=(0, (2, 2)))
    for sp in ch['separations']: P.lines(sp['lines'], z + 0.4, color=PURPLE, lw=2.6 * lw)


def plan_window(geoms, m=12):
    u = unary_union([g for g in geoms if g is not None])
    x0, y0, x1, y1 = u.bounds
    return (x0 - m, y0 - m, x1 + m, y1 + m)


def near_walls(L, d=6.0):
    if not L.walls or not L.regions: return []
    keep = []
    for w in L.walls:
        if len(L.tree.query(w, predicate='dwithin', distance=d)): keep.append(w)
    return keep


def used_types(Ls):
    t = set()
    for L in Ls:
        for g in L.regions: t.add(L.cls(g)[0])
    return t
