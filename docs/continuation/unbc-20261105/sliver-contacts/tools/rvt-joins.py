import json, math
from collections import Counter
res=json.load(open('diag/contacts.json'))
rvt={r['elementId']:r for r in json.load(open('rvt/walls-rvt.json'))['records']}
def solids(r): return r.get('solids') or ([r['solid']] if r.get('solid') else [])
def classify(c):
    V=rvt.get(c['vertexOwner']); E=rvt.get(c['edgeOwner'])
    if not V or not E: return 'no rvt record', {}
    p=c['point']; out={'Vtype':V.get('typeName'),'Etype':E.get('typeName'),'Vcat':V['categoryId'],'Ecat':E['categoryId']}
    sv=solids(V); se=solids(E)
    if not sv or not se: return 'no solid (non-wall body: column/curtain)', out
    # nearest V location end to contact point
    best=None
    for s in sv:
        for end in ('start','end'):
            q=s[end]; d=math.hypot(q['x']-p[0],q['y']-p[1])
            if best is None or d<best[0]: best=(d,s,end)
    d,s,end=best; q=s[end]
    # E centreline nearest
    bestE=None
    for t in se:
        ax,ay,bx,by=t['start']['x'],t['start']['y'],t['end']['x'],t['end']['y']
        L=math.hypot(bx-ax,by-ay)
        if L<1e-9: continue
        nx,ny=-(by-ay)/L,(bx-ax)/L
        sd=(q['x']-ax)*nx+(q['y']-ay)*ny
        tt=((q['x']-ax)*(bx-ax)+(q['y']-ay)*(by-ay))/L/L
        if bestE is None or abs(sd)<abs(bestE[0]): bestE=(sd,t['thickness'],tt)
    if bestE is None: return 'no host axis', out
    sd,th,tt=bestE; half=th/2
    out.update(locEndToContact=d, locEndFromHostAxis=abs(sd), hostHalfThickness=half, alongHost=tt, partitionThickness=s['thickness'])
    a=abs(sd)
    if a < half - 1e-6: k='location line ends inside the host wall (body trimmed to the face: Revit wall join)'
    elif abs(a-half)<=1e-6: k='location line ends on the host face'
    elif a-half < 0.02: k='location line ends short of the host face by <0.02 ft'
    else: k='location line ends >=0.02 ft from the host face'
    return k, out
summ=Counter(); rows=[]
for r in res:
    if r['tol']>1e-7: continue
    ks=[]
    for c in r['contacts']:
        if c['vertexSource']!='rvt-section' or c['edgeSource']!='rvt-section': continue
        k,o=classify(c); ks.append(k); rows.append(dict(id=r['id'],kind=k,distance=c['distance'],vertexOwner=c['vertexOwner'],edgeOwner=c['edgeOwner'],**o))
    summ[tuple(sorted(set(ks)))]+=1
for k,v in summ.most_common(): print(v,k)
print(Counter(x['kind'] for x in rows))
ds=sorted(x['distance'] for x in rows); print(len(ds), ds[0], ds[len(ds)//2], ds[-1])
json.dump(rows,open('diag/rvt-joins.json','w'),indent=1)
for x in rows[:6]: print(x)
