"""Per-floor 'now' and 'changes' plans, the combined 4-level Floor 1 view, close-ups and summary.json.
python3 floors.py [floors] [combined] [closeups] [summary]   (default: all)"""
import sys, json, os, math
sys.path.insert(0, os.path.dirname(__file__))
from cfrender import *

BEFORE = Mode('before'); CAND = Mode('candidate')
BUILD_NOW = 'Candidate 3: candidate 2 + 15 regression rows + Q3.9 re-bound + Q6.2 line (rooms 656ad79e; code = OIM 110920b / reviter 2186333; routing off)'
BUILD_CMP = 'Candidate 3 vs published master 73f7c95e'
_cmp = {}
def cmpl(lid):
    if lid not in _cmp: _cmp[lid] = compare(BEFORE.level(lid), CAND.level(lid))
    return _cmp[lid]

def header(cv, title, sub, sub2, types, extra, s, W, H, HB):
    ax = cv.ax
    ax.text(20, H - 18, title, fontsize=20, fontweight='bold', va='top')
    ax.text(20, H - 52, sub, fontsize=11.5, color='#8a1a1a', va='top')
    ax.text(20, H - 72, sub2, fontsize=8.6, color='#444', va='top')
    legend(ax, 20, H - 96, types, extra, colw=345, rows=5)
    north_arrow(ax, W - 340, H - HB + 80, L=42)
    scale_bar(ax, W - 250, H - HB + 40, s, maxpx=180)

def floor_image(lid, slug, title, kind):
    B = BEFORE.level(lid); C = CAND.level(lid)
    win = plan_window([C.union, B.union] + ([CAND.level(ctx0).union] if (ctx0 := {1425915: 311, 1487353: 400176}.get(lid)) and CAND.has(ctx0) else []))
    W = 2000; HB = 220; pad = 20
    pw = W - 2 * pad
    s = min(pw / (win[2] - win[0]), 3600 / (win[3] - win[1]))
    ph = (win[3] - win[1]) * s
    H = int(ph + HB + 2 * pad)
    cv = Canvas(W, H)
    P = Panel(cv, win, (pad, pad, pw, H - HB - 2 * pad))
    C.walls = near_walls(C)
    ch = cmpl(lid)
    ctx = {1425915: 311, 1487353: 400176}.get(lid)
    if ctx and CAND.has(ctx):
        for w in near_walls(CAND.level(ctx)): P.fill(w, 0.8, fc='#d6d6d6', ec='#d6d6d6', lw=0.2)
    if kind == 'now':
        draw_level(P, C)
        place_labels(P, C, sizes=(9.0, 8.0, 7.0, 6.4, 5.8, 5.2, 4.7))
        n = len(C.regions); nm = sum(1 for g in C.regions if len(C.numbers(g)) >= 2)
        sub2 = (f'Each selectable area is filled by use and labelled with all of its room numbers (labels hidden where they do not fit: {P.nskip}; see the close-ups). '
                f'{n} selectable areas, {C.total():,.0f} sq ft; {nm} hold more than one room number.')
        if ctx: sub2 += f' Light grey: walls of {NAME[ctx]} for context.'
        header(cv, f'{title}  -  now', BUILD_NOW, sub2, used_types([C]), [], P.s, W, H, HB)
        fn = f'{OUT}/floor-{slug}-now.png'
    else:
        draw_level(P, C, faded=True)
        draw_changes(P, B, C, ch)
        bold = {c['id'] for c in ch['changed']}
        place_labels(P, C, regions=ch['changed'], bold=bold)
        nw = ch['newWalk'].area if ch['newWalk'] is not None else 0; rm = ch['removed'].area if ch['removed'] is not None else 0
        sub2 = (f'Faded fills: the candidate. {len(ch["split"])} published areas split, {len(ch["merged"])} candidate areas merge published areas, '
                f'{len(ch["changed"])} areas changed, {nw:,.0f} sq ft newly walkable, {rm:,.0f} sq ft no longer selectable. Labels: changed areas only.')
        header(cv, f'{title}  -  changes', BUILD_CMP, sub2, used_types([C]), CHANGE_LEGEND, P.s, W, H, HB)
        fn = f'{OUT}/floor-{slug}-changes.png'
    cv.save(fn)
    print(os.path.basename(fn), W, H, 'labels', P.nlab, 'hidden', P.nskip, flush=True)
    return fn

