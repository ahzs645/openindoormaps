"""All-floor building-junction census on the computed selectable areas (walking floor, not routing).
Light: reads the slim outputs of derive-areas.mts (data/<mode>/...) plus the compiled-2fad94 connector extract for tread
elevations. Writes fix-junctions/junctions-all.json.

Graph per mode: node = selectable area (region) on a native level. Edges:
  shared  - one area holds rooms of both buildings (no edge needed: the area itself is the junction)
  door    - two walkable areas on the same level within 0.75 ft of one measured native door footprint (selection closed there)
  touch   - two areas on the same level share >= 0.5 ft of boundary (selection-only partition line)
  stair   - native flight: areas on a served level within 1.0 ft (plan) of a tread within 1.2 ft (height) of that level
  ramp    - native ramp: areas holding landing:ramp:<id>:lower/upper, or within 1.0 ft of the ramp's low/high edge
  lift    - lift recipe entrance room keys
Pair classification per native level: continuous if a same-level path (door/touch) joins areas of both buildings;
per display floor: continuous / connector (path needs a stair, ramp or lift inside the floor's native levels) / disconnected.
Paths are searched inside the junction neighbourhood (areas within 80 ft of the zone where the two building footprints come
within 20 ft); the unrestricted shortest path is also reported (via = other buildings crossed)."""
import sys, os, json, math, heapq, collections
sys.path.insert(0, '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009/candidate-floors-9/scripts')  # candidate-floors-9 copy (same method; + candidate-1 column from candidate-floors/fix-junctions/junctions-all.json)
from cfrender import *
from shapely.geometry import Point, LineString, box
from shapely.ops import nearest_points

FJ = RUN + '/candidate-floors-9/junctions'
os.makedirs(FJ, exist_ok=True)
C1J = json.load(open(RUN + '/candidate-floors/fix-junctions/junctions-all.json'))
X = RUN + '/shared-extracts'
BLD = ['03', '04', '05', '06', '07', '08', '09', '10']
GROUPS = {'Floor 0 (Basement)': [2295121], 'Floor 1 (0.5 + Main + 1.25 + 1.5)': [1450417, 311, 1487816, 1425915], 'Floor 2': [694],
          'Floor 3 (3 + 3.5)': [400176, 1487353], 'Floor 4': [402367]}
LEVEL_OF_GROUP = {l: g for g, ls in GROUPS.items() for l in ls}
ELEV = {}
for l in json.load(open(DATA + '/candidate/levels.json'))['nativeLevels']: ELEV[l['id']] = l['elevationFeet']
J = lambda p: json.load(open(p))

CX = J(X + '/compiled-2fad94-connectors.json')
TREADZ = {}  # flight id -> list of (ring, z)
for f in CX['sourceFlights']:
    TREADZ[f['stairElementId']] = [(t['ringFeet'], t['elevationFeet']) for t in f['treads'] if t.get('ringFeet') and len(t['ringFeet']) >= 3]
RAMP_ENABLED = {e.get('nativeElementId'): e.get('enabled') for e in CX['connectorEdges'] if e['kind'] == 'ramp'}
STAIR_EDGE = collections.defaultdict(list)
for e in CX['connectorEdges']:
    if e['kind'] == 'stairs': STAIR_EDGE[e.get('nativeElementId')].append(e.get('enabled'))


