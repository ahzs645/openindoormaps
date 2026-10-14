"""Leak audit and building-junction table on the computed selectable areas (before = published 73f7, after = candidate 2).
candidate-floors-9 copy (+ owner round 6: 09-390 q6.1, 08-264/08-265 q6.3 shared with their open area): + approved merges round2#f2-1 (06-274/06-280 open to kitchen 06-270) and round3#Q5.4 (08-245/247/249 with corridor 08-240).
Light: reads the slim outputs of derive-areas.mts. Writes RUN/candidate-floors-9/leaks.json, junctions.json and
leak close-ups in RUN/candidate-floors-9/leaks/ (raw registered DWG overlaid).
python3 leaks.py [audit] [images] [junctions]"""
import sys, os, json, math, re, glob
sys.path.insert(0, os.path.dirname(__file__))
from cfrender import *
from shapely.geometry import Point, LineString, MultiLineString
from shapely.ops import nearest_points

DWG = RUN + '/shared-extracts/dwg'
BEFORE = Mode('before'); CAND = Mode('candidate')
LEVEL_IDS = [l for l, _, _ in LEVELS]

def J(p): return json.load(open(p))

# ------------------------------------------------------------------ approved merges
def approved_groups(rec_by_key):
    num = lambda k: rec_by_key.get(k, {}).get('number')
    groups = [
        ({'07-249', '07-252', '07-253'}, '2026-10-10-round3#Q5.1 (keep as labels within one area)'),
        ({'10-1046', '10-1040'}, '2026-10-09-round2#f1-8'),
        ({'07-105', '07-107', '07-108', '07-109'}, 'coordinator: approved merge'),
        ({'05-157', '05-150', '05-150A'}, 'handoff §7'), ({'03-014', '03-013'}, 'handoff §7'), ({'07-304', '07-305', '07-306A'}, 'handoff §7'),
        ({'09-271', '09-272'}, 'handoff §7'),
        ({'07-312', '07-301'}, '2026-10-09-round2#f1-3'), ({'03-1058', '03-1059'}, '2026-10-09-round2#f2-4'), ({'05-423', '05-425'}, '2026-10-09-round2#f34-4'),
        ({'05-430', '05-451'}, '2026-10-09-round2#f34-5'), ({'03-3045', '03-3046'}, '2026-10-09-round2#f34-6'),
        ({'03-2034', '03-2038', '03-2039', '03-2041', '03-2052'}, '2026-10-09-round2#f34-8'),
        ({'07-702', '07-704', '07-706', '07-750', '07-751', '07-720', '05-117'}, '2026-10-09-round2#f1-7 / round3#Q3.4 (staff halls one area)'),
        ({'06-270', '06-274', '06-280'}, '2026-10-09-round2#f2-1 (06-274 Cooler / 06-280 Dry Goods open as part of the kitchen)'),
        ({'08-245', '08-247', '08-249', '08-240'}, '2026-10-10-round3#Q5.4 (Floor 2 suite one open area with corridor 08-240)'),
    ]
    pl = J(RUN + '/combined-build/round2/place-labels-round2.json')['reviewedPlaceLabels']['labels']
    for l in pl:
        a, b = num(l['roomKey']) or l['number'], num(l['placeRoomKey'])
        if a and b: groups.append(({a, b}, l['decisionId'] + ' (place label ' + l['action'] + ')'))
    shared_with_any = {'07-314': '2026-10-09-round2#f1-5 (open alcove of the kitchen)', '03-3087A': '2026-10-09-round2#f34-7',
                       '08-342': '2026-10-09-round2#f34-3', '08-441': '2026-10-09-round2#f34-3', '03-2007A': '2026-10-09-round2#f34-9',
                       '03-2078A': '2026-10-09-round2#f34-9', '03-3007B': '2026-10-09-round2#f34-9', '03-3073B': '2026-10-09-round2#f34-9',
                       # candidate-floors-9: owner round 6 (user-decisions/2026-10-12-round6.json)
                       '09-390': '2026-10-12-round6#q6.1 (Kitchenette strip open to the 09-314 catwalk)',
                       '08-264': '2026-10-12-round6#q6.3 (help-desk casework in the open lobby)', '08-265': '2026-10-12-round6#q6.3 (help-desk casework in the open lobby)'}
    return groups, shared_with_any

def is_circ(r):
    return bool(r.get('circulation') or r.get('stair') or r['key'].startswith(('circulation:', 'landing:')) or classify_name(r.get('name')) == 'circ')

