"""Light. Owner-authorized seal specs (round 10: q10.19 hairline rule, q10.4) at located cracks: the native plan-cut pieces
(candidate-9 probe dumps, ids > 0) within 0.6 ft of the crack point; the distinct pair with the smallest gap whose nearest-point
midpoint lies within 0.35 ft of the point; a bridge from one face to the other (half-width 0.02, overlap 0.02). A zero float gap
(exact contact) gets a 0.1 ft bridge through the contact point along the line between the pieces' local centroids.
Floats only locate; db-generate validates each row exactly.  usage: python3 -I build_seals.py <sites.json> <out-specs.json>"""
import json, sys, math
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union, nearest_points
from shapely import make_valid
RUN = '/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009'
DD = __import__('os').environ.get('SEAL_DUMPS', RUN + '/candidate-floors-9/review/work')
CB = json.load(open(RUN + '/candidate-floors-3/regress/work/census-bounds.json'))['bounds']
DEC = RUN + '/user-decisions/2026-10-13-round10.json'
import hashlib; DSHA = hashlib.sha256(open(DEC, 'rb').read()).hexdigest()
sites, OUT = json.load(open(sys.argv[1])), sys.argv[2]
def geo(rs):
    if isinstance(rs[0][0][0], (int, float)): return make_valid(Polygon(rs[0], rs[1:]))
    return unary_union([make_valid(Polygon(r[0], r[1:])) for r in rs])
dumps = {}; specs = []
for s in sites:
    lid = s['levelId']
    if lid not in dumps: dumps[lid] = json.load(open(f'{DD}/dump-{lid}.json'))
    D = dumps[lid]; E = D['elevationFeet']; P = Point(s['pointFeet'])
    pieces = {}
    for x in D['precise']:
        if not isinstance(x['id'], int) or x['id'] <= 0: continue
        g = geo(x['ringsFeet'])
        if g.is_empty or g.distance(P) > 0.6: continue
        pieces[x['id']] = unary_union([pieces[x['id']], g]) if x['id'] in pieces else g
    best = None; ids = list(pieces)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            A, B = pieces[ids[i]], pieces[ids[j]]; d = A.distance(B)
            if d > float(__import__('os').environ.get('SEAL_MAX', '0.4')): continue
            a, b = nearest_points(A, B); mid = Point((a.x + b.x) / 2, (a.y + b.y) / 2)
            if mid.distance(P) > 0.35: continue
            sc = d + mid.distance(P)
            if not best or sc < best[0]: best = (sc, ids[i], ids[j], a, b, d)
    if not best: print(s['site'], 'NO PAIR', sorted(pieces)); continue
    _, ia, ib, a, b, d = best
    if d < 1e-4:
        disk = P.buffer(0.3); ca, cb = pieces[ia].intersection(disk).centroid, pieces[ib].intersection(disk).centroid
        ux, uy = cb.x - ca.x, cb.y - ca.y; L = math.hypot(ux, uy); ux, uy = ux / L, uy / L
        A2 = [a.x - 0.05 * ux, a.y - 0.05 * uy]; B2 = [a.x + 0.05 * ux, a.y + 0.05 * uy]
    else:
        ux, uy = (b.x - a.x) / d, (b.y - a.y) / d; A2 = [a.x, a.y]; B2 = [b.x, b.y]
    if str(ia) not in CB or str(ib) not in CB: print(s['site'], 'owner without census', ia, ib); continue
    top = min(CB[str(ia)]['max'][2], CB[str(ib)]['max'][2])
    q = s['decision']
    specs.append({'id': f"db:{lid}:r10-{q}:{min(ia, ib)}-{max(ia, ib)}@{A2[0]:.4f},{A2[1]:.4f}", 'decisionId': f'2026-10-13-round10#{q}', 'kind': 'owner-authorized-seal',
                  'levelId': lid, 'elevationFeet': E, 'baseElevationFeet': E, 'topElevationFeet': top, 'owners': sorted([ia, ib]),
                  'construction': {'kind': 'bridge', 'pointAFeet': A2, 'pointBFeet': B2, 'directionFeet': [ux, uy], 'halfWidthFeet': 0.02, 'overlapFeet': 0.02},
                  'measuredGapFeet': d, 'materialRole': None, 'sourceJointCutElevationFeet': 4.0,
                  'candidate3': {'room': s['room'], 'note': f"owner round 10 {q}: close the {d:.5f} ft crack between native #{ia} and #{ib} for selection"}})
    print(s['site'], s['room'], 'owners', ia, ib, 'gap', round(d, 6), 'top', round(top, 2))
json.dump({'decisionsFile': DEC, 'decisionsSha256': DSHA, 'specs': specs}, open(OUT, 'w'), indent=1)
print(len(specs), 'specs')
