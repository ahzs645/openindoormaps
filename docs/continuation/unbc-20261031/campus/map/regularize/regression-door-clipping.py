"""Regression for the zero-margin door rule (review of November 2, 2026, finding 2).

verify.py used to find the part of a segment inside a door footprint with a
golden-section/bisection search on the distance to the footprint.  At zero
margin that distance is zero on a short flat interval, which the search could
miss; the verifier then reported wall and hole contact where the segment's own
host-wall door permits the crossing.  Both implementations now clip the segment
against the CLOSED door footprint directly, in exact rational arithmetic, and
independently of each other (verify.py: convex half-plane clipping;
hardgeom.py: boundary cuts plus exact midpoint classification).

Checks (decimetres; every case runs through BOTH verify.Floor.contacts and
hardgeom.HardConstraints.line, and both must give the expected answer):
  * synthetic fixtures: own-host door crossings (axis-aligned, rotated, entering
    through a door vertex, along a door jamb) pass; a wrong-host door, an
    unknown-host door, a near miss beside the door and an uncovered cell hole are
    refused; a hole covered by another cell passes;
  * the actual Campus Floor 3 line (edge
    native-cell:24.278215:826:walk:door:400176:2043306:1|door:400176:2043358:0),
    from the committed floor file and from an embedded copy of its wall, door
    and hole rings: no contact; door 2043358 covers t = [4/5, 54/65] of the
    segment (-278,336)->(-273,318); with a foreign host the same line is refused
    (wall), and without the door it is refused (wall and hole);
  * a seeded randomized comparison with an exact rational reference (open wall
    minus closed door) on integer coordinates, including segments through door
    vertices and along door edges.

Needs Python 3 and NumPy (hardgeom.py).  Runs from a fresh checkout:
  python3 regularize/regression-door-clipping.py [--output RECEIPT.json]   (exit 0 = pass)
"""
import argparse, copy, hashlib, importlib.util, json, math, os, random, sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hardgeom  # noqa: E402

_spec = importlib.util.spec_from_file_location('verify', os.path.join(HERE, 'verify.py'))
verify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verify)

EDGE_ID = 'native-cell:24.278215:826:walk:door:400176:2043306:1|door:400176:2043358:0'
FLOOR3 = os.path.join(HERE, '..', 'floors', 'campus-floor-3.json')


def rect(x0, y0, x1, y1):
    return [x0, y0, x1, y0, x1, y1, x0, y1]


def flat(P):
    return [c for x in P for c in x]


def both(fl, path):
    """(verify contacts, hardgeom contacts) of polyline `path` on floor `fl`."""
    path = [(float(x), float(y)) for x, y in path]
    return verify.Floor(fl).contacts(path), hardgeom.HardConstraints(fl).line(path)


def overlap(contacts_v, contacts_h):
    return round(sum(c[2] for c in contacts_v), 6), round(sum(c[-1] for c in contacts_h), 6)


# ---------------------------------------------------------------- fixtures
AXIS = {'cells': [['cell-a', [], [rect(0, 0, 100, 100)]]], 'walls': [rect(40, 0, 60, 100)], 'wallIds': ['wall-a'],
        'doors': [[rect(39, 45, 61, 55), 'door-a', 0]], 'doorHosts': ['wall-a']}
# rotated wall along u = (3, 1), thickness w = (-1, 3) * 2; door spans the wall at u-steps 4..6
_u, _w, _o = (3, 1), (-1, 3), (0, 0)
_at = lambda i, j: (_o[0] + i * _u[0] + j * _w[0], _o[1] + i * _u[1] + j * _w[1])
ROT_WALL = [_at(0, 0), _at(10, 0), _at(10, 2), _at(0, 2)]
ROT_DOOR = [_at(4, 0), _at(6, 0), _at(6, 2), _at(4, 2)]
ROT = {'cells': [['cell-r', [], [rect(-200, -200, 200, 200)]]], 'walls': [flat(ROT_WALL)], 'wallIds': ['wall-r'],
       'doors': [[flat(ROT_DOOR), 'door-r', 0]], 'doorHosts': ['wall-r']}
HOLE = {'cells': [['cell-a', [], [rect(0, 0, 100, 100), rect(40, 40, 60, 60)]]], 'walls': [], 'doors': []}