# ------------------------------------------------------------------ static per-level data
class Static:
    def __init__(s, M):
        s.M = M
        s.outlines = {}
        for r in J(M.dir + '/record-outlines.json'):
            p = poly_of(r['outline'] or [])
            if p is not None: s.outlines[r['key']] = p
        s.doors = {}
        for d in J(M.dir + '/doors.json'):
            if d.get('footprint') and len(d['footprint']) >= 3:
                p = poly_of([d['footprint']])
                if p is not None: s.doors.setdefault(d['levelId'], []).append((d, p))
        s.doorkeys = {k for v in s.doors.values() for d, _ in v for k in (d.get('roomKeys') or [])}
        s.parts = {}
        for p in J(M.dir + '/partitions.json'):
            if p.get('pointsFeet') and len(p['pointsFeet']) >= 2: s.parts.setdefault(p['levelId'], []).append((p, LineString([q[:2] for q in p['pointsFeet']])))
        s.excl = {}
        for a in J(M.dir + '/exclusions.json'):
            rings = a.get('rings')
            if rings:
                ps = [poly_of(r) for r in (rings if isinstance(rings[0][0][0], list) else [rings])]
                g = unary_union([p for p in ps if p is not None])
                if not g.is_empty: s.excl.setdefault(a['levelId'], []).append((a, g))
        v = J(M.dir + '/vertical.json')
        s.flights = v['flights']; s.ramps = v['ramps']; s.connectors = v['connectors']
        s.env = {}
        for e in J(M.dir + '/envelopes.json'):
            g = unary_union([p for p in (poly_of(r) for r in e['parts']) if p is not None])
            s.env[int(e['levelId'])] = g
        s.vtx = {}
        for lid in LEVEL_IDS:
            gs = []
            for f in s.flights:
                if lid in f['levelIds']: gs += [poly_of([t]) for t in f['treads'] if t and len(t) >= 3]
            for r in s.ramps:
                if lid in r['levelIds']: gs += [Polygon([q[:2] for q in t]) for t in r['triangles'] if len(t) >= 3]
            gs = [g for g in gs if g is not None and g.is_valid and g.area > 0]
            s.vtx[lid] = unary_union(gs) if gs else None

_dwg = {}
def dwg(lid):
    if lid not in _dwg:
        f = f'{DWG}/registered-sections-level-{lid}.json'
        walls, doors = [], []
        if os.path.exists(f):
            for sec in J(f)['sections']:
                walls += sec.get('wallSegments', []); doors += sec.get('doorSegments', [])
        W = [LineString(w) for w in walls if len(w) >= 2]; D = [LineString(w) for w in doors if len(w) >= 2]
        _dwg[lid] = (W, STRtree(W) if W else None, D, STRtree(D) if D else None)
    return _dwg[lid]

def dwg_near(lid, geom, which='wall'):
    W, WT, D, DT = dwg(lid)
    L, T = (W, WT) if which == 'wall' else (D, DT)
    if T is None: return []
    return [L[int(i)] for i in T.query(geom, predicate='intersects')]

# ------------------------------------------------------------------ neck search
def components(g):
    return [p for p in polys(g) if p.area > 1e-9]

def joined(A, r, c1, c2):
    E = A.buffer(-r, join_style=2) if r > 0 else A
    for p in components(E):
        if p.intersects(c1) and p.intersects(c2): return True
    return False

def neck(A, core1, core2):
    """Smallest erosion radius r that separates the two cores inside A; returns (width=2r, location polygon)."""
    if core1.is_empty or core2.is_empty or not joined(A, 0, core1, core2): return None
    radii = [1e-6, 1e-5, 1e-4, 1e-3, 0.005, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.5, 8.0]
    lo, hi = 0.0, None
    for r in radii:
        if joined(A, r, core1, core2): lo = r
        else: hi = r; break
    if hi is None: return {'widthFeet': None, 'note': 'joined wider than 16 ft (open area)'}
    for _ in range(7):
        mid = math.sqrt(lo * hi) if lo > 0 else hi / 10
        if joined(A, mid, core1, core2): lo = mid
        else: hi = mid
    # location: between the two eroded sides at the separating radius (nearest points), clipped to the area
    E = A.buffer(-hi, join_style=2)
    oc = components(E)
    s1 = [p for p in oc if p.intersects(core1)]; s2 = [p for p in oc if p.intersects(core2)]
    if not s1 or not s2: return {'widthFeet': 2 * hi, 'loc': None, 'note': 'side vanished at the separating radius'}
    p1, p2 = nearest_points(unary_union(s1), unary_union(s2))
    seg = LineString([p1, p2]) if p1.distance(p2) > 1e-9 else Point(p1).buffer(1e-6)
    loc = seg.buffer(max(hi * 1.5, 0.05)).intersection(A.buffer(1e-6))
    if loc.is_empty: loc = seg.buffer(max(hi * 1.5, 0.05))
    return {'widthFeet': (lo + hi), 'loc': loc}

