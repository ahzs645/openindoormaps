"""Leak audit v2 on candidate 2 (light; reads slim derive-areas outputs + the door extract).
Inputs (candidate-floors-9): leaks.json (leaks.py audit: flags, approved merges incl. round2#f2-1 and round3#Q5.4),
data/candidate/*, data/extract/candidate-doors.json. Comparison: candidate 1 = candidate-floors/{leaks.json, triage/flags.json,
fix-doors/cases.json, data/candidate}; 73f7 = data/before (published master, kept from candidate-floors).
Leak location: the exact channel finder of candidate-floors/fix-doors/scripts/bridges.py (residual channels of the opening at
the separating radius, rest side = cores of the other records; part graph for sub-1e-5 ft seams; zero-area slit report).
Triage: candidate-1 classes from triage/flags.json carried over when the same flag persists (same level and rooms), the
expected-reason rules of triage/REPORT.md / triage.py applied to flags without a candidate-1 entry, and every merge whose
rooms were in different areas in candidate 1 or in 73f7 reported as a regression with its exact channel.
Writes candidate-floors-9/triage/flags.json, candidate-floors-9/leaks-v2.json and leak close-ups of real problems
(candidate-floors-9/leaks/).   python3 leaks2.py [images]"""
import os, sys, json, math, collections, time
RUN = '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009'
C2 = os.environ.get('CF_OUT', RUN + '/candidate-floors-16'); C1 = os.environ.get('CF_PREV', RUN + '/candidate-floors-2')  # candidate-floors-9: the previous candidate is candidate 2 (candidate-1 per-level data was not exported)
os.environ.setdefault('CF_DATA', C2 + '/data'); os.environ.setdefault('CF_OUT', C2)
sys.path.insert(0, C2 + '/scripts')
from cfrender import *
import leaks as LK
import bridges as BR
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union, nearest_points

J = lambda p: json.load(open(p))
L2 = J(C2 + '/leaks.json')
L1 = J(C1 + '/leaks.json')
T1 = J(C1 + '/triage/flags.json')['flags']
CASES1 = J(RUN + '/candidate-floors/fix-doors/cases.json')['cases']  # fix-doors cases exist for candidate 1 only
CAND, BEFORE = LK.CAND, LK.BEFORE

def mode_at(d, name):
    m = Mode.__new__(Mode); m.mode = name; m.dir = d
    m.rec = {r['key']: r for r in J(d + '/records.json')}; m._lv = {}
    return m
CAND1 = mode_at(C1 + '/data/candidate', 'candidate1')

def region_index(M):
    idx = {}
    for lid in LK.LEVEL_IDS:
        if not M.has(lid): continue
        L = M.level(lid)
        for g in L.regions:
            for n in L.numbers(g): idx.setdefault((lid, n), g['id'])
    return idx
REG = {'c2': region_index(CAND), 'c1': region_index(CAND1), 'b': region_index(BEFORE)}

def groups_by(which, lid, rooms):
    gs = collections.OrderedDict()
    for n in rooms: gs.setdefault(REG[which].get((lid, n), 'omitted:' + n), []).append(n)
    real = [v for k, v in gs.items() if not k.startswith('omitted:')]
    return list(gs.values()), real, [n for k, v in gs.items() if k.startswith('omitted:') for n in v]

# ------------------------------------------------------------------ exact channels (bridges.py method)
CHANNEL_CLASS = {'door not masked': ('door without selection closure', 'fix-doors'), 'jamb gap beside door footprint': ('door without selection closure', 'fix-doors'),
                 'opening next to a masked door (not through it)': ('door without selection closure', 'fix-doors'), 'DWG door, no Revit door': ('DWG door, no Revit door', 'fix-doors'),
                 'missing wall piece vs DWG': ('missing wall piece vs DWG', 'fix-walls'), 'doorless opening': ('doorless opening', None),
                 'seam at door jamb': ('seam/crack (door jamb)', 'fix-seams'), 'seam/point contact (not a door)': ('seam/crack', 'fix-seams')}
