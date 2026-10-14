"""Light. Lists native circulation cells whose own walk edges fall into more than one piece (route dataset)."""
import json, sys, collections
D = json.load(open(sys.argv[1]))
cells = {c['id']: c for c in D['circulationGeometry']['cells']}
by = collections.defaultdict(list)
for e in D['edges']:
    if e.get('nativeCellId') and e.get('enabled', True): by[e['nativeCellId']].append(e)
frag = []
for cid, es in by.items():
    p = {}
    def r(x):
        while p.setdefault(x, x) != x: x = p[x]
        return x
    for e in es: p[r(e['from'])] = r(e['to'])
    sizes = collections.Counter(r(x) for x in list(p))
    if len(sizes) > 1: frag.append((cid, sorted(sizes.values(), reverse=True), cells[cid]['roomKeys'][:3] if cid in cells else None))
print('cells', len(cells), 'cells with edges', len(by), 'fragmented', len(frag))
for f in sorted(frag, key=lambda f: -sum(f[1]))[:40]: print(f)
json.dump([f[0] for f in frag], open('fragmented.json', 'w'))