def with_hosts(fl, hosts):
    f = copy.deepcopy(fl); f['doorHosts'] = hosts; return f


def line_through(a, b, before, after):
    """Integer line through a and b, extended `before`/`after` times (b - a) beyond them."""
    d = (b[0] - a[0], b[1] - a[1])
    return [(a[0] - before * d[0], a[1] - before * d[1]), (b[0] + after * d[0], b[1] + after * d[1])]


CASES = [
    ('own-host door, axis-aligned crossing', AXIS, [(10, 50), (90, 50)], True),
    ('own-host door, rotated crossing through the door middle', ROT, line_through(_at(5, -3), _at(5, 5), 0, 0), True),
    ('own-host door, rotated crossing entering through a door vertex', ROT, line_through(_at(4, 0), _at(6, 2), 1, 1), True),
    ('own-host door, segment along a door jamb (closed footprint)', ROT, line_through(_at(4, 0), _at(4, 2), 2, 2), True),
    ('own-host door, axis segment along the door edge y = 55', AXIS, [(10, 55), (90, 55)], True),
    ('wrong-host door does not cut the wall', with_hosts(AXIS, ['wall-b']), [(10, 50), (90, 50)], False),
    ('unknown-host door does not cut the wall', with_hosts(AXIS, [None]), [(10, 50), (90, 50)], False),
    ('wrong-host rotated door does not cut the wall', with_hosts(ROT, ['wall-x']), line_through(_at(5, -3), _at(5, 5), 0, 0), False),
    ('near miss beside the door by 0.001 dm', AXIS, [(10, 55.001), (90, 55.001)], False),
    ('near miss beside the rotated door (one step outside the jamb)', ROT, line_through(_at(3, 0), _at(3, 2), 2, 2), False),
    ('uncovered cell hole', HOLE, [(10, 50), (90, 50)], False),
    ('cell hole covered by another cell', {**HOLE, 'cells': HOLE['cells'] + [['cell-b', [], [rect(39, 39, 61, 61)]]]},
     [(10, 50), (90, 50)], True),
]


# ---------------------------------------------------------------- exact reference
def _cross(a, b, x):
    return (b[0] - a[0]) * (x[1] - a[1]) - (b[1] - a[1]) * (x[0] - a[0])


def _orient(P):
    n = len(P)
    return 1 if sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n)) > 0 else -1


def reference_overlap(p, q, W, D):
    """Exact length of p->q inside the OPEN convex wall W minus the CLOSED convex door D."""
    p = (Fraction(p[0]), Fraction(p[1])); q = (Fraction(q[0]), Fraction(q[1])); d = (q[0] - p[0], q[1] - p[1])
    ts = {Fraction(0), Fraction(1)}
    for P in (W, D):
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            g1 = (b[0] - a[0]) * d[1] - (b[1] - a[1]) * d[0]
            if g1:
                t = -Fraction(_cross(a, b, p)) / g1
                if 0 < t < 1:
                    ts.add(t)
    ts = sorted(ts); sw, sd = _orient(W), _orient(D); tot = Fraction(0)
    for a, b in zip(ts, ts[1:]):
        m = (a + b) / 2; x = (p[0] + d[0] * m, p[1] + d[1] * m)
        in_w = all(sw * _cross(W[i], W[(i + 1) % len(W)], x) > 0 for i in range(len(W)))
        in_d = all(sd * _cross(D[i], D[(i + 1) % len(D)], x) >= 0 for i in range(len(D)))
        if in_w and not in_d:
            tot += b - a
    return float(tot) * math.hypot(float(d[0]), float(d[1]))