# ---------------------------------------------------------------- combined Floor 1
LV4 = [(1450417, 'Floor 0.5', '#00897b', '-'), (1487816, 'Floor 1.25', '#8e24aa', '-'), (1425915, 'Floor 1.5', '#8d5524', (0, (4, 2))), (311, 'Floor 1 (Main)', '#222222', '-')]
def combined(kind):
    Ls = {lid: CAND.level(lid) for lid, *_ in LV4}
    Bs = {lid: BEFORE.level(lid) for lid, *_ in LV4}
    win = plan_window([L.union for L in Ls.values()] + [L.union for L in Bs.values()])
    W = 2000; HB = 250; pad = 20; pw = W - 2 * pad
    s = min(pw / (win[2] - win[0]), 3600 / (win[3] - win[1])); H = int((win[3] - win[1]) * s + HB + 2 * pad)
    cv = Canvas(W, H); P = Panel(cv, win, (pad, pad, pw, H - HB - 2 * pad))
    main = Ls[311]
    for i, (lid, nm, col, ls) in enumerate(LV4):
        L = Ls[lid]; z = 1 + i * 2
        if kind == 'now':
            for g in L.regions:
                c, staff = L.cls(g)
                P.fill(g['geom'], z, fc=COL[c], ec=col, lw=0.7, ls=ls, alpha=(0.9 if lid == 311 else 0.6))
                if staff: P.fill(g['geom'], z + 0.05, fc='none', ec='#666', lw=0, hatch='////', alpha=0.8)
        else:
            for g in L.regions: P.fill(g['geom'], z, fc=COL[L.cls(g)[0]], ec=col, lw=0.5, ls=ls, alpha=0.3)
        if lid == 311:
            for w in near_walls(L): P.fill(w, z + 0.5, fc=WALL, ec=WALL, lw=0.2, alpha=0.85)
    if kind == 'changes':
        for i, (lid, *_r) in enumerate(LV4): draw_changes(P, Bs[lid], Ls[lid], cmpl(lid), z=20 + i)
        for lid, *_r in reversed(LV4):
            ch = cmpl(lid); L = Ls[lid]
            regs = ch['changed'] if lid == 311 else [g for g in ch['changed'] if g['geom'].difference(main.union).area > 0.6 * g['area']]
            place_labels(P, L, regions=regs, bold={g['id'] for g in regs})
    else:
        place_labels(P, main)
        for lid in (1487816, 1450417, 1425915):
            L = Ls[lid]
            place_labels(P, L, regions=[g for g in L.regions if g['geom'].difference(main.union).area > 0.6 * g['area']], color='#333')
    ax = cv.ax
    ttl = 'Floor 1 - combined 4 levels (Floor 0.5, Main, 1.25, 1.5)  -  ' + kind
    ax.text(20, H - 18, ttl, fontsize=19, fontweight='bold', va='top')
    ax.text(20, H - 52, BUILD_NOW if kind == 'now' else BUILD_CMP, fontsize=11.5, color='#8a1a1a', va='top')
    ax.text(20, H - 72, 'All four levels of the app\'s "Floor 1" scope in the same coordinates, drawn bottom to top: 0.5, 1.25, 1.5, then Main (90% opaque; lower levels 60%). Outline colour = level. Walls: Main only.'
            + ('' if kind == 'now' else ' Change marks are drawn for all four levels.'), fontsize=8.6, color='#444', va='top')
    y = H - 96
    ax.text(20, y, 'Levels (outline)', fontsize=10.5, fontweight='bold', va='top')
    for i, (lid, nm, col, ls) in enumerate(LV4):
        cy = y - 24 - i * 20
        ax.add_patch(Rectangle((20, cy - 11), 24, 13, fc='#f4f4f4', ec=col, lw=1.8, ls=ls)); ax.text(52, cy - 4, nm, fontsize=8.3, va='center')
    types = used_types(list(Ls.values()))
    legend(ax, 260, y, types, CHANGE_LEGEND if kind == 'changes' else [], colw=345, rows=6)
    north_arrow(ax, W - 340, H - HB + 80, L=42); scale_bar(ax, W - 250, H - HB + 40, P.s, maxpx=180)
    fn = f'{OUT}/floor-1-combined-4-levels-{kind}.png'; cv.save(fn); print(os.path.basename(fn), W, H, 'hidden', P.nskip, flush=True)