_chan = {}
def room_channels(lid, number, region_id):
    """bridges.py main-loop body for one (level, room, area)."""
    k = (lid, number, region_id)
    if k in _chan: return _chan[k]
    t0 = time.time()
    Lv = BR.C.level(lid)
    g = next((g for g in Lv.regions if g['id'] == region_id), None)
    keys = [x for x in BR.num2key.get((lid, number), []) if g and x in g['roomKeys']]
    row = {'levelId': lid, 'room': number, 'region': region_id, 'channels': []}
    if not g or not keys or not any(x in BR.outl for x in keys): row['note'] = 'no region/outline'; _chan[k] = row; return row
    A = g['geom']; O = unary_union([BR.outl[x] for x in keys if x in BR.outl])
    c1 = A.intersection(O.buffer(-0.6, join_style=2))
    if c1.is_empty or c1.area < 0.05: c1 = A.intersection(O)
    oth = [BR.outl[x] for x in g['roomKeys'] if x not in keys and x in BR.outl]
    c2 = A.intersection(unary_union([o.buffer(-0.6, join_style=2) for o in oth])).difference(O.buffer(0.6, join_style=2)) if oth else A.difference(O.buffer(0.6, join_style=2))
    if c2.is_empty or c2.area < 0.05: c2 = A.intersection(unary_union(oth)).difference(O.buffer(0.6, join_style=2)) if oth else c2
    row['roomDoors'] = [{'nativeElementId': d['nativeElementId'], 'state': d['state'], 'passThrough': (lid, d['nativeElementId']) in BR.thr, 'closureRecord': (lid, d['nativeElementId']) in BR.clo}
                        for nid, lst in BR.doors.items() for d in lst if d['levelId'] == lid and set(d['roomKeys']) & set(keys)]
    if c1.is_empty or c2.is_empty or c2.area < 0.05: row['note'] = 'outline does not split the area'; _chan[k] = row; return row
    parts = [p for p in polys(A) if p.area > 1e-7]
    same = [p for p in parts if p.intersects(c1) and p.intersects(c2) and BR.joined(p, 0, c1.intersection(p), c2.intersection(p))]
    if not same:
        adj = collections.defaultdict(list)
        for i in range(len(parts)):
            for j in range(i + 1, len(parts)):
                if parts[i].distance(parts[j]) < 2e-5: adj[i].append(j); adj[j].append(i)
        src = [i for i, p in enumerate(parts) if p.intersects(c1)]; dst = {i for i, p in enumerate(parts) if p.intersects(c2)}
        prev = {i: None for i in src}; q = collections.deque(src); hit = None
        while q:
            i = q.popleft()
            if i in dst: hit = i; break
            for j in adj[i]:
                if j not in prev: prev[j] = i; q.append(j)
        if hit is None:
            sl = []
            for rr in g['rings']:
                segs = [LineString([a, b]) for a, b in zip(rr, rr[1:] + [rr[0]]) if a != b]
                for i in range(len(segs)):
                    for j in range(i + 2, len(segs)):
                        if i == 0 and j == len(segs) - 1: continue
                        x = segs[i].intersection(segs[j])
                        if x.geom_type in ('LineString', 'MultiLineString') and x.length > 1e-6: sl.append(x)
            near = [x for x in sl if x.distance(O) < 3.0]
            row['note'] = 'joined only through zero-area slits of the exact face ring' if sl else 'cores not joined'
            row['separatingWidthFeet'] = 0.0 if sl else None
            for x in (near or sl)[:6]:
                row['channels'].append({'class': 'zero-area slit (exact face ring)', 'centroidFeet': [round(x.centroid.x, 3), round(x.centroid.y, 3)], 'bounds': [round(v, 3) for v in x.bounds], 'lengthFeet': round(x.length, 4)})
            _chan[k] = row; return row
        path = []
        while prev[hit] is not None: path.append((prev[hit], hit)); hit = prev[hit]
        row['separatingWidthFeet'] = 0.0
        for i, j in path:
            P = parts[i].buffer(2e-5).intersection(parts[j].buffer(2e-5))
            ev = BR.classify(lid, P, A); ev['contact'] = 'sub-1e-5 ft seam or exact point contact between faces (slim rings)'
            ev['class'] = ('seam at door jamb' if ev['nativeDoors'] else 'seam/point contact (not a door)')
            row['channels'].append(ev)
        row['seconds'] = round(time.time() - t0, 1); _chan[k] = row; return row
    A = same[0]; c1 = c1.intersection(A); c2 = c2.intersection(A)
    s = BR.separate(A, c1, c2)
    if s is None: row['note'] = 'cores not joined'; _chan[k] = row; return row
    lo, hi = s
    if hi is None: row['note'] = 'joined wider than 16 ft (open area)'; _chan[k] = row; return row
    row['separatingWidthFeet'] = round(lo + hi, 5)
    ch, how = BR.channels(A, c1, c2, hi)
    row['channelMethod'] = how
    row['channels'] = [BR.classify(lid, P, A) for P in ch]
    if not ch: row['note'] = 'no residual channel found at the separating radius'
    row['seconds'] = round(time.time() - t0, 1)
    _chan[k] = row; return row

def slim_channels(row):
    out = []
    for c in row.get('channels', []):
        cls, fix = CHANNEL_CLASS.get(c['class'], (c['class'], 'fix-seams' if 'slit' in c['class'] else None))
        e = {'room': row['room'], 'class': cls, 'channelClass': c['class'], 'fixFolder': fix, 'widthFeet': row.get('separatingWidthFeet'),
             'pointFeet': c.get('centroidFeet'), 'bounds': c.get('bounds')}
        nd = [d['nativeElementId'] for d in c.get('nativeDoors', [])]
        if nd: e['nativeDoors'] = nd
        for k in ('dwgDoorLines', 'dwgWallLines', 'lengthFeet', 'contact'):
            if c.get(k) not in (None, 0, []): e[k] = c[k]
        out.append(e)
    if not out:
        note = row.get('note') or 'no channel'
        cls = 'open area (joined wider than 16 ft)' if 'wider than 16' in note else 'unlocated (' + note + ')'
        out.append({'room': row['room'], 'class': cls, 'note': note, 'widthFeet': row.get('separatingWidthFeet')})
    return out