def classify_neck(S, lid, loc, width, region):
    if loc is None: return 'unlocated', {}
    p = loc.centroid; near = loc.buffer(0.6)
    ev = {'pointFeet': [round(p.x, 3), round(p.y, 3)]}
    doors = [d for d, g in S.doors.get(lid, []) if g.distance(loc) < 0.75]
    dd = dwg_near(lid, loc.buffer(1.0), 'door')
    dw = dwg_near(lid, loc.buffer(0.35), 'wall')
    if width is not None and width < 0.1:
        ev['dwgWallLines'] = len(dw); ev['nativeDoors'] = [d['nativeElementId'] for d in doors]
        return 'seam/crack', ev
    if doors:
        ev['nativeDoors'] = [d['nativeElementId'] for d in doors]; ev['doorStates'] = [d['state'] for d in doors]
        return 'door without selection closure', ev
    if dd:
        ev['dwgDoorLines'] = len(dd)
        return 'door without selection closure', ev
    vt = S.vtx.get(lid)
    if vt is not None and vt.distance(loc) < 1.0: return 'stair/void', ev
    if any(g.distance(loc) < 0.75 for a, g in S.excl.get(lid, [])): return 'stair/void', ev
    if dw:
        ev['dwgWallLines'] = len(dw)
        return 'missing wall piece vs DWG', ev
    env = S.env.get(lid)
    if env is not None and env.boundary.distance(p) < 1.5 and region.get('exposed', 0) > 0.5: return 'facade gap', ev
    return 'doorless opening', ev