# ---------------------------------------------------------------- close-ups
def win_for(levels_numbers, m=14, minw=40):
    bb = [r['bbox'] for M in (CAND, BEFORE) for r in M.rec.values() if r.get('bbox') and r.get('number') in {n for _, ns in levels_numbers for n in ns}]
    if not bb: return None
    x0 = min(b[0] for b in bb); y0 = min(b[1] for b in bb); x1 = max(b[2] for b in bb); y1 = max(b[3] for b in bb)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; w = max(x1 - x0 + 2 * m, minw); h = max(y1 - y0 + 2 * m, minw)
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)

_DW = {}
def dwg_lines(lid):
    if lid not in _DW:
        f = f'{RUN}/shared-extracts/dwg/registered-sections-level-{lid}.json'; W_, D_ = [], []
        if os.path.exists(f):
            for sec in json.load(open(f))['sections']: W_ += sec.get('wallSegments', []); D_ += sec.get('doorSegments', [])
        from shapely.geometry import LineString
        _DW[lid] = ([LineString(w) for w in W_ if len(w) >= 2], [LineString(w) for w in D_ if len(w) >= 2])
    return _DW[lid]

def closeup(fname, title, note, cols, win=None, W=1800, dwg=False):
    """cols: list of (lid, level title) -> one row per level; columns: published | now with changes."""
    HB = 175; pad = 16; gap = 16; lab = 26
    pw = (W - 2 * pad - gap) / 2
    s = pw / (win[2] - win[0]); ph = (win[3] - win[1]) * s
    if ph > 1100: ph = 1100
    n = len(cols)
    H = int(HB + n * (ph + lab + gap) + pad)
    cv = Canvas(W, H); ax = cv.ax
    for i, (lid, ctitle) in enumerate(cols):
        y = pad + (n - 1 - i) * (ph + lab + gap)
        B = BEFORE.level(lid); C = CAND.level(lid); ch = cmpl(lid)
        for col, labtxt in enumerate(['Published master 73f7c95e', 'Now (candidate 2) with changes marked']):
            x = pad + col * (pw + gap)
            P = Panel(cv, win, (x, y, pw, ph))
            if col == 0:
                draw_level(P, B); place_labels(P, B, sizes=(9.5, 8.5, 7.5, 6.5, 5.6))
            else:
                draw_level(P, C, alpha=0.8); draw_changes(P, B, C, ch, lw=1.4)
                place_labels(P, C, sizes=(9.5, 8.5, 7.5, 6.5, 5.6), bold={c['id'] for c in ch['changed']})
            if dwg:
                from shapely.geometry import box as _box
                wb = _box(*win); Wl, Dl = dwg_lines(lid)
                for ln in Wl:
                    if ln.intersects(wb): P.lines(ln, 8, color='#e040fb', lw=0.9, ls=(0, (3, 2)))
                for ln in Dl:
                    if ln.intersects(wb): P.lines(ln, 8, color='#8d6e63', lw=0.9)
            ax.text(P.ox, P.oy + (win[3] - win[1]) * P.s + 5, f'{ctitle}  -  {labtxt}', fontsize=10.5, fontweight='bold', va='bottom')
            if col == 1 and i == n - 1: scale_bar(ax, P.ox + (win[2] - win[0]) * P.s - 190, P.oy + 10, P.s, maxpx=110)
    ax.text(pad, H - 14, title, fontsize=17, fontweight='bold', va='top')
    ax.text(pad, H - 44, note, fontsize=9, color='#333', va='top')
    legend(ax, pad, H - 66, {'circ', 'office', 'class', 'wash', 'store', 'other', 'none', 'nowalk'}, CHANGE_LEGEND, colw=345, rows=4, fs=7.8, title='')
    north_arrow(ax, W - 70, H - 125, L=34)
    fn = f'{OUT}/closeups/{fname}.png'; cv.save(fn); print('closeup', fname, W, H, flush=True)

