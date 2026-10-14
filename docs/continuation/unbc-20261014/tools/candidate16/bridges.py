"""Exact connection channels between a target room and the rest of its selectable area (light).
The audit's leak point is the nearest-point pair between the two eroded sides at the separating radius; when the
real connection is elsewhere that point sits across a wall (e.g. 1.59 ft necks at wall T-junctions). Here, at the
separating radius r (bisection as in leaks.py), the morphological openings R (room side) and Q (rest side) are
rebuilt and the residual pieces of A - R - Q that touch both are the channels the area actually flows through.
Each channel is classified against native doors (masked footprint, jamb gap beside the footprint, door not
masked), registered DWG door / wall lines. Writes fix-doors/bridges.json.
python3 bridges.py [level:room ...]"""
import sys, json, math
sys.path.insert(0, '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009/candidate-floors-16/scripts')  # candidate-floors-9 copy
from diagnose_lib import *
from shapely.geometry import Polygon, Point, box, LineString
from shapely.ops import unary_union, nearest_points

outl = {}
for r in json.load(open(CF + '/data/candidate/record-outlines.json')):
    p = poly_of(r['outline'] or [])
    if p is not None: outl[r['key']] = p
num2key = {}
for k, r in rec.items():
    if r.get('number'): num2key.setdefault((r['levelId'], r['number']), []).append(k)

def comps(g): return [p for p in polys(g) if p.area > 1e-9]
def joined(A, r, c1, c2):
    E = A.buffer(-r, join_style=2) if r > 0 else A
    return any(p.intersects(c1) and p.intersects(c2) for p in comps(E))
RADII = [1e-6, 1e-5, 1e-4, 1e-3, 0.005, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.5, 8.0]
def separate(A, c1, c2):
    if not joined(A, 0, c1, c2): return None
    lo, hi = 0.0, None
    for r in RADII:
        if joined(A, r, c1, c2): lo = r
        else: hi = r; break
    if hi is None: return (lo, None)
    for _ in range(8):
        mid = math.sqrt(lo * hi) if lo > 0 else hi / 10
        if joined(A, mid, c1, c2): lo = mid
        else: hi = mid
    return lo, hi

def channels(A, c1, c2, hi):
    """Residual pieces of A outside the openings of all eroded components, on a path from the room side to the rest."""
    import collections
    E = A.buffer(-hi, join_style=2)
    K = comps(E)
    opened = [k.buffer(hi, join_style=2).intersection(A) for k in K]
    U = unary_union([o.buffer(1e-7) for o in opened]) if opened else None
    N = [P for P in comps(A.difference(U))] if U is not None else []
    N = [P for P in N if P.area > 1e-8]
    touch = [[i for i, o in enumerate(opened) if P.distance(o) < 1e-5] for P in N]
    src = [i for i, k in enumerate(K) if k.intersects(c1)]
    dst = {i for i, k in enumerate(K) if k.intersects(c2) and i not in src}
    # graph: component i <-> residual r
    adj = collections.defaultdict(list)
    for r, ts in enumerate(touch):
        for i in ts: adj[('k', i)].append(('r', r)); adj[('r', r)].append(('k', i))
    prev = {('k', i): None for i in src}; q = collections.deque(prev); hit = None
    while q:
        u = q.popleft()
        if u[0] == 'k' and u[1] in dst: hit = u; break
        for v in adj[u]:
            if v not in prev: prev[v] = u; q.append(v)
    path = []
    while hit is not None:
        if hit[0] == 'r': path.append(N[hit[1]])
        hit = prev[hit]
    if path: return path, 'residual path'
    # fallback (tiny radius: an exact pinch): nearest points of the two eroded sides, kept only when the segment lies in A
    s1 = unary_union([K[i] for i in src]) if src else None; s2 = unary_union([K[i] for i in dst]) if dst else None
    if s1 is None or s2 is None: return [], 'no sides'
    p1, p2 = nearest_points(s1, s2)
    seg = LineString([p1, p2]) if p1.distance(p2) > 1e-9 else Point(p1).buffer(1e-6)
    ok = A.buffer(1e-6).contains(seg)
    return [seg.buffer(max(hi, 0.01))], 'nearest points (segment inside area)' if ok else 'nearest points ACROSS material (unreliable)'