class World:
    def __init__(s, mode):
        s.M = Mode(mode); M = s.M
        s.rec = M.rec
        s.bld = lambda k: (s.rec.get(k) or {}).get('building') or ((s.rec.get(k) or {}).get('number') or '')[:2]
        s.nodes = []  # (lid, region)
        s.byLevel = {}
        for lid in ELEV:
            if not M.has(lid): continue
            L = M.level(lid)
            for g in L.regions:
                rooms = [s.rec[k] for k in g['roomKeys'] if k in s.rec]
                g['_b'] = {s.bld(k) for k in g['roomKeys'] if s.bld(k) in BLD}
                g['_nowalk'] = bool(rooms) and all(r.get('walkable') is False for r in rooms)
                g['_staff'] = bool([r for r in rooms if r.get('number')]) and all(r.get('access') == 'staff' for r in rooms if r.get('number'))
                g['_lid'] = lid; g['_i'] = len(s.nodes)
                s.nodes.append(g); s.byLevel.setdefault(lid, []).append(g)
        s.tree = {lid: STRtree([g['geom'] for g in gs]) for lid, gs in s.byLevel.items()}
        s.adj = collections.defaultdict(list)
        s.edges = []
        s._doors(); s._touch(); s._vertical()

    def near(s, lid, geom, d):
        if lid not in s.tree: return []
        gs = s.byLevel[lid]
        return [gs[int(i)] for i in s.tree[lid].query(geom.buffer(d)) if gs[int(i)]['geom'].distance(geom) <= d]

    def add(s, a, b, kind, ref):
        if a['_i'] == b['_i']: return
        e = (a['_i'], b['_i'], kind, ref)
        s.edges.append(e); s.adj[a['_i']].append((b['_i'], kind, ref)); s.adj[b['_i']].append((a['_i'], kind, ref))

    def _doors(s):
        # A door joins the walkable areas on its level within 0.75 ft of its measured footprint (the selection closes the
        # door opening across the jamb depth, so each side's area starts at the jamb face). The derivation's own
        # region.nativeDoorIds is a bounding-box overlap list (0.05 ft) and is kept only as evidence (see REPORT).
        s.doorsAt = {}
        for d in J(s.M.dir + '/doors.json'):
            lid = d['levelId']
            if lid not in s.byLevel or not d.get('footprint') or len(d['footprint']) < 3: continue
            fp = poly_of([d['footprint']])
            if fp is None: continue
            hit = [g for g in s.near(lid, fp, 0.75) if not g['_nowalk']]
            s.doorsAt[(lid, d['nativeElementId'])] = (d, [g['id'] for g in hit])
            for i in range(len(hit)):
                for j in range(i + 1, len(hit)): s.add(hit[i], hit[j], 'door', d['nativeElementId'])

    def _touch(s):
        for lid, gs in s.byLevel.items():
            T = s.tree[lid]
            for g in gs:
                for j in T.query(g['geom'].buffer(1e-4)):
                    h = gs[int(j)]
                    if h['_i'] <= g['_i']: continue
                    if g['geom'].distance(h['geom']) > 1e-4: continue
                    ln = g['geom'].buffer(1e-4).intersection(h['geom'].buffer(1e-4)).length / 2
                    if ln >= 0.5: s.add(g, h, 'touch', round(ln, 2))

    def _vertical(s):
        M = s.M
        v = J(M.dir + '/vertical.json')
        s.flights = v['flights']; s.ramps = v['ramps']; s.lifts = v['connectors']
        s.attach = {}
        for f in s.flights:
            tz = TREADZ.get(f['id'])
            att = {}
            for lid in f['levelIds']:
                if lid not in s.byLevel: continue
                e = ELEV[lid]
                if tz:
                    ts = [poly_of([r]) for r, z in tz if abs(z - e) <= 1.2]
                else:  # no elevations: all treads (plan only)
                    ts = [poly_of([t]) for t in f['treads'] if t and len(t) >= 3]
                ts = [t for t in ts if t is not None and t.is_valid]
                if not ts: continue
                U = unary_union(ts)
                hit = [g for g in s.near(lid, U, 1.0) if not g['_nowalk']]
                if hit: att[lid] = hit
            s.attach[('stair', f['id'])] = att
            lids = sorted(att)
            for i in range(len(lids)):
                for j in range(i + 1, len(lids)):
                    for a in att[lids[i]]:
                        for b in att[lids[j]]: s.add(a, b, 'stair', f['id'])
        for r in s.ramps:
            rid = r['nativeElementId']; att = {}
            pts = [q for t in r['triangles'] for q in t]
            zs = [q[2] for q in pts]
            lo, hi = min(zs), max(zs)
            lids = sorted(r['levelIds'], key=lambda l: ELEV[l])
            for lid, zz, end in ((lids[0], lo, 'lower'), (lids[-1], hi, 'upper')):
                key = f'landing:ramp:{rid}:{end}'
                hit = [g for g in s.byLevel.get(lid, []) if key in g['roomKeys']]
                if not hit:
                    edge = [Point(q[0], q[1]) for q in pts if abs(q[2] - zz) < 1e-3]
                    if edge:
                        U = unary_union([p.buffer(0.05) for p in edge])
                        hit = [g for g in s.near(lid, U, 1.0) if not g['_nowalk']]
                if hit: att[lid] = hit
            s.attach[('ramp', rid)] = att
            ls = sorted(att)
            if len(ls) == 2:
                for a in att[ls[0]]:
                    for b in att[ls[1]]: s.add(a, b, 'ramp', rid)
        for c in s.lifts:
            att = {}
            for en in c['entrances']:
                lid = en.get('levelId'); k = en.get('roomKey')
                hit = [g for g in s.byLevel.get(lid, []) if k in g['roomKeys']]
                if hit: att[lid] = hit
            s.attach[('lift', c['id'])] = att
            ls = sorted(att)
            for i in range(len(ls)):
                for j in range(i + 1, len(ls)):
                    for a in att[ls[i]]:
                        for b in att[ls[j]]: s.add(a, b, 'lift', c['id'])

    def path(s, src, dst, allowed_lids, allowed_nodes=None, kinds=None):
        """Dijkstra: hop cost 1, vertical +3; returns list of (node, kind, ref)."""
        dst = set(dst); dist = {}; prev = {}; pq = []
        for i in src: dist[i] = 0; heapq.heappush(pq, (0, i))
        while pq:
            d, i = heapq.heappop(pq)
            if d > dist[i]: continue
            if i in dst:
                out = [(i, None, None)]
                while i in prev:
                    j, k, ref = prev[i]; out.append((j, k, ref)); i = j
                out.reverse()
                # shift kinds so each step says how it was entered
                return [(out[n][0], out[n - 1][1] if n else None, out[n - 1][2] if n else None) for n in range(len(out))]
            for j, k, ref in s.adj[i]:
                n = s.nodes[j]
                if n['_lid'] not in allowed_lids or n['_nowalk']: continue
                if allowed_nodes is not None and j not in allowed_nodes: continue
                if kinds is not None and k not in kinds: continue
                nd = d + (1 if k in ('door', 'touch') else 3)
                if nd < dist.get(j, 1e18): dist[j] = nd; prev[j] = (i, k, ref); heapq.heappush(pq, (nd, j))
        return None