def randomized(n, seed=20261102):
    rnd = random.Random(seed)
    stats = {'cases': 0, 'expectedRefused': 0, 'verifyMismatches': 0, 'hardgeomMismatches': 0, 'examples': []}
    while stats['cases'] < n:
        a, b = rnd.randint(-6, 6), rnd.randint(-6, 6)
        if (a, b) == (0, 0):
            continue
        u, w = (a, b), (-b, a); o = (rnd.randint(-20, 20), rnd.randint(-20, 20))
        L, T = rnd.randint(4, 12), rnd.randint(1, 2)
        at = lambda i, j: (o[0] + i * u[0] + j * w[0], o[1] + i * u[1] + j * w[1])
        W = [at(0, 0), at(L, 0), at(L, T), at(0, T)]
        s0 = rnd.randint(1, L - 3); s1 = s0 + rnd.randint(1, 2); e = rnd.randint(0, 1)
        D = [at(s0, -e), at(s1, -e), at(s1, T + e), at(s0, T + e)]
        if rnd.random() < 0.3:                      # skewed (still convex) door
            D[2] = (D[2][0] + u[0], D[2][1] + u[1])

        def pick():
            r = rnd.random()
            if r < 0.3:
                return rnd.choice(D + W)
            if r < 0.6:
                i = rnd.randrange(4); A, B = D[i], D[(i + 1) % 4]; k = rnd.randint(-3, 6)
                return (A[0] + k * (B[0] - A[0]), A[1] + k * (B[1] - A[1]))
            return (rnd.randint(-100, 100), rnd.randint(-100, 100))
        p, q = pick(), pick()
        if rnd.random() < 0.4:                      # along a door edge line
            i = rnd.randrange(4); p, q = line_through(D[i], D[(i + 1) % 4], 3, 3)
        if p == q:
            continue
        fl = {'cells': [], 'walls': [flat(W)], 'wallIds': ['w'], 'doors': [[flat(D), 'd', 0]], 'doorHosts': ['w']}
        expect = reference_overlap(p, q, W, D) <= verify.EPS
        cv, ch = both(fl, [p, q])
        stats['cases'] += 1; stats['expectedRefused'] += not expect
        for key, got in (('verifyMismatches', not cv), ('hardgeomMismatches', not ch)):
            if got != expect:
                stats[key] += 1
                if len(stats['examples']) < 5:
                    stats['examples'].append({'impl': key, 'wall': W, 'door': D, 'segment': [p, q], 'expectedAllowed': expect})
    return stats


# ---------------------------------------------------------------- actual Campus Floor 3 line
EMBEDDED_F3 = {   # rings copied from campus-floor-3.json (wall 1505948, door 2043358, hole of native cell 826)
    'wall': [-255, 327, -274, 321, -274, 322, -255, 328],
    'door': [-274, 321, -264, 324, -265, 326, -274, 323],
    'hole': [-255, 328, -255, 327, -259, 326, -257, 316, -257, 316, -255, 312, -257, 311, -258, 316, -258, 316, -261, 325,
             -264, 324, -264, 324, -274, 321, -274, 321, -274, 321, -274, 322, -274, 322, -274, 323, -265, 326, -264, 325, -255, 328],
    'line': [-265, 327, -278, 336, -273, 318, -273, 318, -262, 321],
}


def embedded_floor(host=1505948):
    e = EMBEDDED_F3
    return {'cells': [['native-cell:24.278215:826', [], [rect(-400, 200, -100, 450), e['hole']]]],
            'walls': [e['wall']], 'wallIds': [1505948], 'doors': [[e['door'], 2043358, 0]], 'doorHosts': [host]}


