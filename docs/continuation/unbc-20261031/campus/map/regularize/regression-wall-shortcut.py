"""Regression check for review finding 1 (Nov 1, 2026): the regularizer must not
replace a line by a shortcut through a native wall footprint.

Fixture (decimetres, adapted from review-pkg repros/regularizer-wall-shortcut.py):
one synthetic native cell, one wall footprint x 40..60, y 0..99, and a walking line
that passes ABOVE the wall at y = 100.  The old proximity exception accepted the
straight replacement (10,98)-(90,98), which lies inside the wall for 2.0 m.
Required now: the original line is kept exactly.  A positive control (same line,
wall moved clear of it) checks that the regularizer still simplifies when nothing blocks it.

usage: python3 regression-wall-shortcut.py [--output RECEIPT.json]   (exit 0 = pass)
"""
import argparse, hashlib, importlib.util, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location('regularize', os.path.join(HERE, 'regularize.py'))
reg = importlib.util.module_from_spec(spec); spec.loader.exec_module(reg)
from hardgeom import HardConstraints  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument('--output'); args = ap.parse_args()
original = [(10, 98), (35, 100), (65, 100), (90, 98)]
wall = [40, 0, 60, 0, 60, 99, 40, 99]


def fixture(walls):
    return {'cells': [['synthetic-native-cell', [], [[0, 0, 100, 0, 100, 120, 0, 120]]]],
            'walls': walls, 'net': [[[v for p in original for v in p], 0, 0]],
            'netNodes': [['door:synthetic:left', 'door:synthetic:right']],
            'seams': [], 'approaches': [], 'links': [], 'vertical': [], 'held': []}


fx = fixture([wall])
result, *_ = reg.regularize(fx)
H = HardConstraints(fx)
contacts = H.line([(float(x), float(y)) for x, y in result[0]])
shortcut = H.line([(10.0, 98.0), (90.0, 98.0)])
# positive control: the same line with the wall moved clear of it (y 40..60)
ctrl, *_ = reg.regularize(fixture([[40, 40, 60, 40, 60, 60, 40, 60]]))
checks = {
    'originalLineKept': [tuple(p) for p in result[0]] == original,
    'outputWallOverlapDm': round(sum(c[-1] for c in contacts), 6),
    'oldShortcutWallOverlapDm': round(sum(c[-1] for c in shortcut), 6),
    'positiveControlSimplified': [tuple(p) for p in ctrl[0]] != original,
    'positiveControl': [list(p) for p in ctrl[0]],
}
ok = checks['originalLineKept'] and checks['outputWallOverlapDm'] == 0 and abs(checks['oldShortcutWallOverlapDm'] - 20.0) < 1e-6 and checks['positiveControlSimplified']
receipt = {'status': 'PASS' if ok else 'FAIL', 'fixtureIsSynthetic': True, 'units': 'decimetres',
           'regularizerSha256': hashlib.sha256(open(os.path.join(HERE, 'regularize.py'), 'rb').read()).hexdigest(),
           'hardgeomSha256': hashlib.sha256(open(os.path.join(HERE, 'hardgeom.py'), 'rb').read()).hexdigest(),
           'original': [list(p) for p in original], 'regularized': [list(p) for p in result[0]], **checks}
print(json.dumps(receipt, indent=1))
if args.output:
    open(args.output, 'w').write(json.dumps(receipt, indent=1) + '\n')
sys.exit(0 if ok else 1)
