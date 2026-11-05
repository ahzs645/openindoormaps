import json, sys
from fractions import Fraction as F
from collections import Counter, defaultdict
wc=json.load(open('diag/wc-0388.json'))+json.load(open('diag/wc-residual.json'))
sec=json.load(open('ex0388/nativeMaterialSections.json'))
sup=json.load(open('ex0388/nativeMaterialSectionSupplement.json'))
rvt={r['elementId']:r for r in json.load(open('rvt/walls-rvt.json'))['records']}
rows={}
for L in sec['levels']: rows.setdefault(L['levelId'],[]).append(L)
suprows={}
for L in sup['levels']: suprows.setdefault(L['levelId'],[]).append(L)
def parts(level, cutoff):
    out=[]
    L=[r for r in rows[level] if abs(r['cutElevationFeet']-r['elevationFeet']-0.1)<1e-9][0]
    have=set()
    for s in L['sections']:
        have.add(s['nativeElementId'])
        for pi,p in enumerate(s['partsFeet']): out.append((s['nativeElementId'],s['kind'],'rvt-section',pi,p))
    for S in suprows.get(level,[]):
        if abs(S['cutElevationFeet']-L['cutElevationFeet'])>1e-9: continue
        for s in S['sections']:
            if s['nativeElementId'] in have: continue
            for pi,p in enumerate(s['partsFeet']): out.append((s['nativeElementId'],s['kind'],'mesh-supplement',pi,p))
    return out
def d2(p,a,b):
    p=[F(v) for v in p]; a=[F(v) for v in a]; b=[F(v) for v in b]
    dx,dy=b[0]-a[0],b[1]-a[1]; ll=dx*dx+dy*dy
    if ll==0: return (p[0]-a[0])**2+(p[1]-a[1])**2, None
    t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/ll; tc=min(1,max(0,t))
    ex,ey=p[0]-a[0]-tc*dx,p[1]-a[1]-tc*dy
    return ex*ex+ey*ey, t
cache={}
def best_tol(o):
    t=[w.get('closingToleranceFeet') for w in o['walksTested'] if w.get('reproduced') and w.get('closingToleranceFeet') is not None]
    return min(t) if t else None
res=[]
for o in wc:
    tol=best_tol(o)
    if tol is None or tol>1e-4: continue
    lv=o['levelId']
    if lv not in cache: cache[lv]=parts(lv,None)
    x,y=o['pointFeet']; H=3
    loc=[q for q in cache[lv] if any(abs(px-x)<H and abs(py-y)<H for r in q[4] for px,py in r) or (min(p[0] for p in q[4][0])-H<x<max(p[0] for p in q[4][0])+H and min(p[1] for p in q[4][0])-H<y<max(p[1] for p in q[4][0])+H)]
    found=[]
    for i,(ida,ka,pa,pia,A) in enumerate(loc):
        for j,(idb,kb,pb,pib,B) in enumerate(loc):
            if i==j: continue
            for ring in A:
                for p in ring:
                    if abs(p[0]-x)>H or abs(p[1]-y)>H: continue
                    for rb in B:
                        for k in range(len(rb)):
                            a,b=rb[k],rb[(k+1)%len(rb)]
                            if a==b or p==a or p==b: continue
                            if not (min(a[0],b[0])-1e-4<=p[0]<=max(a[0],b[0])+1e-4 and min(a[1],b[1])-1e-4<=p[1]<=max(a[1],b[1])+1e-4): continue
                            dd,t=d2(p,a,b)
                            if 0<dd<=F(tol)**2*F(1.0000001):
                                found.append(dict(vertexOwner=ida,vertexSource=pa,edgeOwner=idb,edgeSource=pb,distance=float(dd)**.5,point=p,t=float(t)))
    # dedupe by owners
    seen={}
    for f in found:
        k=(f['vertexOwner'],f['edgeOwner'])
        if k not in seen or f['distance']<seen[k]['distance']: seen[k]=f
    res.append(dict(id=o['id'],levelId=lv,cls=o.get('class'),tol=tol,contacts=list(seen.values())))
json.dump(res,open('diag/contacts.json','w'),indent=1)
print(len(res), Counter(r['tol'] for r in res))
print(Counter(len(r['contacts'])>0 for r in res))
srcs=Counter()
for r in res:
    s=set((c['vertexSource'],c['edgeSource']) for c in r['contacts'])
    srcs[(r['tol']<=1e-7, tuple(sorted(s)))]+=1
for k,v in srcs.most_common(): print(v,k)