# ------------------------------------------------------------------ audit
def audit_mode(M, S, locate):
    groups, shared_any = approved_groups(M.rec)
    out_levels, flagged = {}, []
    where = {}
    for lid in LEVEL_IDS:
        if not M.has(lid): continue
        L = M.level(lid)
        for g in L.regions:
            for k in g['roomKeys']: where.setdefault(k, (lid, g))
    for lid in LEVEL_IDS:
        if not M.has(lid): continue
        L = M.level(lid)
        rows = []
        for g in L.regions:
            rooms = L.rooms(g)
            named = [r for r in rooms if r.get('number')]
            if not named: continue
            noncirc = [r for r in named if not is_circ(r)]
            circ_named = [r for r in named if is_circ(r)]
            unnamed_circ = [r for r in rooms if not r.get('number') and is_circ(r)]
            ncnums = sorted({r['number'] for r in noncirc})
            # approved?
            appr = []
            rest = set(ncnums)
            for grp, why in groups:
                if len(rest & grp) >= 2 or (rest & grp and len(rest) == 1 and len(grp & set(ncnums)) >= 2):
                    pass
            covered = set()
            for grp, why in groups:
                inter = set(ncnums) & grp
                if len(inter) >= 2: covered |= inter; appr.append(why)
            leftover = set(ncnums) - covered
            # numbers approved to be shared with anything (retired labels / open alcoves)
            for n in list(leftover):
                if n in shared_any: leftover.discard(n); appr.append(shared_any[n])
            unexpected = len(ncnums) >= 2 and (len(leftover) >= 2 or (len(leftover) == 1 and len(covered) > 0))
            for r in named:
                o = S.outlines.get(r['key'])
                ratio = round(g['area'] / o.area, 3) if o is not None and o.area > 0.5 else None
                rows.append({'key': r['key'], 'number': r['number'], 'name': r.get('name'), 'building': r.get('building'), 'region': g['id'], 'regionArea': round(g['area'], 1),
                             'others': sorted({x['number'] for x in named if x['key'] != r['key']}), 'unnamedCirculation': len(unnamed_circ), 'circulation': is_circ(r),
                             'ratio': ratio})
            flags = []
            if unexpected:
                flags.append({'class': 'UNEXPECTED_MERGE', 'rooms': ncnums, 'unapproved': sorted(leftover), 'approvedParts': sorted(set(appr))})
            # room merged with corridor
            if (circ_named or unnamed_circ) and noncirc:
                for r in noncirc:
                    if r['number'] in shared_any or any(r['number'] in grp and (set(x['number'] for x in circ_named) & grp) for grp, _ in groups): continue
                    o = S.outlines.get(r['key'])
                    hasdoor = r['key'] in S.doorkeys
                    dwgdoor = bool(o is not None and dwg_near(lid, o.boundary.buffer(1.0), 'door'))
                    rb = [p['id'] + ':' + p['status'] for p, ln in S.parts.get(lid, []) if o is not None and ln.distance(o.boundary) < 1.0]
                    if hasdoor or dwgdoor:
                        flags.append({'class': 'ROOM_CORRIDOR_DOOR', 'room': r['number'], 'corridor': [x['number'] for x in circ_named] or ['(unnamed circulation)'], 'doorEvidence': ('native door record' if hasdoor else 'DWG door lines'), 'reviewedBoundaries': rb})
                    elif not any(x.endswith(':applied') for x in rb):
                        flags.append({'class': 'ROOM_CORRIDOR_DOORLESS', 'room': r['number'], 'corridor': [x['number'] for x in circ_named] or ['(unnamed circulation)'], 'reviewedBoundaries': rb})
            if g.get('exposed') and g['exposed'] > 1.0:
                flags.append({'class': 'OPEN_TO_OUTSIDE', 'exposedEdgeFeet': round(g['exposed'], 2), 'rooms': sorted({r['number'] for r in named})})
            if len(named) == 1:
                rr = rows[-1]
                if rr['ratio'] is not None and (rr['ratio'] < 0.8 or rr['ratio'] > 1.25):
                    flags.append({'class': 'AREA_RATIO', 'room': rr['number'], 'ratio': rr['ratio'], 'regionArea': rr['regionArea'], 'outlineArea': round(S.outlines[named[0]['key']].area, 1)})
            for f in flags:
                f.update({'levelId': lid, 'region': g['id'], 'regionArea': round(g['area'], 1)})
                if locate and f['class'] == 'OPEN_TO_OUTSIDE':
                    f['leaks'] = locate_exposed(S, L, g, f, lid)
                if locate and f['class'] in ('UNEXPECTED_MERGE', 'ROOM_CORRIDOR_DOOR', 'ROOM_CORRIDOR_DOORLESS'):
                    f['leaks'] = locate_leaks(S, L, g, f, lid)
                flagged.append(f)
        out_levels[lid] = rows
    # omitted named records
    for k, r in M.rec.items():
        if r.get('number') and k not in where:
            flagged.append({'class': 'OMITTED', 'levelId': r['levelId'], 'room': r['number'], 'name': r.get('name'), 'key': k, 'outlineArea': round(S.outlines[k].area, 1) if k in S.outlines else None})
    return out_levels, flagged

_wt = {}
def locate_exposed(S, L, g, f, lid):
    """Region boundary not backed by a wall/column, a door footprint or a neighbouring selectable area: the open edge."""
    if lid not in _wt: _wt[lid] = STRtree(L.walls) if L.walls else None
    A = g['geom']; zone = A.buffer(0.6)
    block = []
    if _wt[lid] is not None: block += [L.walls[int(i)] for i in _wt[lid].query(zone, predicate='intersects')]
    block += [p for d, p in S.doors.get(lid, []) if p.intersects(zone)]
    block += [h['geom'] for h in L.regions if h is not g and h['geom'].distance(A) < 0.3]
    cover = unary_union([b.buffer(0.15, join_style=2) for b in block]) if block else None
    ext = unary_union([q.exterior for q in polys(A)])
    edge = ext if cover is None else ext.difference(cover)
    segs = sorted(lines_of(edge), key=lambda c: -LineString(c).length) if not edge.is_empty else []
    if not segs: return [{'room': (f.get('rooms') or ['?'])[0], 'class': 'unlocated', 'note': 'no open boundary piece found (edge is inside a hole or along a void)'}]
    ln = LineString(segs[0]); p = ln.interpolate(0.5, normalized=True)
    vt = S.vtx.get(lid)
    cl = 'stair/void' if (vt is not None and vt.distance(ln) < 1.0) or any(a.distance(ln) < 0.75 for _, a in S.excl.get(lid, [])) else 'facade gap'
    dw = dwg_near(lid, ln.buffer(0.5), 'wall')
    return [{'room': (f.get('rooms') or ['?'])[0], 'class': cl, 'widthFeet': round(ln.length, 3), 'openEdgeFeet': round(sum(LineString(c).length for c in segs), 2), 'pointFeet': [round(p.x, 3), round(p.y, 3)], 'dwgWallLines': len(dw), 'bounds': [round(v, 2) for v in ln.bounds]}]