# ------------------------------------------------------------------ candidate-1 triage index
t1_by = collections.defaultdict(list)
for e in T1: t1_by[(e['flagClass'], e['levelId'])].append(e)
case1 = {}
for c in CASES1:
    if c['flagClass'] == 'ROOM_CORRIDOR_DOOR' and c['source'].startswith('flag'): case1[(c['levelId'], c['room'])] = c
for c in CASES1:
    if c['flagClass'] == 'ROOM_CORRIDOR_DOOR': case1.setdefault((c['levelId'], c['room']), c)

def best_t1(cls, lid, rooms):
    rs = set(rooms); best = None
    for e in t1_by[(cls, lid)]:
        ov = len(rs & set(e.get('unapproved') or e.get('rooms') or []))
        if ov and (best is None or ov > best[0]): best = (ov, e)
    return best[1] if best else None

# ------------------------------------------------------------------ expected-reason rules (triage.py) for flags without a candidate-1 entry
envgroups = J(RUN + '/envelope-followup/evidence/group-classification.json')['groups']
key2group = {r['key']: g for g in envgroups for r in g['records']}
S2 = LK.Static(CAND)
X = BR.X
slabs = []
for f in (X.get('walkingSupport') or {}).get('floors', []):
    g = unary_union([p for p in (poly_of(r) for r in f['partsFeet']) if p is not None]) if f.get('partsFeet') else poly_of(f.get('ringsFeet') or [])
    if g is not None: slabs.append((f.get('nativeElementId'), f.get('elevationFeet'), g))
PL = J(C2 + '/data/candidate/levels.json').get('nativePhysicalLevels') or {}
lvslab = {l['nativeLevelId']: set(l['nativeFloorElementIds']) for l in PL.get('levels', [])}

def rule_omitted(f):
    r = CAND.rec.get(f['key'], {}); o = S2.outlines.get(f['key']); lid = f['levelId']
    if o is None or o.area <= 0: return 'expected', 'no outline', f"{f['room']}: record has no outline."
    A = o.area
    excl = sum(g.intersection(o).area for _, g in S2.excl.get(lid, [])) / A
    env = S2.env.get(lid); envc = env.intersection(o).area / A if env is not None else 0
    own = unary_union([g for i, e, g in slabs if i in lvslab.get(lid, set())]) if lvslab.get(lid) else None
    slab = own.intersection(o).area / A if own is not None and not own.is_empty else 0
    num = f['room']; name = f.get('name') or ''
    if excl >= 0.5: return 'expected', 'excluded', f'{num} {name} lies in an exclusion ({excl:.0%}).'
    if r.get('stair') or num.split('-')[-1].startswith('S'):
        if slab >= 0.5 and envc < 0.1: return 'real-problem', 'envelope stops short', f'{num} {name}: {slab:.0%} on this level\'s slab but outside the walking envelope.'
        return 'expected', 'shaft or void record', f'{num} {name}: stair record, {slab:.0%} on this level\'s slab; no area holds a majority.'
    if slab >= 0.5 and envc < 0.5:
        g = key2group.get(f['key'])
        return 'real-problem', 'envelope stops short', f'{num} {name}: {slab:.0%} on this level\'s slab but only {envc:.0%} inside the walking envelope.' + (f' Envelope group {g["group"]}.' if g else '')
    if r.get('walkable') is False: return 'expected', 'shaft or void record', f'{num} {name}: non-walkable record.'
    return 'expected', 'not on any walking floor', f'{num} {name}: only {slab:.0%} on this level\'s slab (envelope {envc:.0%}).'