def axes(d):
    n = d['normalFeet']; h = math.hypot(*n); n = (n[0] / h, n[1] / h); return (-n[1], n[0]), n
def proj(pts, u): v = [p[0] * u[0] + p[1] * u[1] for p in pts]; return min(v), max(v)
def rect(t, n, a0, a1, b0, b1):
    at = lambda a, b: (t[0] * a + n[0] * b, t[1] * a + n[1] * b)
    return Polygon([at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)])

def classify(lid, P, A):
    ev = {'centroidFeet': [round(P.centroid.x, 3), round(P.centroid.y, 3)], 'bounds': [round(v, 3) for v in P.bounds], 'area': round(P.area, 5)}
    near = []
    for nid, lst in doors.items():
        for d in lst:
            if d['levelId'] != lid or not d.get('footprintFeet') or not d.get('normalFeet'): continue
            fp = Polygon(d['footprintFeet'])
            if fp.distance(P) > 0.35: continue
            t, n = axes(d); tb = proj(d['footprintFeet'], t); nb = proj(d['footprintFeet'], n)
            band = rect(t, n, tb[0] - 1.5, tb[1] + 1.5, nb[0], nb[1])
            inb = P.intersection(band)
            info = {'nativeElementId': nid, 'id': d['id'], 'state': d['state'], 'rooms': [rec.get(k, {}).get('number') for k in d['roomKeys']], 'roomKeys': d['roomKeys'],
                    'passThrough': (lid, nid) in thr, 'closureRecord': (lid, nid) in clo, 'overlap': round(A.intersection(fp).area, 6), 'distFeet': round(fp.distance(P), 4),
                    'widthFeet': round(tb[1] - tb[0], 4), 'depthFeet': round(nb[1] - nb[0], 4)}
            if not inb.is_empty and inb.area > 1e-7:
                pts = [c for q in polys(inb) for c in q.exterior.coords]
                pt = proj(pts, t); pn = proj(pts, n)
                side = 'A' if pt[1] <= tb[0] + 0.05 else ('B' if pt[0] >= tb[1] - 0.05 else 'through')
                info['inBand'] = {'side': side, 'tangentFromEnd': [round(pt[0] - tb[0], 5), round(pt[1] - tb[0], 5)] if side != 'B' else [round(pt[0] - tb[1], 5), round(pt[1] - tb[1], 5)],
                                  'gapFeet': round((tb[0] - pt[0]) if side == 'A' else (pt[1] - tb[1]) if side == 'B' else 0, 5), 'normalCoverage': round((pn[1] - pn[0]) / (nb[1] - nb[0]), 3)}
            near.append(info)
    ev['nativeDoors'] = near
    ev['dwgDoorLines'] = len(dwg_near(lid, P.buffer(0.3), 'door'))
    ev['dwgWallLines'] = len(dwg_near(lid, P.buffer(0.02), 'wall'))
    other = [{'nativeElementId': nid, 'levelId': d['levelId'], 'state': d['state']} for nid, lst in doors.items() for d in lst if d['levelId'] != lid and d.get('footprintFeet') and Polygon(d['footprintFeet']).distance(P) < 0.5]
    ev['otherLevelDoors'] = other
    banded = [x for x in near if 'inBand' in x and x['inBand']['normalCoverage'] > 0.95]
    if any(x['overlap'] > 1e-4 for x in near): cls = 'door not masked'
    elif banded: cls = 'jamb gap beside door footprint'
    elif near: cls = 'opening next to a masked door (not through it)'
    elif ev['dwgDoorLines']: cls = 'DWG door, no Revit door'
    elif ev['dwgWallLines']: cls = 'missing wall piece vs DWG'
    else: cls = 'doorless opening'
    ev['class'] = cls
    return ev