def locate_leaks(S, L, g, f, lid):
    A = g['geom']
    keys = {r['number']: r['key'] for r in L.rooms(g) if r.get('number')}
    targets = f.get('unapproved') or ([f['room']] if f.get('room') else [])
    res = []
    for n in targets[:12]:
        o = S.outlines.get(keys.get(n))
        if o is None: res.append({'room': n, 'class': 'unlocated', 'note': 'no record outline'}); continue
        core1 = A.intersection(o.buffer(-0.6, join_style=2))
        if core1.is_empty or core1.area < 0.05: core1 = A.intersection(o)
        core2 = A.difference(o.buffer(0.6, join_style=2))
        if core1.is_empty or core2.is_empty or core2.area < 0.05:
            res.append({'room': n, 'class': 'unlocated', 'note': 'outline does not split the area'}); continue
        try: nk = neck(A, core1, core2)
        except Exception as e: nk = {'widthFeet': None, 'note': 'error ' + str(e)[:80]}
        if nk is None: res.append({'room': n, 'class': 'unlocated', 'note': 'cores not joined'}); continue
        if nk.get('loc') is None: res.append({'room': n, 'class': 'open area', 'widthFeet': None, 'note': nk.get('note')}); continue
        cl, ev = classify_neck(S, lid, nk['loc'], nk['widthFeet'], g)
        other = [m for m, k in keys.items() if m != n and S.outlines.get(k) is not None and S.outlines[k].distance(nk['loc']) < 1.5]
        res.append({'room': n, 'toward': other[:4], 'class': cl, 'widthFeet': round(nk['widthFeet'], 5), **ev, 'bounds': [round(v, 2) for v in nk['loc'].bounds]})
    return res