def footprints(W):
    foot = collections.defaultdict(list)
    for r in J(W.M.dir + '/record-outlines.json'):
        b = W.bld(r['key'])
        if b not in BLD: continue
        p = poly_of(r['outline'] or [])
        if p is not None: foot[(b, r.get('levelId'))].append(p)
    F = {k: unary_union(v) for k, v in foot.items()}
    Fall = {}
    for (b, l), g in F.items(): Fall.setdefault(b, []).append(g)
    return F, {b: unary_union(v) for b, v in Fall.items()}


def describe_path(W, p):
    out = []
    for i, k, ref in p:
        g = W.nodes[i]
        nums = sorted({(W.rec.get(x) or {}).get('number') for x in g['roomKeys'] if (W.rec.get(x) or {}).get('number')})
        other = [x for x in g['roomKeys'] if not (W.rec.get(x) or {}).get('number')]
        out.append({'via': (f'{k} {ref}' if k else 'start'), 'area': g['id'], 'level': NAME.get(g['_lid'], g['_lid']), 'buildings': sorted(g['_b']),
                    'rooms': nums[:8] + other[:3], 'staffOnly': g['_staff']})
    return out


def run(mode):
    W = World(mode)
    F, Fall = footprints(W)
    pairs = []
    for i, a in enumerate(BLD):
        for b in BLD[i + 1:]:
            if a not in Fall or b not in Fall: continue
            per = {}
            for (ba, la), ga in F.items():
                if ba != a: continue
                for (bb, lb), gb in F.items():
                    if bb != b: continue
                    if la == lb or (LEVEL_OF_GROUP.get(la) and LEVEL_OF_GROUP.get(la) == LEVEL_OF_GROUP.get(lb)):
                        dd = ga.distance(gb)
                        key = NAME.get(la, la) if la == lb else f'{NAME.get(la, la)} / {NAME.get(lb, lb)}'
                        per[key] = round(dd, 2)
            dmin = Fall[a].distance(Fall[b])
            if dmin < 20: pairs.append((a, b, round(dmin, 2), per))
    rows, roll = [], []
    for a, b, dmin, per in pairs:
        zone = Fall[a].buffer(20).intersection(Fall[b].buffer(20))
        if zone.is_empty:
            p1, p2 = nearest_points(Fall[a], Fall[b]); zone = LineString([p1, p2]).buffer(20)
        hood = {g['_i'] for g in W.nodes if g['geom'].distance(zone) <= 80}
        for gname, lids in GROUPS.items():
            lev_rows = []
            for lid in lids:
                gs = W.byLevel.get(lid, [])
                A = [g for g in gs if a in g['_b'] and not g['_nowalk']]; B = [g for g in gs if b in g['_b'] and not g['_nowalk']]
                row = {'junction': f'{a}-{b}', 'levelId': lid, 'level': NAME[lid], 'floor': gname}
                if not A or not B:
                    row.update(status='n/a', evidence=f'building {a if not A else b} has no selectable area on this native level')
                    lev_rows.append(row); continue
                UA = unary_union([g['geom'] for g in A]); UB = unary_union([g['geom'] for g in B])
                row['nearestAreasFeet'] = round(UA.distance(UB), 3)
                p1, p2 = nearest_points(UA, UB); row['nearestPointsFeet'] = [[round(p1.x, 3), round(p1.y, 3)], [round(p2.x, 3), round(p2.y, 3)]]
                shared = [g for g in A if b in g['_b']]
                if shared:
                    row.update(status='continuous', how='shared selectable area', areas=[g['id'] for g in shared][:4],
                               evidence='shared selectable area ' + ', '.join(g['id'] for g in shared[:3]))
                else:
                    p = W.path([g['_i'] for g in A], [g['_i'] for g in B], {lid}, hood, kinds={'door', 'touch'})
                    if p:
                        row.update(status='continuous', how='doors/selection lines on this level', path=describe_path(W, p),
                                   evidence='same-level walk: ' + ' -> '.join(f"{s['via']} {s['area']}" for s in describe_path(W, p)))
                    else:
                        row.update(status='disconnected-on-level', evidence=f'no same-level walk inside the junction neighbourhood; nearest areas {row["nearestAreasFeet"]:.2f} ft')
                lev_rows.append(row)
            rows += lev_rows
            # floor rollup
            A = [g['_i'] for lid in lids for g in W.byLevel.get(lid, []) if a in g['_b'] and not g['_nowalk']]
            B = [g['_i'] for lid in lids for g in W.byLevel.get(lid, []) if b in g['_b'] and not g['_nowalk']]
            r = {'junction': f'{a}-{b}', 'floor': gname, 'levels': {x['level']: x['status'] for x in lev_rows}}
            if not A or not B:
                r.update(status='n/a', evidence='building ' + (a if not A else b) + ' has no selectable area on this floor'); roll.append(r); continue
            if any(x['status'] == 'continuous' for x in lev_rows):
                best = next(x for x in lev_rows if x['status'] == 'continuous')
                r.update(status='continuous', evidence=f"{best['level']}: {best['evidence']}")
                if 'path' in best: r['path'] = best['path']
            else:
                p = W.path(A, B, set(lids), hood)
                if p:
                    kinds = [k for _, k, _ in p if k]
                    r.update(status='connector' if any(k in ('stair', 'ramp', 'lift') for k in kinds) else 'continuous',
                             path=describe_path(W, p), connectors=[f'{k} {ref}' for _, k, ref in p if k in ('stair', 'ramp', 'lift')],
                             evidence=' -> '.join(f"{s['via']} {s['area']}" for s in describe_path(W, p)))
                else:
                    r.update(status='disconnected', evidence='no walk inside the junction neighbourhood on this floor')
                # neighbours-only verdict vs unrestricted
                pu = W.path(A, B, set(lids), None)
                if pu:
                    dp = describe_path(W, pu); via = sorted({x for s in dp for x in s['buildings']} - {a, b})
                    r['unrestricted'] = {'hops': len(pu) - 1, 'viaBuildings': via, 'connectors': [f'{k} {ref}' for _, k, ref in pu if k in ('stair', 'ramp', 'lift')]}
                    if r['status'] == 'disconnected': r['unrestricted']['path'] = dp
            via = sorted({x for s in r.get('path', [])[1:-1] for x in s['buildings']} - {a, b})
            if via: r['viaBuildings'] = via
            r['staffOnlyOnPath'] = [s['area'] for s in r.get('path', []) if s['staffOnly']]
            roll.append(r)
    return W, pairs, rows, roll