if __name__ == '__main__':
    targets = {}
    for f in L['flags']:
        for lk in f.get('leaks', []):
            if lk['class'] == 'door without selection closure':
                t = targets.setdefault((f['levelId'], lk['room']), {'flags': set(), 'leakClasses': set(), 'region': f['region'], 'auditLeaks': []})
                t['flags'].add(f['class']); t['leakClasses'].add(lk['class'])
                if lk.get('pointFeet') and lk['pointFeet'] not in [a['pointFeet'] for a in t['auditLeaks']]: t['auditLeaks'].append({'pointFeet': lk['pointFeet'], 'widthFeet': lk['widthFeet'], 'nativeDoors': lk.get('nativeDoors'), 'class': lk['class'], 'image': lk.get('image')})
        if f['class'] == 'ROOM_CORRIDOR_DOOR':
            t = targets.setdefault((f['levelId'], f['room']), {'flags': set(), 'leakClasses': set(), 'region': f['region'], 'auditLeaks': []})
            t['flags'].add('ROOM_CORRIDOR_DOOR'); t['corridor'] = f['corridor']; t['doorEvidence'] = f['doorEvidence']
            for lk in f.get('leaks', []):
                t['leakClasses'].add(lk['class'])
                if lk.get('pointFeet') and lk['pointFeet'] not in [a['pointFeet'] for a in t['auditLeaks']]: t['auditLeaks'].append({'pointFeet': lk['pointFeet'], 'widthFeet': lk.get('widthFeet'), 'nativeDoors': lk.get('nativeDoors'), 'class': lk['class'], 'image': lk.get('image')})
    only = set(sys.argv[1:])
    out = []
    import time
    for (lid, number), t in sorted(targets.items()):
        if only and f'{lid}:{number}' not in only: continue
        t0 = time.time()
        Lv = C.level(lid)
        g = next((g for g in Lv.regions if g['id'] == t['region']), None)
        keys = [k for k in num2key.get((lid, number), []) if g and k in g['roomKeys']]
        row = {'levelId': lid, 'room': number, 'keys': keys, 'flags': sorted(t['flags']), 'auditLeakClasses': sorted(t['leakClasses']), 'auditLeaks': t['auditLeaks'], 'region': t['region'], 'corridor': t.get('corridor'), 'doorEvidence': t.get('doorEvidence'), 'channels': []}
        if not g or not keys or not any(k in outl for k in keys): row['note'] = 'no region/outline'; out.append(row); continue
        A = g['geom']; O = unary_union([outl[k] for k in keys if k in outl])
        c1 = A.intersection(O.buffer(-0.6, join_style=2))
        if c1.is_empty or c1.area < 0.05: c1 = A.intersection(O)
        # rest side = the other room records held by this area (their outline cores), not every pocket outside the outline:
        # a dead-end pocket of the same area beyond the outline would otherwise decide the separating radius.
        oth = [outl[k] for k in g['roomKeys'] if k not in keys and k in outl]
        c2 = A.intersection(unary_union([o.buffer(-0.6, join_style=2) for o in oth])).difference(O.buffer(0.6, join_style=2)) if oth else A.difference(O.buffer(0.6, join_style=2))
        if c2.is_empty or c2.area < 0.05: c2 = A.intersection(unary_union(oth)).difference(O.buffer(0.6, join_style=2)) if oth else c2
        row['otherRecords'] = len(oth)
        row['roomDoors'] = [{'nativeElementId': d['nativeElementId'], 'state': d['state'], 'rooms': [rec.get(k, {}).get('number') for k in d['roomKeys']], 'passThrough': (lid, d['nativeElementId']) in thr,
                             'closureRecord': (lid, d['nativeElementId']) in clo, 'measured': bool(d.get('footprintFeet') and d.get('normalFeet')), 'overlap': round(A.intersection(Polygon(d['footprintFeet'])).area, 6) if d.get('footprintFeet') else None}
                            for nid, lst in doors.items() for d in lst if d['levelId'] == lid and set(d['roomKeys']) & set(keys)]
        if c1.is_empty or c2.is_empty or c2.area < 0.05: row['note'] = 'outline does not split the area'; out.append(row); continue
        # The slim rings are rounded to 1e-5 ft: production faces joined only by a sub-1e-5 ft seam come out as parts
        # touching at a point. Follow such contacts first (part graph), then measure channels inside one part.
        parts = [p for p in polys(A) if p.area > 1e-7]
        same = [p for p in parts if p.intersects(c1) and p.intersects(c2) and joined(p, 0, c1.intersection(p), c2.intersection(p))]
        if not same:
            import collections
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
                # one production face whose exact ring reaches the other lobes only through zero-area slits
                # (collinear edges traversed both ways); the slim polygon drops them.
                sl = []
                for rr in g['rings']:
                    segs = [LineString([a, b]) for a, b in zip(rr, rr[1:] + [rr[0]]) if a != b]
                    for i in range(len(segs)):
                        for j in range(i + 2, len(segs)):
                            if i == 0 and j == len(segs) - 1: continue
                            x = segs[i].intersection(segs[j])
                            if x.geom_type in ('LineString', 'MultiLineString') and x.length > 1e-6: sl.append(x)
                near = [x for x in sl if x.distance(O) < 3.0]
                row['note'] = 'joined only through zero-area slits of the exact face ring (encoder pinch); not a door' if sl else 'cores not joined'
                row['slits'] = [{'midFeet': [round(x.centroid.x, 3), round(x.centroid.y, 3)], 'lengthFeet': round(x.length, 4), 'distToOutline': round(x.distance(O), 3),
                                 'doorsWithin0.3': [nid for nid, lst in doors.items() for d in lst if d['levelId'] == lid and d.get('footprintFeet') and Polygon(d['footprintFeet']).distance(x) < 0.3]} for x in (near or sl)[:12]]
                row['slitCount'] = len(sl)
                out.append(row); print(lid, number, row['note'], len(sl), flush=True); continue
            path = []
            while prev[hit] is not None: path.append((prev[hit], hit)); hit = prev[hit]
            row['separatingWidthFeet'] = 0.0
            for i, j in path:
                P = parts[i].buffer(2e-5).intersection(parts[j].buffer(2e-5))
                ev = classify(lid, P, A); ev['contact'] = 'sub-1e-5 ft seam or exact point contact between faces (slim rings)'
                ev['class'] = ('seam at door jamb' if ev['nativeDoors'] else 'seam/point contact (not a door)')
                row['channels'].append(ev)
            row['seconds'] = round(time.time() - t0, 1); out.append(row)
            print(lid, number, 'seam path', [c['class'] for c in row['channels']], flush=True); continue
        A = same[0]; c1 = c1.intersection(A); c2 = c2.intersection(A)
        s = separate(A, c1, c2)
        if s is None: row['note'] = 'cores not joined'; out.append(row); continue
        lo, hi = s
        if hi is None: row['note'] = 'joined wider than 16 ft (open area)'; row['separatingRadius'] = None; out.append(row); continue
        row['separatingWidthFeet'] = round(lo + hi, 5)
        ch, how = channels(A, c1, c2, hi)
        row['channelMethod'] = how
        row['channels'] = [classify(lid, P, A) for P in ch]
        if not ch: row['note'] = 'no residual channel found at the separating radius'
        row['seconds'] = round(time.time() - t0, 1)
        out.append(row)
        print(lid, number, row.get('separatingWidthFeet'), [c['class'] for c in row['channels']], row['seconds'], flush=True)
    fn = FD + ('/bridges.json' if not only else '/bridges.partial.json')
    json.dump(out, open(fn, 'w'), indent=1)