def rule_ratio(f):
    lid = f['levelId']; L = CAND.level(lid); g = next(x for x in L.regions if x['id'] == f['region'])
    rec = next((x for x in L.rooms(g) if x.get('number') == f['room']), None)
    if rec is None: return 'needs-review', 'record not found', '', []
    if rec.get('stair') or '-S' in f['room']: return 'expected', 'stair record vs walking area', f"{f['room']} {rec.get('name')}: the stair's walking area differs from the stair record outline (ratio {f['ratio']}).", []
    o = S2.outlines[rec['key']]; A = g['geom']
    big = [p for p in polys(A.difference(o)) if p.area >= 2]
    thick = max([2 * p.area / p.length for p in big], default=0)
    if thick <= 1.2: return 'expected', 'record outline wrong in Revit', f"{f['room']} {rec.get('name')}: the extra area is a thin strip ({thick:.2f} ft) between the Revit room outline and the wall faces (ratio {f['ratio']}).", []
    p = max(big, key=lambda q: q.area)
    core1 = A.intersection(o.buffer(-0.6, join_style=2)); nk = None
    try: nk = LK.neck(A, core1, p.buffer(-0.3, join_style=2)) if not core1.is_empty else None
    except Exception: nk = None
    cl = None
    if nk and nk.get('loc') is not None: cl, _ = LK.classify_neck(S2, lid, nk['loc'], nk['widthFeet'], g)
    w = nk.get('widthFeet') if nk else None
    if w is not None and w >= 5.5 and cl in (None, 'doorless opening'):
        return 'expected', 'record outline wrong in Revit', f"{f['room']} {rec.get('name')}: the extra {p.area:.0f} sq ft is inside the same walled room (joined {w:.2f} ft wide).", []
    loc = []
    if nk and nk.get('loc') is not None:
        c = nk['loc'].centroid; loc = [{'room': f['room'], 'class': cl if cl not in (None, 'doorless opening') else ('seam/crack' if (w or 0) < 0.1 else 'missing wall piece vs DWG'), 'widthFeet': round(w, 5) if w else w, 'pointFeet': [round(c.x, 3), round(c.y, 3)], 'bounds': [round(v, 2) for v in nk['loc'].bounds]}]
    return 'real-problem', (cl or 'separate space joined by a seam'), f"{f['room']} {rec.get('name')}: the area also holds a separate {p.area:.0f} sq ft space (joined {w if w is None else round(w, 4)} ft).", loc

# ------------------------------------------------------------------ triage
def tri_merge(fi, f):
    lid = f['levelId']; U = f['unapproved']
    g1all, g1, om1 = groups_by('c1', lid, U); gball, gb, omb = groups_by('b', lid, U)
    e = {'flagIndex': fi, 'flagClass': f['class'], 'levelId': lid, 'floor': NAME.get(lid), 'region': f['region'], 'regionArea': f['regionArea'], 'rooms': f['rooms'], 'unapproved': U,
         'approvedParts': f.get('approvedParts'), 'candidate1Groups': g1all, 'published73f7Groups': gball,
         'regressionVsCandidate1': len(g1) >= 2, 'regressionVs73f7': len(gb) >= 2, 'recoveredFromOmissionInCandidate1': om1}
    m = best_t1('UNEXPECTED_MERGE', lid, U)
    if m: e['candidate1Match'] = {'flagIndex': m['flagIndex'], 'rooms': m['unapproved'], 'triage': m['triage'], 'subclass': m['subclass'], 'removedSince': sorted(set(m['unapproved']) - set(U)), 'addedSince': sorted(set(U) - set(m['unapproved']))}
    if e['regressionVsCandidate1']:
        t, sub, why = 'real-problem', 'regression vs candidate 1', 'Rooms in different areas in candidate 1 now share one area: ' + ' | '.join(', '.join(x) for x in g1) + '.'
    elif m and m['triage'] == 'needs-owner':
        t, sub, why = 'real-problem', 'owner decision not effective', m['reason'] + ' Owner answered since (round3#Q5.3b / #Q5.4); still merged in candidate 2.'
    elif m and set(U) < set(m['unapproved']) and all(any(x['triage'] == 'expected' and x['rooms'] == [n] for x in t1_by[('ROOM_CORRIDOR_DOORLESS', lid)]) for n in U):
        # the rooms that made the candidate-1 merge real are gone; what is left was triaged expected in candidate 1
        x = next(x for x in t1_by[('ROOM_CORRIDOR_DOORLESS', lid)] if x['rooms'] == [U[0]])
        t, sub, why = 'expected', x['subclass'], f"Candidate-1 merge reduced: {', '.join(e['candidate1Match']['removedSince'])} now separate. Left: " + x['reason']
    elif m:
        t, sub, why = m['triage'], m['subclass'], m['reason']
        if e['candidate1Match']['removedSince']: why += f" (Since candidate 1, {', '.join(e['candidate1Match']['removedSince'])} separated.)"
    else:
        t, sub, why = 'real-problem', 'new merge (not flagged in candidate 1)', ', '.join(U) + ' share one area' + (f'; {", ".join(om1)} had no area in candidate 1 (recovered)' if om1 else '') + '.'
    if e['regressionVs73f7'] and not e['regressionVsCandidate1']: why += ' Separate in 73f7 (' + ' | '.join(', '.join(x) for x in gb) + ').'
    locs = []
    if t != 'expected':
        for n in U[:12]: locs += slim_channels(room_channels(lid, n, f['region']))
    e.update({'triage': t, 'subclass': sub, 'reason': why, 'leakLocations': locs, 'fixFolders': sorted({x['fixFolder'] for x in locs if x.get('fixFolder')})})
    return e