if __name__ == '__main__':
    out = {'format': 'unbc-building-junctions-all', 'version': 2, 'method': __doc__}
    res = {}
    for mode in ('before', 'candidate'):
        W, pairs, rows, roll = run(mode)
        res[mode] = (W, pairs, rows, roll)
    W, pairs, rows, roll = res['candidate']
    bmap = {(r['junction'], r['floor']): r['status'] for r in res['before'][3]}
    blev = {(r['junction'], r['levelId']): r['status'] for r in res['before'][2]}
    c1map = {(r['junction'], r['floor']): r['status'] for r in C1J['byFloor']}
    c1lev = {(r['junction'], r['levelId']): r['status'] for r in C1J['byLevel']}
    for r in roll: r['before'] = bmap.get((r['junction'], r['floor'])); r['candidate1'] = c1map.get((r['junction'], r['floor']))
    for r in rows: r['candidate1'] = c1lev.get((r['junction'], r['levelId']))
    for r in rows: r['before'] = blev.get((r['junction'], r['levelId']))
    out['adjacentPairs'] = [{'pair': f'{a}-{b}', 'minFootprintGapFeet': d, 'footprintGapFeetByLevel': per} for a, b, d, per in pairs]
    out['byFloor'] = roll; out['byLevel'] = rows
    out['counts'] = dict(collections.Counter(r['status'] for r in roll))
    out['countsBefore'] = dict(collections.Counter(r['status'] for r in res['before'][3]))
    out['countsCandidate1'] = C1J['counts']
    json.dump(out, open(FJ + '/junctions-all.json.tmp', 'w'), indent=1)
    os.replace(FJ + '/junctions-all.json.tmp', FJ + '/junctions-all.json')
    for r in roll:
        print(r['junction'], '|', r['floor'], '|', r['status'], '| c1', r['candidate1'], '| before', r['before'], '|', r.get('viaBuildings', ''), '|', r['evidence'][:260])
    print(out['counts'], 'c1', out['countsCandidate1'], 'before', out['countsBefore'])
