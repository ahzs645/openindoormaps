import json, sys
from collections import defaultdict
for tag in sys.argv[1:]:
    d = json.load(open(f'ex/{tag}/viewer/indoor.json'))
    nodes = {n['id']: n for n in d['nodes']}
    adj = defaultdict(list)
    for e in d['edges']:
        if e.get('enabled'):
            adj[e['from']].append(e); adj[e['to']].append(e)
    print('==', tag)
    for nid in ['door:1487353:1780077:0', 'door:1487353:1780077:1', 'door:1487353:1779222:0']:
        print(nid, nid in nodes, [(e['kind'], e['id'][:110]) for e in adj[nid]])
    # component of arrival of 06-388
    recs = {r['key']: r for r in d['records']}
    key388 = [k for k, r in recs.items() if (r.get('number') or '') == '06-388']
    key364 = [k for k, r in recs.items() if (r.get('number') or '') in ('06-364', '06-366')]
    # BFS
    comp = {}
    cid = 0
    for n in nodes:
        if n in comp: continue
        stack = [n]; comp[n] = cid
        while stack:
            x = stack.pop()
            for e in adj[x]:
                y = e['to'] if e['from'] == x else e['from']
                if y not in comp: comp[y] = cid; stack.append(y)
        cid += 1
    size = defaultdict(int)
    for n, c in comp.items():
        if nodes[n]['kind'] == 'arrival': size[c] += 1
    big = max(size, key=size.get)
    for k in key388 + key364:
        a = 'arrival:' + k
        print(recs[k].get('number'), k, a in nodes, comp.get(a) == big, size.get(comp.get(a)))