def tri_rc(fi, f):
    lid = f['levelId']; n = f['room']; cor = [c for c in f.get('corridor', []) if not c.startswith('(')]
    e = {'flagIndex': fi, 'flagClass': f['class'], 'levelId': lid, 'floor': NAME.get(lid), 'region': f['region'], 'regionArea': f['regionArea'], 'rooms': [n], 'corridor': f.get('corridor')}
    r1, rb = REG['c1'].get((lid, n)), REG['b'].get((lid, n))
    # regression: the room had an area in the earlier build that held none of the corridors it now shares an area with
    # (corridors omitted earlier and recovered now count: the room was independently selectable and no longer is)
    c1flag = any(x['class'] == f['class'] and x['levelId'] == lid and x.get('room') == n for x in L1['flags'])
    bflag = any(x['class'] == f['class'] and x['levelId'] == lid and x.get('room') == n for x in L2['beforeFlags'])
    e['regressionVsCandidate1'] = bool(r1 and (not any(REG['c1'].get((lid, c)) == r1 for c in cor) if cor else not c1flag))
    e['regressionVs73f7'] = bool(rb and (not any(REG['b'].get((lid, c)) == rb for c in cor) if cor else not bflag))
    if e['regressionVsCandidate1']: e['corridorsInCandidate1'] = {c: REG['c1'].get((lid, c)) for c in cor}
    if f['class'] == 'ROOM_CORRIDOR_DOOR':
        c1 = case1.get((lid, n)); e['candidate1Cause'] = c1['cause'] if c1 else None
        m = None
    else:
        m = next((x for x in t1_by[('ROOM_CORRIDOR_DOORLESS', lid)] if x['rooms'] == [n]), None)
    row = room_channels(lid, n, f['region']); locs = slim_channels(row)
    passthrough = [d['nativeElementId'] for d in row.get('roomDoors', []) if d.get('passThrough')]
    if e['regressionVsCandidate1']:
        rec_ = [c for c in cor if not REG['c1'].get((lid, c))]
        t, sub, why = 'real-problem', 'regression vs candidate 1', f'{n} had its own area in candidate 1 (no shared area with {", ".join(cor) or "circulation"}); it now shares one' + (f' (corridors recovered since candidate 1: {", ".join(rec_)})' if rec_ else '') + '.'
    elif f['class'] == 'ROOM_CORRIDOR_DOOR' and (e.get('candidate1Cause') == 'D4' or passthrough):
        t, sub, why = 'expected', 'owner pass-through door', f'{n}: owner pass-through door {passthrough or "(candidate-1 cause D4)"}; selectionDoorThresholds keeps it open.'
    elif m and m['triage'] == 'expected':
        t, sub, why = 'expected', m['subclass'], m['reason']
    elif m:
        t, sub, why = m['triage'], m['subclass'], m['reason']
    else:
        cls = sorted({x['class'] for x in locs})
        t, sub = 'real-problem', ' + '.join(cls)
        why = f'{n} shares its area with {", ".join(f.get("corridor") or [])}' + (f" ({f.get('doorEvidence')})" if f.get('doorEvidence') else '') + f'; channel: {", ".join(cls)}' + (f" ({row.get('note')})" if row.get('note') else '') + '.'
    if e['regressionVs73f7'] and not e['regressionVsCandidate1']: why += ' Separate in 73f7.'
    e.update({'triage': t, 'subclass': sub, 'reason': why, 'leakLocations': locs if t != 'expected' else [], 'fixFolders': sorted({x['fixFolder'] for x in locs if x.get('fixFolder')}) if t != 'expected' else []})
    return e

