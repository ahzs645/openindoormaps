"""Light. Closest node pairs between the largest route component and the next ones (same storey), with their cells/rooms."""
import json, sys, collections, math
D = json.load(open(sys.argv[1])); N = {n['id']: n for n in D['nodes']}
recs = {r['key']: r for r in D['records']}
adj = collections.defaultdict(set)
for e in D['edges']:
    if e.get('enabled', True) is False: continue
    adj[e['from']].add(e['to']); adj[e['to']].add(e['from'])
comp = {}; sizes = []
for n in N:
    if n in comp: continue
    st = [n]; comp[n] = len(sizes); k = 0
    while st:
        x = st.pop(); k += 1
        for y in adj[x]:
            if y not in comp: comp[y] = len(sizes); st.append(y)
    sizes.append(k)
order = sorted(range(len(sizes)), key=lambda i: -sizes[i])
main = order[0]
cellof = collections.defaultdict(set)
for e in D['edges']:
    if e.get('nativeCellId'): cellof[e['from']].add(e['nativeCellId']); cellof[e['to']].add(e['nativeCellId'])
for c in order[1:int(sys.argv[2]) if len(sys.argv) > 2 else 4]:
    A = [n for n in N.values() if comp[n['id']] == c]; B = [n for n in N.values() if comp[n['id']] == main]
    best = []
    for a in A:
        for b in B:
            if abs(a['pointFeet'][2] - b['pointFeet'][2]) > 0.5: continue
            d = math.hypot(a['pointFeet'][0] - b['pointFeet'][0], a['pointFeet'][1] - b['pointFeet'][1])
            if d < 25: best.append((d, a['id'], b['id']))
    best.sort()
    lv = collections.Counter((n['levelId']) for n in A)
    print(f'component size {sizes[c]} levels {dict(lv)}')
    seen = set()
    for d, a, b in best[:40]:
        if a in seen: continue
        seen.add(a)
        ra, rb = recs.get(N[a]['roomKey'], {}), recs.get(N[b]['roomKey'], {})
        print(f'  {d:6.2f}  {a} [{ra.get("number")}] cells {sorted(cellof[a])[:2]}  <->  {b} [{rb.get("number")}] cells {sorted(cellof[b])[:2]}')
        if len(seen) >= 8: break
