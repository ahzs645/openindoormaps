"""Exact post-check for the display regularizer (hard wall/hole rule).

For every floor in DIR/floors, every `schematic` line that differs from its `net`
(original) line is tested with hardgeom.HardConstraints: any positive-length
overlap with a native wall footprint (away from that wall's own doors, 0.8 m) or
with a cell hole restores the original line (schematic entry set to 0).  There is
no allowance for "the original crossed something nearby".  A line whose ORIGINAL
overlaps a wall/hole (source defect) must be unchanged; if it is not, it is
restored as well.  Restoring a whole line never changes which nodes connect.

usage: no-new-wall-crossings.py DIR      (rewrites DIR/floors/*.json in place,
                                          writes DIR/no-new-wall-crossings.json)
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hardgeom import HardConstraints, pts  # noqa: E402

root = sys.argv[1]
report = {}
for name in sorted(os.listdir(os.path.join(root, 'floors'))):
    if name == 'index.json' or not name.endswith('.json'):
        continue
    path = os.path.join(root, 'floors', name)
    fl = json.load(open(path))
    if 'schematic' not in fl:
        continue
    H = HardConstraints(fl)
    restored, defects_changed, checked = [], [], 0
    for i, ((l, _, _), s) in enumerate(zip(fl['net'], fl['schematic'])):
        if not s:
            continue
        checked += 1
        P = [(float(x), float(y)) for x, y in pts(l)]
        if H.line(P):
            fl['schematic'][i] = 0; defects_changed.append(i); continue
        if H.line([(float(x), float(y)) for x, y in pts(s)]):
            fl['schematic'][i] = 0; restored.append(i)
    json.dump(fl, open(path, 'w'), separators=(',', ':'))
    report[name] = {'changedLinesChecked': checked, 'linesRestored': len(restored), 'restored': restored,
                    'sourceDefectLinesThatHadBeenChanged': defects_changed}
    print(name, {k: v for k, v in report[name].items() if not isinstance(v, list)}, flush=True)
json.dump(report, open(os.path.join(root, 'no-new-wall-crossings.json'), 'w'), indent=1)