def tri_other(fi, f):
    lid = f['levelId']; cls = f['class']
    e = {'flagIndex': fi, 'flagClass': cls, 'levelId': lid, 'floor': NAME.get(lid), 'region': f.get('region'), 'rooms': f.get('rooms') or [f.get('room')]}
    if cls == 'OMITTED':
        e['key'] = f['key']; e['name'] = f.get('name')
        e['regressionVsCandidate1'] = bool(REG['c1'].get((lid, f['room']))); e['regressionVs73f7'] = bool(REG['b'].get((lid, f['room'])))
        m = next((x for x in t1_by[('OMITTED', lid)] if x.get('key') == f['key']), None)
        if e['regressionVsCandidate1']: t, sub, why = 'real-problem', 'regression vs candidate 1', f"{f['room']} had a selectable area in candidate 1."
        elif m: t, sub, why = m['triage'], m['subclass'], m['reason']
        else: t, sub, why = rule_omitted(f)
        e.update({'triage': t, 'subclass': sub, 'reason': why, 'leakLocations': []})
        return e
    if cls == 'AREA_RATIO':
        e.update({'ratio': f['ratio'], 'regionArea': f['regionArea'], 'outlineArea': f['outlineArea']})
        m = next((x for x in t1_by[('AREA_RATIO', lid)] if x['rooms'] == [f['room']]), None)
        if m and abs((m.get('ratio') or 0) - f['ratio']) <= 0.1:
            e['candidate1Ratio'] = m.get('ratio'); t, sub, why = m['triage'], m['subclass'], m['reason']
            locs = [] if t == 'expected' else (m.get('leakLocations') or [])
            if t != 'expected':
                t_, sub_, why_, locs_ = rule_ratio(f)
                if t_ == 'expected': t, sub, why = t_, sub_, why_ + ' (candidate 1: ' + m['subclass'] + ')'; locs = []
                else: locs = locs_
        else:
            if m: e['candidate1Ratio'] = m.get('ratio')
            t, sub, why, locs = rule_ratio(f)
        e.update({'triage': t, 'subclass': sub, 'reason': why, 'leakLocations': locs})
        return e
    if cls == 'OPEN_TO_OUTSIDE':
        e['exposedEdgeFeet'] = f['exposedEdgeFeet']
        loc = [l for l in f.get('leaks', []) if l.get('pointFeet')]
        if not loc:
            t, sub, why = 'expected', 'wall-backed slab edge', f"{f['exposedEdgeFeet']} ft of the area edge lies on the slab edge, every piece backed by a cut wall, curtain wall, door or neighbouring area within 0.15 ft (no open piece found)."
        else:
            p = loc[0]['pointFeet']; m = None
            for x in t1_by[('OPEN_TO_OUTSIDE', lid)]:
                pts = [y.get('pointFeet') for y in (x.get('leakLocations') or []) + (x.get('expectedEdgeLocations') or []) if y.get('pointFeet')]
                if set(x['rooms']) & set(e['rooms']) and any(math.hypot(q[0] - p[0], q[1] - p[1]) < 3.0 for q in pts): m = x; break
            if m: t, sub, why = m['triage'], m['subclass'], m['reason']
            elif loc[0]['class'] == 'stair/void': t, sub, why = 'expected', 'mezzanine/void', f'Open edge at {p} is a stair/void edge (tread, ramp or exclusion within 1 ft).'
            elif any(lid == r[0] and math.hypot(r[1][0] - p[0], r[1][1] - p[1]) < 1.0 for r in REVIEWED_GLASS_EDGES): t, sub, why = 'expected', 'slab edge inside curtain wall', f"Open edge at {p} is the slab edge 0.33 ft inside the curtain-wall glass line (reviewed candidate 15: native curtain pieces #1778909 / #1778936 run parallel beyond it; the area is enclosed by the facade)."
            else: t, sub, why = 'real-problem', 'facade gap', f"{loc[0].get('widthFeet')} ft open facade piece at {p} with nothing beyond; DWG wall lines nearby: {loc[0].get('dwgWallLines')}."
            if t == 'needs-owner' and 'slab cap' in sub: t, sub, why = 'real-problem', 'owner decision not effective', why + ' Owner answered Q5.3b (exclusion built in candidate 2); still exposed.'
        e.update({'triage': t, 'subclass': sub, 'reason': why, 'leakLocations': [dict(l, fixFolder='fix-walls') for l in loc] if t == 'real-problem' else [], 'expectedEdgeLocations': loc if t == 'expected' else []})
        return e
    raise ValueError(cls)

# Reviewed in candidate 15 (06-340 / 06-342 after the round 12 q12.5 split): slab edge 0.326 ft inside the native curtain wall.
REVIEWED_GLASS_EDGES = [(1487353, (-148.792, -122.015)), (1487353, (-138.534, -115.718))]

def candidate1_counts():
    cnt = collections.defaultdict(collections.Counter)
    for e in T1: cnt[e['flagClass']][e['triage']] += 1
    for f in L1['flags']:
        if f['class'] == 'ROOM_CORRIDOR_DOOR':
            c = case1.get((f['levelId'], f['room']))
            cnt['ROOM_CORRIDOR_DOOR']['expected' if c and c['cause'] == 'D4' else 'real-problem'] += 1
    return {k: dict(v) for k, v in cnt.items()}