# ------------------------------------------------------------------ junctions
BLD = ['03', '04', '05', '06', '07', '08', '09', '10']
def junctions(M, S):
    rec = M.rec
    bld = lambda k: (rec.get(k) or {}).get('building') or ((rec.get(k) or {}).get('number') or '')[:2]
    foot = {}
    for k, o in S.outlines.items():
        b = bld(k)
        if b in BLD: foot.setdefault(b, []).append(o)
    F = {b: unary_union(v) for b, v in foot.items()}
    pairs = [(a, b) for i, a in enumerate(BLD) for b in BLD[i + 1:] if a in F and b in F and F[a].distance(F[b]) < 20]
    rows = []
    for lid in LEVEL_IDS:
        if not M.has(lid): continue
        L = M.level(lid)
        rb = []
        for g in L.regions:
            bs = {bld(k) for k in g['roomKeys'] if bld(k) in BLD}
            rb.append(bs)
        env = S.env.get(lid)
        envparts = polys(env) if env is not None else []
        for a, b in pairs:
            shared = [(L.regions[i], bs) for i, bs in enumerate(rb) if a in bs and b in bs]
            ga = [L.regions[i]['geom'] for i, bs in enumerate(rb) if a in bs]
            gb = [L.regions[i]['geom'] for i, bs in enumerate(rb) if b in bs]
            if not ga or not gb:
                rows.append({'junction': f'{a}-{b}', 'levelId': lid, 'floor': NAME[lid], 'status': 'n/a', 'evidence': f'building {a if not ga else b} has no selectable area on this native level', 'gapFeet': None, 'doors': [], 'connectors': []})
                continue
            UA, UB = unary_union(ga), unary_union(gb)
            gap = UA.distance(UB)
            touch = UA.buffer(1e-6).intersection(UB.buffer(1e-6)).length / 2 if gap < 1e-6 else 0
            doors = [d for d, p in S.doors.get(lid, []) if {bld(k) for k in (d.get('roomKeys') or [])} >= {a, b}]
            same_env = any(p.intersects(UA) and p.intersects(UB) for p in envparts)
            conn = []
            for f in S.flights:
                if lid in f['levelIds'] and set(f.get('buildings') or []) >= {a, b}: conn.append(f'stair #{f["id"]}')
            for c in S.connectors:
                bs = {bld(e.get('roomKey')) for e in c['entrances'] if e.get('roomKey')}
                if bs >= {a, b} and any(e.get('levelId') == lid for e in c['entrances']): conn.append(f'{c.get("kind") or "lift"} {c["id"]}')
            for r in S.ramps:
                if lid in r['levelIds']:
                    tri = unary_union([Polygon([q[:2] for q in t]) for t in r['triangles'] if len(t) >= 3])
                    if tri.distance(UA) < 1.0 and tri.distance(UB) < 1.0: conn.append(f'ramp #{r["nativeElementId"]}')
            if shared:
                status = 'continuous'; ev = 'shared selectable area ' + ', '.join(f'{g["id"]} ({", ".join(sorted({(rec.get(k) or {}).get("number") or "" for k in g["roomKeys"] if bld(k) in (a, b) and (rec.get(k) or {}).get("number")})[:6])})' for g, _ in shared[:3])
            elif doors and same_env:
                status = 'continuous'; ev = 'walking envelope continuous; selection closed at door(s) ' + ', '.join(str(d['nativeElementId']) for d in doors[:5])
            elif same_env and touch > 0.5:
                status = 'continuous'; ev = f'walking envelope continuous; areas touch along {touch:.1f} ft (selection boundary only)'
            elif conn:
                status = 'connector'; ev = '; '.join(sorted(set(conn))[:5])
            elif same_env:
                status = 'continuous'; ev = f'same envelope part, nearest areas {gap:.2f} ft apart (door/partition)'
            else:
                status = 'disconnected'; ev = f'no shared area, door or connector; nearest areas {gap:.2f} ft apart' + ('' if not envparts else '; different envelope parts')
            rows.append({'junction': f'{a}-{b}', 'levelId': lid, 'floor': NAME[lid], 'status': status, 'evidence': ev, 'gapFeet': round(gap, 3), 'doors': [d['nativeElementId'] for d in doors][:10], 'connectors': sorted(set(conn))})
    # display-floor rollup (the app's floor scopes): Floor 1 = native 0.5, 1, 1.25, 1.5
    GROUPS = {'Floor 0 (Basement)': [2295121], 'Floor 1 (0.5 + Main + 1.25 + 1.5)': [1450417, 311, 1487816, 1425915], 'Floor 2': [694], 'Floor 3 (3 + 3.5)': [400176, 1487353], 'Floor 4': [402367]}
    roll = []
    for a, b in pairs:
        for gname, lids in GROUPS.items():
            rs = [r for r in rows if r['junction'] == f'{a}-{b}' and r['levelId'] in lids]
            best = next((st for st in ('continuous', 'connector', 'disconnected') if any(r['status'] == st for r in rs)), 'n/a')
            ev = [f"{NAME[r['levelId']]}: {r['status']} - {r['evidence']}" for r in rs if r['status'] == best][:3]
            if best in ('disconnected', 'n/a'):
                # cross-level connector inside the floor scope: a flight or ramp near areas of both buildings on different native levels
                ua = [g['geom'] for lid in lids if M.has(lid) for g in M.level(lid).regions if any(bld(k) == a for k in g['roomKeys'])]
                ub = [g['geom'] for lid in lids if M.has(lid) for g in M.level(lid).regions if any(bld(k) == b for k in g['roomKeys'])]
                if ua and ub:
                    UA, UB = unary_union(ua), unary_union(ub)
                    for f in S.flights:
                        if set(f['levelIds']) & set(lids):
                            tg = unary_union([q for q in (poly_of([t]) for t in f['treads'] if t and len(t) >= 3) if q is not None])
                            if not tg.is_empty and tg.distance(UA) < 2 and tg.distance(UB) < 2: best = 'connector'; ev.append(f"stair #{f['id']} between levels {f['levelIds']}")
                    for rp in S.ramps:
                        if set(rp['levelIds']) & set(lids):
                            tg = unary_union([Polygon([q[:2] for q in t]) for t in rp['triangles'] if len(t) >= 3])
                            if tg.distance(UA) < 2 and tg.distance(UB) < 2: best = 'connector'; ev.append(f"ramp #{rp['nativeElementId']} between levels {rp['levelIds']}")
            roll.append({'junction': f'{a}-{b}', 'floor': gname, 'status': best, 'evidence': ev[:4]})
    return pairs, rows, roll

# ------------------------------------------------------------------ images
def wtxt(w):
    if w is None: return ''
    return 'point contact (<1e-5 ft)' if w < 1e-5 else ('%.4f ft' % w if w < 0.1 else '%.2f ft' % w)

