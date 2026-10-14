"""Light. Owner-question pictures from whole-level derived selection areas (candidate-9 data/candidate): for each card the listed
rooms are framed (all their outlines + margin); the selectable region that joins them is filled strongly, other regions pale; native
walls dark, door footprints brown, registered DWG walls magenta dashed, DWG door lines orange. The OPENINGS are drawn as red lines:
the parts of each listed room's outline that run through the joined region's open floor (not within 0.15 ft of a wall/door piece).
Each opening is reported with its length, whether a door footprint lies on it, and whether a DWG wall line runs along it.
Floats only locate and illustrate.  usage: python3 -I render_cards.py <cards.json> <out-dir>"""
import json, sys, collections, math
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.geometry import Polygon, LineString, box, MultiLineString
from shapely.ops import unary_union, linemerge
from shapely import make_valid
RUN = '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009'
C = __import__('os').environ.get('CARD_DATA', RUN + '/candidate-floors-9/data/candidate/')
CARDS, OUT = json.load(open(sys.argv[1])), sys.argv[2]
recs = json.load(open(C + 'records.json')); outl = {o['key']: o for o in json.load(open(C + 'record-outlines.json'))}
num = {r['key']: r.get('number') for r in recs}; name = {r['key']: r.get('name') or '' for r in recs}
doors = json.load(open(C + 'doors.json'))
def poly(rings):
    if isinstance(rings[0][0], (int, float)): return make_valid(Polygon(rings))
    if isinstance(rings[0][0][0], (int, float)): return make_valid(Polygon(rings[0], rings[1:]))
    return unary_union([make_valid(Polygon(r[0], r[1:])) for r in rings])
cache = {}
def level(lid):
    if lid not in cache:
        L = json.load(open(C + f'level-{lid}.json')); W = json.load(open(C + f'walls-{lid}.json'))
        S = json.load(open(RUN + f'/shared-extracts/dwg/registered-sections-level-{lid}.json'))['sections']
        regs = [(r, poly(r['rings'])) for r in L['regions'] if r['area'] > 0.5]
        walls = [(w, poly(w['rings'])) for w in W]
        dw = [s for sec in S for s in sec.get('wallSegments', [])]; dd = [s for sec in S for s in sec.get('doorSegments', [])]
        cache[lid] = (regs, walls, dw, dd, [d for d in doors if d['levelId'] == lid])
    return cache[lid]