def closeups():
    os.makedirs(OUT + '/closeups', exist_ok=True)
    specs = json.load(open(os.path.dirname(__file__) + '/closeups.json'))
    for sp in specs:
        win = sp.get('window') or win_for([(c['level'], sp['numbers']) for c in sp['cols']], m=sp.get('margin', 14), minw=sp.get('minw', 40))
        if win is None: print('closeup', sp['file'], 'no rooms found'); continue
        closeup(sp['file'], sp['title'], sp['note'], [(c['level'], c['title']) for c in sp['cols']], win=win, dwg=bool(sp.get('dwg')))

# ---------------------------------------------------------------- summary
INTENTIONAL = [{'05-157', '05-150', '05-150A'}, {'03-014', '03-013'}, {'07-304', '07-305', '07-306A'}, {'09-271', '09-272'}, {'07-145', '07-148', '07-148A', '07-148B'}]
def level_summary(lid):
    B = BEFORE.level(lid); C = CAND.level(lid); ch = cmpl(lid)
    sing = lambda L: {L.numbers(g)[0] for g in L.regions if len(L.numbers(g)) == 1}
    sb, sc = sing(B), sing(C)
    newly = sorted(sc - sb)
    def realrooms(L, g):
        return [r for r in L.rooms(g) if r.get('number') and not (r.get('circulation') or r.get('stair') or classify_name(r.get('name')) == 'circ')]
    still = []
    for g in C.regions:
        rr = realrooms(C, g)
        nums = sorted({r['number'] for r in rr})
        if len(nums) < 2: continue
        if any(set(nums) <= s for s in INTENTIONAL): continue
        still.append({'numbers': nums, 'names': sorted({r.get('name') or '' for r in rr}), 'area': round(g['area'], 1), 'allNumbers': C.numbers(g)})
    still.sort(key=lambda x: (-len(x['numbers']), x['numbers']))
    return {
        'levelId': lid, 'name': NAME[lid],
        'totalSelectableSqFt': {'before': round(B.total(), 1), 'after': round(C.total(), 1), 'delta': round(C.total() - B.total(), 1)},
        'selectableAreas': {'before': len(B.regions), 'after': len(C.regions)},
        'newlyWalkableSqFt': round(ch['newWalk'].area, 1) if ch['newWalk'] is not None else 0,
        'noLongerSelectableSqFt': round(ch['removed'].area, 1) if ch['removed'] is not None else 0,
        'split': ch['split'],
        'merged': [{'after': {'id': m['after']['id'], 'numbers': C.numbers(m['after']), 'area': round(m['after']['area'], 2)}, 'before': [{'id': b['id'], 'numbers': B.numbers(b), 'area': round(b['area'], 2)} for b in m['before']]} for m in ch['merged']],
        'newlyEnclosed': newly,
        'newlyEnclosedNote': 'Room numbers that now have a selectable area of their own and did not in the published master.',
        'lostOwnArea': sorted(sb - sc),
        'changedAreas': len(ch['changed']),
        'stillMergedProbablyShouldNotBe': still,
        'stillMergedNote': 'Heuristic: candidate areas holding two or more numbered non-circulation rooms, minus the owner-approved shared spaces (05-157/150/150A, 03-013/014, 07-304/305/306A, 09-271/272, 07-145/148 suite). Includes intentional suites; each needs a disposition.',
        'logicalPartitions': {'applied': C.meta.get('logicalPartitionIds', []), 'omitted': [{'id': o['id'], 'errors': o.get('errors', [])[:2]} for o in C.meta.get('omittedLogicalPartitions', [])]},
        'beforeLogicalPartitions': {'applied': B.meta.get('logicalPartitionIds', []), 'omitted': [o['id'] for o in B.meta.get('omittedLogicalPartitions', [])]},
    }

if __name__ == '__main__':
    what = sys.argv[1:] or ['floors', 'combined', 'closeups', 'summary']
    levels = [l for l in LEVELS if BEFORE.has(l[0]) and CAND.has(l[0])]
    if 'floors' in what:
        for lid, slug, title in levels:
            for k in ('now', 'changes'): floor_image(lid, slug, title, k)
    if 'combined' in what:
        for k in ('now', 'changes'): combined(k)
    if 'closeups' in what: closeups()
    if 'summary' in what:
        out = {'levels': [level_summary(lid) for lid, *_ in levels]}
        json.dump(out, open(OUT + '/data/summary-levels.json', 'w'), indent=1)
        print('summary levels', len(out['levels']))