def leak_images(flags, Sb, Sc, limit=400):
    os.makedirs(OUT + '/leaks', exist_ok=True)
    made = []
    items = []
    for f in flags:
        for lk in f.get('leaks', []):
            if lk.get('bounds'): items.append((f, lk))
    for f in flags:
        if f['class'] == 'OPEN_TO_OUTSIDE': pass
    items.sort(key=lambda t: (t[0]['levelId'], t[0]['region'], t[1]['room']))
    seen = {}
    idx = -1
    for f, lk in items:
        lid = f['levelId']
        key = (lid, round(lk['pointFeet'][0] * 2) / 2, round(lk['pointFeet'][1] * 2) / 2)
        if key in seen: lk['image'] = seen[key]; continue
        idx += 1
        if idx >= limit: break
        x0, y0, x1, y1 = lk['bounds']; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        half = max(14, (x1 - x0), (y1 - y0))
        win = (cx - half, cy - half * 0.75, cx + half, cy + half * 0.75)
        W = 1600; HB = 120; pad = 14; gap = 14; pw = (W - 2 * pad - gap) / 2; ph = pw * 0.75
        H = int(HB + ph + 40)
        cv = Canvas(W, H); ax = cv.ax
        B = BEFORE.level(lid); C = CAND.level(lid)
        for col, (L, lab) in enumerate([(B, 'Published master 73f7c95e'), (C, 'Now (candidate 2)')]):
            P = Panel(cv, win, (pad + col * (pw + gap), 16, pw, ph))
            draw_level(P, L)
            reg = [g for g in L.regions if lk['room'] in L.numbers(g)]
            for g in reg: P.fill(g['geom'], 6, fc='none', ec=CHANGED, lw=2.2)
            W_, _, D_, _ = dwg(lid)
            for ln in dwg_near(lid, P.winpoly, 'wall'): P.lines(ln, 8, color='#e040fb', lw=0.9, ls=(0, (3, 2)))
            for ln in dwg_near(lid, P.winpoly, 'door'): P.lines(ln, 8, color='#8d6e63', lw=0.9)
            place_labels(P, L, sizes=(9, 8, 7, 6))
            if col == 1:
                px, py = P.f(*lk['pointFeet'])
                ax.add_patch(matplotlib.patches.Circle((px, py), 14, fc='none', ec='#d00018', lw=2.2, zorder=12))
                ax.annotate(f"{lk['class']}  {wtxt(lk.get('widthFeet'))}", xy=(px, py), xytext=(px + 60, py + 50), fontsize=9, color='#d00018', fontweight='bold', zorder=13,
                            bbox=dict(boxstyle='round,pad=0.25', fc='white', ec='#d00018'), arrowprops=dict(arrowstyle='-|>', color='#d00018'))
            ax.text(P.ox, P.oy + (win[3] - win[1]) * P.s + 4, lab, fontsize=10, fontweight='bold', va='bottom')
            if col == 1: scale_bar(ax, P.ox + (win[2] - win[0]) * P.s - 170, P.oy + 8, P.s, maxpx=90)
        ttl = f"{NAME[lid]} - {f['class']}: {lk['room']}" + (f" -> {', '.join(lk.get('toward') or [])}" if lk.get('toward') else '')
        ax.text(pad, H - 12, ttl, fontsize=14, fontweight='bold', va='top')
        ax.text(pad, H - 36, f"Area {f['region']} ({f['regionArea']} sq ft) holds: {', '.join((f.get('rooms') or [f.get('room')] + (f.get('corridor') or []))[:14])}. Leak at ({lk['pointFeet'][0]}, {lk['pointFeet'][1]}). Blue = area holding {lk['room']}; magenta dashed = registered DWG walls; brown = DWG doors.", fontsize=8.5, color='#333', va='top')
        north_arrow(ax, W - 60, H - 80, L=26)
        safe = re.sub(r'[^A-Za-z0-9.-]+', '_', f"{idx + 1:03d}-{NAME[lid].split(' ')[1]}-{lk['room']}-{lk['class']}")[:90]
        fn = f'{OUT}/leaks/{safe}.png'; cv.save(fn); made.append(os.path.relpath(fn, OUT)); lk['image'] = os.path.relpath(fn, OUT); seen[key] = lk['image']
    return made