def parts(g): return [] if g.is_empty else list(getattr(g, 'geoms', [g]))
report = []
for card in CARDS:
    lid = card['levelId']; regs, walls, dw, dd, ds = level(lid)
    keys = [k for k in outl if outl[k]['levelId'] == lid and num.get(k) in card['rooms']]
    ol = {k: poly(outl[k]['outline']) for k in keys}
    focus = unary_union(list(ol.values()))
    joined = [(r, g) for r, g in regs if sum(1 for k in r['roomKeys'] if k in ol) >= 1 and len(set(r['roomKeys'])) >= 2 and any(k in ol for k in r['roomKeys'])]
    # the region(s) that join two or more listed rooms, or a listed room with others
    J = unary_union([g for r, g in joined]) if joined else Polygon()
    x0, y0, x1, y1 = focus.bounds; m = max(6, 0.12 * max(x1 - x0, y1 - y0))
    view = box(x0 - m, y0 - m, x1 + m, y1 + m)
    bar = unary_union([g for w, g in walls if g.intersects(view)] + [poly(d['footprint']) for d in ds if d.get('footprint') and poly(d['footprint']).intersects(view)])
    CIRC = ('Corridor', 'Stair', 'Hallway', 'Lobby', 'Vestibule', 'Alcove', 'Common Area', 'Elevator', 'Entrance')
    circ = lambda k: any(c.lower() in name[k].lower() for c in CIRC)
    rooms_ = [k for k in ol if not circ(k)] or list(ol)
    # exits: open floor of the joined region that crosses each room's wall zone (outline+0.3 .. outline+1.5) and continues outward
    exits = []
    for k in rooms_:
        g = ol[k]; zone = g.buffer(1.5).difference(g.buffer(0.3))
        others = [poly(outl[o]['outline']).representative_point() for r, _ in joined for o in r['roomKeys'] if o != k and o in outl]
        far = unary_union([f for f in parts(J.difference(g.buffer(1.5))) if f.geom_type == 'Polygon' and any(f.contains(p) for p in others)])
        for c in parts(J.intersection(zone)):
            if c.geom_type != 'Polygon' or c.area < 0.05 or not c.buffer(0.01).intersects(far) or not c.buffer(0.01).intersects(g.buffer(0.31)): continue
            mid = c.intersection(g.buffer(0.9).boundary)
            width = round(mid.length, 2)
            if width < 0.3: continue
            exits.append({'room': num[k], 'width': width, 'geom': c, 'line': mid, 'mid': [round(v, 2) for v in c.representative_point().coords[0]],
                          'door': [d['nativeElementId'] for d in ds if d.get('footprint') and poly(d['footprint']).buffer(0.2).intersects(c)],
                          'dwgWallAcross': any(LineString(s_).intersects(c) for s_ in dw), 'dwgDoorLine': any(LineString(s_).intersects(c.buffer(0.3)) for s_ in dd)})
    shared = []
    for i, a in enumerate(ks_ := list(ol)):
        for b in ks_[i + 1:]:
            if num[a] == num[b]: continue
            e = ol[a].boundary.intersection(ol[b].buffer(0.6)).intersection(J.buffer(-0.05)).difference(bar.buffer(0.15))
            e = linemerge(e) if e.geom_type == 'MultiLineString' else e
            for seg in parts(e):
                if seg.geom_type == 'LineString' and seg.length >= 0.6:
                    shared.append({'rooms': sorted([num[a], num[b]]), 'width': round(seg.length, 2), 'line': seg, 'geom': seg.buffer(0.5), 'kind': 'shared boundary (no wall)',
                                   'door': [d['nativeElementId'] for d in ds if d.get('footprint') and poly(d['footprint']).buffer(0.3).intersects(seg)],
                                   'dwgWallAlong': round(min(1, sum(LineString(s_).intersection(seg.buffer(0.35)).length for s_ in dw) / seg.length), 2), 'dwgDoorLine': any(LineString(s_).distance(seg) < 0.5 for s_ in dd)})
    allshared = unary_union([o['line'] for o in shared]) if shared else LineString()
    exits = [dict(o, kind='opening through the wall line') for o in exits if allshared.is_empty or o['line'].difference(allshared.buffer(1.2)).length > 0.5 * max(o['line'].length, 1e-9)]
    exits = [o for o in exits if o['line'].length > 0]
    uniq = []
    for o in sorted(shared, key=lambda o: -o['width']):
        if any(u['line'].buffer(0.7).contains(o['line']) for u in uniq): continue
        uniq.append(o)
    for o in sorted(exits, key=lambda o: -o['width']):
        hit = next((u for u in uniq if u['geom'].intersection(o['geom']).area > 0.3 * min(u['geom'].area, o['geom'].area)), None)
        if hit: hit['rooms'] = sorted(set(hit.get('rooms', []) + [o['room']])); continue
        o['rooms'] = [o['room']]; uniq.append(o)
    focus = unary_union([ol[k] for k in rooms_]); x0, y0, x1, y1 = focus.bounds; m = max(8, 0.25 * max(x1 - x0, y1 - y0))
    view = box(*card['zoom']) if card.get('zoom') else box(x0 - m, y0 - m, x1 + m, y1 + m)
    bar = unary_union([g for w, g in walls if g.intersects(view)])
    fig, ax = plt.subplots(figsize=(11, 11 * (view.bounds[3] - view.bounds[1]) / (view.bounds[2] - view.bounds[0]) if (view.bounds[2]-view.bounds[0]) > (view.bounds[3]-view.bounds[1]) else 11), dpi=110)
    W_, H_ = view.bounds[2] - view.bounds[0], view.bounds[3] - view.bounds[1]
    fig.set_size_inches(11, max(5, min(14, 11 * H_ / W_)))
    pal = ['#dfe7f2', '#e9f1df', '#f3e6dc', '#ece0f0', '#e0f0ee', '#f4efd6']
    for i, (r, g) in enumerate(regs):
        if not g.intersects(view): continue
        isJ = any(r is jr for jr, _ in joined)
        for p in parts(g.intersection(view)):
            if p.geom_type != 'Polygon': continue
            ax.fill(*p.exterior.xy, color='#f2b134' if isJ else pal[i % len(pal)], alpha=0.85 if isJ else 1, lw=0)
            for h in p.interiors: ax.fill(*h.xy, color='white', lw=0)
    for w, g in walls:
        if g.intersects(view):
            for p in parts(g.intersection(view)):
                if p.geom_type == 'Polygon': ax.fill(*p.exterior.xy, color='#3a3a3a', lw=0)
    for d in ds:
        if d.get('footprint') and poly(d['footprint']).intersects(view): ax.fill(*poly(d['footprint']).exterior.xy, color='#8b5a2b', alpha=0.85, lw=0)
    for s in dw:
        l = LineString(s)
        if l.intersects(view): ax.plot(*zip(*s), color='#d0179b', lw=0.9, ls=(0, (4, 3)))
    for s in dd:
        l = LineString(s)
        if l.intersects(view): ax.plot(*zip(*s), color='#ff8c00', lw=1.2)
    for k, g in ol.items():
        for p in parts(g):
            if p.geom_type == 'Polygon': ax.plot(*p.exterior.xy, color='#1f3b73', lw=0.9, ls=(0, (1, 2)))
        c = g.intersection(view).representative_point() if g.intersects(view) else None
        if c is None: continue
        ax.text(c.x, c.y, f"{num[k]}\n{name[k]}", ha='center', va='center', fontsize=9, color='#111', bbox=dict(fc='white', ec='none', alpha=0.75, pad=1.5))
    for n_, o in enumerate(uniq, 1):
        for p in parts(o['line']):
            if p.geom_type == 'LineString': ax.plot(*p.xy, color='#e00000', lw=4 if o['kind'].startswith('shared') else 6, ls=(0, (3, 1.5)) if o['kind'].startswith('shared') else '-', solid_capstyle='butt')
        o['mid'] = o.get('mid') or [0, 0]; o['mid'] = [round(v, 2) for v in o['line'].interpolate(0.5, normalized=True).coords[0]] if o['line'].geom_type == 'LineString' else o['mid']
        ax.annotate(str(n_), o['mid'], xytext=(8, 8), textcoords='offset points', color='white', fontsize=10, weight='bold', bbox=dict(boxstyle='circle', fc='#e00000', ec='none'))
    ax.set_xlim(view.bounds[0], view.bounds[2]); ax.set_ylim(view.bounds[1], view.bounds[3]); ax.set_aspect('equal')
    ax.set_title(f"{card['id'].upper()} · {' / '.join(card['rooms'][:4])}{' …' if len(card['rooms'])>4 else ''}", fontsize=11)
    ax.tick_params(labelsize=7)
    fig.tight_layout(); fn = f"{OUT}/{card['id'].replace('.', '-')}{card.get('suffix', '')}.png"; fig.savefig(fn); plt.close(fig)
    report.append({'id': card['id'], 'levelId': lid, 'image': fn, 'joinedRegions': [[num.get(k, k) for k in r['roomKeys']] for r, _ in joined],
                   'openings': [{k: v for k, v in o.items() if k not in ('geom', 'line')} for o in uniq]})
    print(card['id'], 'joined:', [sorted(set(num.get(k, k) for k in r['roomKeys'])) for r, _ in joined][:3]);
    for i, o in enumerate(uniq, 1): print(f"   {i}. {o['kind']}: {o['rooms']} {o['width']} ft at {o['mid']} door={o['door']} dwg={o.get('dwgWallAlong', o.get('dwgWallAcross'))} dwgDoor={o['dwgDoorLine']}")
json.dump(report, open(OUT + '/report.json', 'w'), indent=1)
