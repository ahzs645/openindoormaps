"""Light. Route-graph measurement of a compiled routing dataset: connected components over enabled edges, arrival (room) nodes
reachable from the largest component, per level and building, and the unreachable named rooms.  usage: graph_check.py <dataset.json>"""
import json, sys, collections
D = json.load(open(sys.argv[1])); N = {n['id']: n for n in D['nodes']}
recs = {r['key']: r for r in D['records']}
adj = collections.defaultdict(set)
for e in D['edges']:
    if e.get('enabled', True) is False: continue
    adj[e['from']].add(e['to']); adj[e['to']].add(e['from'])
seen = {}; comps = []
for n in N:
    if n in seen: continue
    st = [n]; seen[n] = len(comps); size = 0
    while st:
        x = st.pop(); size += 1
        for y in adj[x]:
            if y not in seen: seen[y] = len(comps); st.append(y)
    comps.append(size)
big = max(range(len(comps)), key=lambda i: comps[i])
print('nodes', len(N), 'components', len(comps), 'largest', comps[big], 'next', sorted(comps, reverse=True)[1:6])
arr = [n for n in N.values() if n['kind'] == 'arrival']
named = [n for n in arr if n.get('roomKey') in recs and recs[n['roomKey']].get('number')]
inbig = [n for n in named if seen[n['id']] == big]
print('arrival nodes', len(arr), 'named-room arrivals', len(named), 'in largest component', len(inbig))
by = collections.defaultdict(lambda: [0, 0])
for n in named: by[(n['levelId'], n.get('building'))][0] += 1; by[(n['levelId'], n.get('building'))][1] += seen[n['id']] == big
bad = [(k, v) for k, v in sorted(by.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1]))) if v[1] < v[0]]
print('level/building groups with unreachable rooms:', len(bad))
for k, v in bad: print('  ', k, f'{v[1]}/{v[0]} reachable')
out = sorted({(recs[n['roomKey']]['number'], recs[n['roomKey']].get('name'), n['levelId'], comps[seen[n['id']]]) for n in named if seen[n['id']] != big})
print('unreachable named rooms', len(out))
for x in out[:80]: print('  ', x)
json.dump({'components': len(comps), 'largest': comps[big], 'named': len(named), 'reachable': len(inbig), 'unreachable': out}, open(sys.argv[1].replace('.json', '.graph-check.json'), 'w'), indent=1)
