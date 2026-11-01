import json,zipfile,collections,sys
z=zipfile.ZipFile('candidate.zip'); d=json.loads(z.read('viewer/indoor.json'))
rec={r['key']:r for r in d['records']}
OK={'walk','door','opening','ramp','elevator','escalator'}
def comps(pred):
    adj=collections.defaultdict(set)
    for e in d['edges']:
        if e['enabled'] and e['kind'] in OK and pred(e):
            adj[e['from']].add(e['to']); adj[e['to']].add(e['from'])
    comp={}; sizes=[]
    for n in list(adj):
        if n in comp: continue
        cid=len(sizes); st=[n]; comp[n]=cid; c=0
        while st:
            u=st.pop(); c+=1
            for v in adj[u]:
                if v not in comp: comp[v]=cid; st.append(v)
        sizes.append(c)
    return comp,sizes
circ=lambda e: all(rec.get(k,{}).get('circulation') or rec.get(k,{}).get('stair') for k in e['roomKeys'])
allc,alls=comps(lambda e: True)
hc,hs=comps(circ)
main=max(range(len(alls)),key=lambda i:alls[i]); hmain=max(range(len(hs)),key=lambda i:hs[i])
# arrivals per component, more meaningful than node counts
arr=collections.Counter(allc.get('arrival:'+k) for k in rec); harr=collections.Counter(hc.get('arrival:'+k) for k in rec)
print('main component arrivals',arr[main],'hallway-only main arrivals',harr[hmain])
rows=[]
for r in d['records']:
    if 'vestibule' not in (r.get('name') or '').lower(): continue
    n='arrival:'+r['key']
    doors=[e for e in d['edges'] if e['kind'] in('door','opening') and r['key'] in e['roomKeys']]
    walks=[e for e in d['edges'] if e['kind']=='walk' and e['enabled'] and r['key'] in e['roomKeys']]
    walknodes={e['from'] for e in walks}|{e['to'] for e in walks}
    deadsides=[]
    for e in doors:
        for side in (e['from'],e['to']):
            if side not in walknodes and not any(side in (w['from'],w['to']) for w in d['edges'] if w['kind']=='walk' and w['enabled'] and side.startswith('door:') and False):
                pass
    # door side is "walk-connected" if any enabled walk edge touches that side node
    walk_nodes_all=set()
    rows.append(dict(key=r['key'],num=r.get('number'),name=r.get('name'),level=r.get('levelId'),bldg=r.get('building'),
        inMain=allc.get(n)==main, compArrivals=arr.get(allc.get(n),0) if n in allc else 0,
        hallwayMain=hc.get(n)==hmain, hallwayCompArrivals=harr.get(hc.get(n),0) if n in hc else 0,
        hasArrivalNode=n in allc, doors=len(doors), enabledDoors=sum(1 for e in doors if e['enabled']), walks=len(walks)))
json.dump(rows,open('vestibules.json','w'),indent=1)
bad=[x for x in rows if not x['inMain'] or not x['hallwayMain']]
print('vestibules',len(rows),'not in main (any)',sum(not x['inMain'] for x in rows),'not in hallway-only main',sum(not x['hallwayMain'] for x in rows))
for x in sorted(bad,key=lambda x:(x['level'],x['num'] or '')):
    print(f"{x['num']:10} {x['name']:24} L{x['level']:<8} main={x['inMain']!s:5}({x['compArrivals']}) hall={x['hallwayMain']!s:5}({x['hallwayCompArrivals']}) arrivalNode={x['hasArrivalNode']} doors={x['enabledDoors']}/{x['doors']} walks={x['walks']}")