if __name__ == '__main__':
    t0 = time.time(); out = []
    import re
    RB = J(C2 + '/data/rebind-report.json') if os.path.exists(C2 + '/data/rebind-report.json') else {'stale': [], 'outcomes': []}
    REC = J(C2 + '/data/candidate/receipt.json') if os.path.exists(C2 + '/data/candidate/receipt.json') else {}
    FRESH_OK = {x['id'] for x in REC.get('freshBound', []) if x.get('applied')}  # bound afresh and applied by derive step 2b
    STALE = [(o['id'], set(re.findall(r'\d\d-\d+[A-Z]?', o['id'])), o.get('reason'), o.get('differences')) for o in RB.get('outcomes', []) if o['outcome'] == 'needs-review' and o['id'] not in FRESH_OK]
    for fi, f in enumerate(L2['flags']):
        if f['class'] == 'UNEXPECTED_MERGE': e = tri_merge(fi, f)
        elif f['class'] in ('ROOM_CORRIDOR_DOOR', 'ROOM_CORRIDOR_DOORLESS'): e = tri_rc(fi, f)
        else: e = tri_other(fi, f)
        for sid, nums, why_, diff in STALE:
            if nums & set(e.get('rooms') or []) and str(f['levelId']) in sid:
                e['stalePartition'] = {'id': sid, 'reason': why_, 'differences': diff}
                if e['triage'] != 'expected':
                    e['subclass'] = 'owner decision not effective (stale partition)'
                    e['reason'] = f'Partition {sid} is stale after the approved-change re-bind ({why_} differences: {diff}) and is omitted from selection. ' + e['reason']
        # candidate-floors-9: owner round 8 (user-decisions/2026-10-13-round8.json) keeps these spaces as they are
        R8 = [({'07-301', '07-312', '07-300', '07-S205', '07-302'}, '2026-10-13-round8#q8.1 (one open food hall)'),
              ({'05-476', '05-481', '05-492', '05-486', '05-400'}, '2026-10-13-round8#q8.3 (one open library work area)'),
              ({'05-170E', '05-168B', '05-168', '05-168A'}, '2026-10-13-round8#q8.4 (kitchenette open to the circulation)')]
        R8 += [({"03-1050", "03-1051", "03-1051E"}, "2026-10-13-round9#q9.6 (left open)"), ({"03-1063", "03-1056", "03-1065B", "03-1065"}, "2026-10-13-round9#q9.7 (left open)"), ({"06-262", "06-254", "06-272", "06-270"}, "2026-10-13-round9#q9.11 (left open)"), ({"09-321", "09-320"}, "2026-10-13-round9#q9.14 (left open)")]
        # candidate-floors-16: owner round 10 (user-decisions/2026-10-13-round10.json) leaves these open; round 8 q8.2 keeps 06-250/06-252 one events area
        R10 = [({'08-145', '08-146', '08-149', '08-102', '08-110', '08-105'}, 'q10.2'), ({'06-280', '06-260'}, 'q10.3'), ({'06-254', '06-262', '06-270', '06-272', '06-274', '06-280'}, 'q9.11 + q9.12 + q10.3 (pub, kitchen and dry goods left open)'), ({'03-1058', '03-1059'}, 'q10.5'),
               ({'03-1081', '03-1085', '03-1089', '03-1082', '03-1099'}, 'q10.6'),
               ({'03-1005', '03-1010', '03-1010B', '03-1013', '03-1013A', '03-1022', '03-1030', '03-1031', '03-1038', '03-1038A', '03-1020', '03-1010A'}, 'q10.7'),
               ({'09-330', '09-332', '09-333', '09-334', '09-336', '09-338', '09-340'}, 'q10.9 (the whole open lab shown orange)'), ({'03-2095', '03-2002'}, 'q10.10 (lounge)'), ({'08-337', '08-338', '08-342', '08-340'}, 'q10.11'),
               ({'06-370', '06-372', '06-376'}, 'q10.12'), ({'06-302', '06-301'}, 'q10.13 (Elect stays a label)'), ({'10-4306', '10-4304'}, 'q10.14 (alcove)'),
               ({'08-436', '08-437', '08-440'}, 'q10.15'), ({'10-4548', '10-4504', '10-S403', '10-4572'}, 'q10.16'), ({'10-B516', '10-S002'}, 'q10.17'),
               ({'07-313', '07-314', '07-507'}, 'q10.18')]
        R8 += [(g, f'2026-10-13-round10#{q} (left open)') for g, q in R10] + [({'06-250', '06-252'}, '2026-10-13-round8#q8.2 (one events area)')]
        R8 += [({'06-314'}, '2026-10-13-round11#q11.1 (area stops at the walking-envelope edge short of the facade wall; no opening, verified picture)'), ({'06-313'}, '2026-10-13-round11#q11.1 (area stops at the walking-envelope edge; no opening)'),
               ({'06-346'}, '2026-10-13-round11#q11.1 (area stops at the walking-envelope edge; no opening)'), ({'06-344'}, '2026-10-13-round11#q11.1 (area stops at the walking-envelope edge; no opening)')]
        R8_AREA_EXTRA = {"06-274": "2026-10-13-round9#q9.12 (left open)", "04-444": "2026-10-13-round9#q9.17 (left open)"}
        R8_AREA_EXTRA.update({'10-2094': '2026-10-13-round11#q11.5 (one washroom with its stalls)', '09-205': '2026-10-13-round11#q11.6 (left as is)'})
        R8_AREA = {'08-219': '2026-10-13-round8#q8.5 (the west pocket belongs to 08-219)', '06-235': '2026-10-13-round8#q8.6 (the east wedge belongs to the washroom)',
                   '06-213': '2026-10-13-round8#q8.7 (the ring is the theatre back aisle)'}
        R8_AREA.update(R8_AREA_EXTRA)
        involved = set(e.get('rooms') or []) | set(e.get('corridor') or [])
        if e['triage'] != 'expected' and involved:
            own = set(e.get('rooms') or [])
            why8 = (R8_AREA[next(iter(involved))] if e['flagClass'] == 'AREA_RATIO' and len(involved) == 1 and next(iter(involved)) in R8_AREA
                    else next((w for g, w in R8 if involved <= g), None)
                    or (next((w for g, w in R8 if own and own <= g), None) if e['flagClass'] in ('ROOM_CORRIDOR_DOOR', 'ROOM_CORRIDOR_DOORLESS') else None)
                    or (R8_AREA.get(next(iter(own))) if len(own) == 1 and e['flagClass'] in ('ROOM_CORRIDOR_DOOR', 'ROOM_CORRIDOR_DOORLESS') else None))
            if why8:
                e['triage'], e['subclass'], e['reason'] = 'expected', 'owner decision (rounds 8-10)', why8 + '. ' + e['reason']
        out.append(e)
        if f['class'] in ('UNEXPECTED_MERGE', 'ROOM_CORRIDOR_DOOR', 'ROOM_CORRIDOR_DOORLESS'): print(fi, f['class'], NAME.get(f['levelId']), e['rooms'][:5], e['triage'], e['subclass'][:60], round(time.time() - t0), flush=True)
    cnt = collections.defaultdict(collections.Counter)
    for e in out: cnt[e['flagClass']][e['triage']] += 1
    c2 = {k: dict(v) for k, v in cnt.items()}; c1 = candidate1_counts()
    b = collections.Counter(f['class'] for f in L2['beforeFlags'])
    tot = lambda c: dict(sum((collections.Counter(v) for v in c.values()), collections.Counter()))
    regress = [e for e in out if e.get('regressionVsCandidate1') or e.get('regressionVs73f7')]
    regress.sort(key=lambda e: (not e.get('regressionVsCandidate1'), e['flagClass'] != 'UNEXPECTED_MERGE', e['levelId']))
    real_loc = collections.Counter(l['class'] for e in out if e['triage'] != 'expected' for l in e.get('leakLocations', []))
    # candidate-1 real flags that are gone
    sig = lambda e: (e['flagClass'], e['levelId'], tuple(sorted(e.get('unapproved') or e.get('rooms') or [])))
    c2u = collections.defaultdict(set)
    for e in out: c2u[(e['flagClass'], e['levelId'])] |= set(e.get('unapproved') or e.get('rooms') or [])
    gone = [{'flagClass': e['flagClass'], 'levelId': e['levelId'], 'rooms': e.get('unapproved') or e['rooms'], 'candidate1Triage': e['triage'], 'subclass': e['subclass']}
            for e in T1 if not (set(e.get('unapproved') or e.get('rooms') or []) & c2u[(e['flagClass'], e['levelId'])])]
    doc = {'format': 'unbc-candidate2-leak-audit-v2', 'version': 1, 'method': __doc__,
           'counts': {'candidate2': c2, 'candidate2Totals': tot(c2), 'candidate1': c1, 'candidate1Totals': tot(c1), 'published73f7Raw': dict(b), 'published73f7RawTotal': sum(b.values()),
                      'candidate2Raw': dict(collections.Counter(f['class'] for f in L2['flags'])), 'candidate1Raw': dict(collections.Counter(f['class'] for f in L1['flags'])),
                      'realLeakLocationsByClass': dict(real_loc)},
           'regressions': [{k: e.get(k) for k in ('flagIndex', 'flagClass', 'floor', 'levelId', 'region', 'rooms', 'unapproved', 'corridor', 'candidate1Groups', 'published73f7Groups', 'regressionVsCandidate1', 'regressionVs73f7', 'triage', 'subclass', 'reason', 'leakLocations') if e.get(k) is not None} for e in regress],
           'candidate1FlagsGone': gone, 'flags': out}
    os.makedirs(C2 + '/triage', exist_ok=True)
    json.dump(doc, open(C2 + '/triage/flags.json', 'w'), indent=1, default=str)
    print('counts c2', c2); print('counts c1', c1); print('73f7 raw', dict(b)); print('regressions', len(regress), 'gone', len(gone))
    if 'images' in sys.argv[1:]:
        real = []
        for e in out:
            if e['triage'] == 'expected': continue
            ls = [l for l in e.get('leakLocations', []) if l.get('bounds') and l.get('pointFeet')]
            if ls: real.append({'class': e['flagClass'] + (' (REGRESSION)' if e.get('regressionVsCandidate1') or e.get('regressionVs73f7') else ''), 'levelId': e['levelId'], 'region': e['region'],
                                'regionArea': e.get('regionArea') or L2['flags'][e['flagIndex']].get('regionArea'), 'rooms': e.get('rooms'), 'corridor': e.get('corridor'), 'leaks': ls, '_e': e})
        imgs = LK.leak_images(real, LK.Static(BEFORE), S2)
        for r in real:
            for l in r['leaks']:
                if l.get('image'): l['image'] = l['image']
        doc['images'] = imgs
        json.dump(doc, open(C2 + '/triage/flags.json', 'w'), indent=1, default=str)
        print('images', len(imgs))
    lv2 = {'format': 'unbc-candidate2-leaks-v2-summary', 'counts': doc['counts'], 'regressions': doc['regressions'], 'images': doc.get('images', []), 'triage': 'triage/flags.json'}
    json.dump(lv2, open(C2 + '/leaks-v2.json', 'w'), indent=1, default=str)