if __name__ == '__main__':
    what = sys.argv[1:] or ['audit', 'images', 'junctions']
    Sb, Sc = Static(BEFORE), Static(CAND)
    if 'audit' in what or 'images' in what:
        rows_c, flags_c = audit_mode(CAND, Sc, locate=True)
        rows_b, flags_b = audit_mode(BEFORE, Sb, locate=False)
        sig = lambda f: (f['class'], f['levelId'], f.get('room') or tuple(f.get('rooms') or []))
        bset = {sig(f) for f in flags_b}; cset = {sig(f) for f in flags_c}
        # status by room pairs: a merge is new only when two of its rooms were in different published areas
        breg = {}
        for lid in LEVEL_IDS:
            if BEFORE.has(lid):
                Lb = BEFORE.level(lid)
                for g in Lb.regions:
                    for n in Lb.numbers(g): breg.setdefault((lid, n), g['id'])
        for f in flags_c:
            if f['class'] == 'UNEXPECTED_MERGE':
                rs = f['rooms']; groups = {}
                for n in rs: groups.setdefault(breg.get((f['levelId'], n), 'none:' + n), []).append(n)
                f['publishedGroups'] = list(groups.values())
                f['status'] = 'new' if len(groups) > 1 else 'existing (published area held them together; may be smaller now)'
            elif f['class'] in ('ROOM_CORRIDOR_DOOR', 'ROOM_CORRIDOR_DOORLESS'):
                cor = [c for c in f.get('corridor', []) if not c.startswith('(')]
                same = all(breg.get((f['levelId'], c)) == breg.get((f['levelId'], f['room'])) for c in cor) if cor else sig(f) in bset
                f['status'] = 'existing' if same and breg.get((f['levelId'], f['room'])) else 'new'
            else: f['status'] = 'existing' if sig(f) in bset else 'new'
        fixed = [f for f in flags_b if sig(f) not in cset]
        images = leak_images(flags_c, Sb, Sc) if 'images' in what else []
        counts = {}
        for f in flags_c: counts[f['class']] = counts.get(f['class'], 0) + 1
        leakclass = {}
        for f in flags_c:
            for lk in f.get('leaks', []): leakclass[lk['class']] = leakclass.get(lk['class'], 0) + 1
        out = {'format': 'unbc-candidate-leak-audit', 'version': 1,
               'method': 'Selectable areas from derive-areas.mts (after = candidate, before = published 73f7). Merge flags exclude owner-approved merges (see approvedMerges). Leak location: smallest erosion radius that separates the room outline core from the rest of its area (exact shapely geometry on the IEEE area rings), at the opening residue joining both sides; classified against native doors, registered DWG wall/door lines, stair/ramp treads, exclusions and the envelope.',
               'approvedMerges': [{'rooms': sorted(g), 'decision': w} for g, w in approved_groups(CAND.rec)[0]] + [{'rooms': [n], 'sharedWithAny': w} for n, w in approved_groups(CAND.rec)[1].items()],
               'counts': {'after': counts, 'afterNew': sum(1 for f in flags_c if f['status'] == 'new'), 'before': len(flags_b), 'fixedSinceBefore': len(fixed), 'leakLocationsByClass': leakclass},
               'flags': flags_c, 'fixedSinceBefore': fixed, 'beforeFlags': flags_b, 'images': images,
               'rooms': {str(k): v for k, v in rows_c.items()}}
        json.dump(out, open(OUT + '/leaks.json', 'w'), indent=1, default=str)
        print('leaks', counts, leakclass, 'images', len(images))
    if 'junctions' in what:
        pairs, rows_c, roll_c = junctions(CAND, Sc); _, rows_b, roll_b = junctions(BEFORE, Sb)
        bmap = {(r['junction'], r['levelId']): r['status'] for r in rows_b}
        for r in rows_c: r['before'] = bmap.get((r['junction'], r['levelId']))
        rbm = {(r['junction'], r['floor']): r['status'] for r in roll_b}
        for r in roll_c: r['before'] = rbm.get((r['junction'], r['floor']))
        json.dump({'format': 'unbc-building-junctions', 'version': 1, 'method': 'Walking-area level (not routing). Adjacent building pairs: record outlines within 20 ft. Per native level: shared selectable area -> continuous; same envelope part with a door or touching areas -> continuous; else a native stair flight / ramp / lift recipe joining both -> connector; else disconnected.',
                   'adjacentPairs': [f'{a}-{b}' for a, b in pairs], 'byFloor': roll_c, 'rows': rows_c}, open(OUT + '/junctions.json', 'w'), indent=1)
        st = {}
        for r in roll_c: st[r['status']] = st.get(r['status'], 0) + 1
        print('junctions', st)