def actual_line():
    out = {}
    fl = json.load(open(FLOOR3))
    idx = fl['netEdgeIds'].index(EDGE_ID)
    line = fl['net'][idx][0]
    P = verify.pts(line)
    k = [d[1] for d in fl['doors']].index(2043358)
    D = verify.pts(fl['doors'][k][0])
    out['committed'] = {'netIndex': idx, 'line': line, 'doorHost': fl['doorHosts'][k],
                        'matchesEmbeddedCopy': line == EMBEDDED_F3['line'] and fl['doors'][k][0] == EMBEDDED_F3['door']
                        and fl['walls'][fl['wallIds'].index(1505948)] == EMBEDDED_F3['wall']}
    cv, ch = both(fl, P)
    out['committed'].update(verifyContacts=cv, hardgeomContacts=[list(c) for c in ch])
    seg = (P[1], P[2])
    iv_v = verify.door_intervals(seg[0], seg[1], D)
    iv_h = hardgeom.closed_footprint_intervals(seg[0], seg[1], hardgeom.np.array(D))
    out['doorInterval'] = {'segment': [list(seg[0]), list(seg[1])], 'verify': iv_v, 'hardgeom': iv_h,
                           'expected': [0.8, 54 / 65]}
    # counterfactuals: a foreign host leaves the wall uncut (the hole stays exempt
    # inside any door); without the door both the wall and the hole are hit
    foreign = copy.deepcopy(fl); foreign['doorHosts'][k] = -1
    nodoor = copy.deepcopy(fl); del nodoor['doors'][k]; del nodoor['doorHosts'][k]
    out['counterfactuals'] = {}
    for name, f in (('committedForeignHost', foreign), ('committedNoDoor', nodoor),
                    ('embeddedForeignHost', embedded_floor(host=-1)), ('embeddedNoDoor', {**embedded_floor(), 'doors': [], 'doorHosts': []})):
        xv, xh = both(f, P)
        out['counterfactuals'][name] = {'overlapDm': overlap(xv, xh), 'kindsVerify': sorted({c[0] for c in xv}),
                                        'kindsHardgeom': sorted({c[1] for c in xh})}
    ev, eh = both(embedded_floor(), P)
    out['embedded'] = {'verifyContacts': ev, 'hardgeomContacts': [list(c) for c in eh]}
    close = lambda a, b: len(a) == 1 and abs(a[0][0] - b[0]) < 1e-15 and abs(a[0][1] - b[1]) < 1e-15
    out['PASS'] = (out['committed']['matchesEmbeddedCopy'] and out['committed']['doorHost'] == 1505948
                   and not cv and not ch and not ev and not eh
                   and close(iv_v, out['doorInterval']['expected']) and close(iv_h, out['doorInterval']['expected'])
                   and all(0.57 < x < 0.58 and c['kindsVerify'] == c['kindsHardgeom'] == ['wall']
                           for c in (out['counterfactuals']['committedForeignHost'], out['counterfactuals']['embeddedForeignHost'])
                           for x in c['overlapDm'])
                   and all(1.14 < x < 1.15 and c['kindsVerify'] == c['kindsHardgeom'] == ['hole', 'wall']
                           for c in (out['counterfactuals']['committedNoDoor'], out['counterfactuals']['embeddedNoDoor'])
                           for x in c['overlapDm']))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--output'); ap.add_argument('--random', type=int, default=2000)
    args = ap.parse_args()
    rows = []
    for name, fl, path, expect in CASES:
        cv, ch = both(fl, path)
        rows.append({'case': name, 'expectedAllowed': expect, 'verifyAllowed': not cv, 'hardgeomAllowed': not ch,
                     'overlapDm': {'verify': overlap(cv, ch)[0], 'hardgeom': overlap(cv, ch)[1]},
                     'PASS': (not cv) == expect and (not ch) == expect})
        print(('PASS ' if rows[-1]['PASS'] else 'FAIL ') + name, flush=True)
    real = actual_line()
    print(('PASS ' if real['PASS'] else 'FAIL ') + 'actual Campus Floor 3 line ' + EDGE_ID, flush=True)
    rnd = randomized(args.random)
    rnd['PASS'] = rnd['verifyMismatches'] == 0 and rnd['hardgeomMismatches'] == 0
    print(('PASS ' if rnd['PASS'] else 'FAIL ') + 'randomized vs exact reference: %(cases)d cases, %(expectedRefused)d refused, '
          'mismatches verify %(verifyMismatches)d, hardgeom %(hardgeomMismatches)d' % rnd, flush=True)
    sha = lambda n: hashlib.sha256(open(os.path.join(HERE, n), 'rb').read()).hexdigest()
    ok = all(r['PASS'] for r in rows) and real['PASS'] and rnd['PASS']
    receipt = {'status': 'PASS' if ok else 'FAIL', 'units': 'decimetres', 'doorMargin': {'verify': verify.MARGIN, 'hardgeom': hardgeom.DOOR_MARGIN},
               'sources': {n: sha(n) for n in ('verify.py', 'hardgeom.py')},
               'floorFile': {'campus-floor-3.json': hashlib.sha256(open(FLOOR3, 'rb').read()).hexdigest()},
               'fixtures': rows, 'actualCampusFloor3Line': real, 'randomized': rnd}
    if args.output:
        with open(args.output, 'w') as f:
            f.write(json.dumps(receipt, indent=1) + '\n')
    print('ALL_PASS', ok)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
