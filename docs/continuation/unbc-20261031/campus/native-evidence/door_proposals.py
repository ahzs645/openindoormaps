import json,zipfile,collections,math,sys
d=json.loads(zipfile.ZipFile('candidate.zip').read('viewer/indoor.json'))
rep=json.load(open('native-door-sides.json'))
rec={r['key']:r for r in d['records']}
bynum={}
for r in d['records']: bynum[(r['levelId'],f"{r.get('number') or ''} {r.get('name') or ''}".strip())]=r
doors={x['nativeElementId']:x for x in d['doors']}
def segdist(px,py,ring):
    best=1e9
    for i in range(len(ring)):
        x1,y1=ring[i][0],ring[i][1]; x2,y2=ring[(i+1)%len(ring)][0],ring[(i+1)%len(ring)][1]
        dx,dy=x2-x1,y2-y1; L=dx*dx+dy*dy or 1e-12
        t=max(0,min(1,((px-x1)*dx+(py-y1)*dy)/L)); best=min(best,math.hypot(x1+t*dx-px,y1+t*dy-py))
    return best
def inside(x,y,ring):
    h=False
    for i in range(len(ring)):
        x1,y1=ring[i][0],ring[i][1]; x2,y2=ring[(i+1)%len(ring)][0],ring[(i+1)%len(ring)][1]
        if (y1>y)!=(y2>y) and x<(x2-x1)*(y-y1)/(y2-y1)+x1: h=not h
    return h
def nearest_owner(level,labels,px,py):
    best=None
    for lab in labels:
        r=bynum.get((level,lab)) or next((x for (lv,l),x in bynum.items() if l==lab),None)
        if not r: continue
        dist=0.0 if any(inside(px,py,ring) for ring in r['ringsFeet'][:1]) else min(segdist(px,py,ring) for ring in r['ringsFeet'])
        if best is None or dist<best[1]: best=(r,dist)
    return best
props=[]
for row in rep['rows']:
    if row['state']!='unmatched' or row['kind']!='native-pair': continue
    door=doors[row['door']]; pt=door['pointFeet']; nx,ny=door['normalFeet']; ln=math.hypot(nx,ny); nx,ny=nx/ln,ny/ln
    depth=max(abs((p[0]-pt[0])*nx+(p[1]-pt[1])*ny) for p in door['footprintFeet'])
    out=[]
    for sign,side in ((1,row['sideA']),(-1,row['sideB'])):
        off=depth+side['stepFeet']; px,py=pt[0]+sign*nx*off,pt[1]+sign*ny*off
        nb=nearest_owner(door['levelId'],side['owners'],px,py)
        out.append({'cell':side['cell'],'cellOwners':len(side['owners']),'nearestOwner':f"{nb[0].get('number')} {nb[0].get('name')}" if nb else None,'nearestOwnerKey':nb[0]['key'] if nb else None,'gapFeet':round(nb[1],3) if nb else None})
    props.append({'door':row['door'],'levelId':door['levelId'],'existing':row['existingOwners'],'sideA':out[0],'sideB':out[1]})
# Projected connectivity: union arrival components across proposed pairs.
OK={'walk','door','opening','ramp','elevator','escalator'}
par={}
def find(a):
    par.setdefault(a,a)
    while par[a]!=a: par[a]=par[par[a]]; a=par[a]
    return a
def union(a,b): par[find(a)]=find(b)
for e in d['edges']:
    if e['enabled'] and e['kind'] in OK: union(e['from'],e['to'])
def main_count():
    c=collections.Counter(find('arrival:'+k) for k in rec if ('arrival:'+k) in par)
    root,n=c.most_common(1)[0]; return root,n
root0,n0=main_count()
before={k for k in rec if ('arrival:'+k) in par and find('arrival:'+k)==root0}
for p in props:
    a,b=p['sideA']['nearestOwnerKey'],p['sideB']['nearestOwnerKey']
    if a and b and ('arrival:'+a) in par and ('arrival:'+b) in par: union('arrival:'+a,'arrival:'+b)
root1,n1=main_count()
after={k for k in rec if ('arrival:'+k) in par and find('arrival:'+k)==root1}
gained=sorted(after-before, key=lambda k:(rec[k]['levelId'],rec[k].get('number') or ''))
res={'format':'native-door-owner-proposals-v1','diagnosticOnly':True,'proposals':props,'projectedMainComponentArrivals':{'before':n0,'after':n1},
     'projectedGainedRooms':[f"{rec[k].get('number')} {rec[k].get('name')} (level {rec[k]['levelId']})" for k in gained],
     'caveat':'Projection unions arrival components only; a real door edge also needs walking approaches on both sides, physical/threshold checks and a regenerated native build.'}
json.dump(res,open('native-door-proposals.json','w'),indent=1)
print('proposals',len(props),'main arrivals before',n0,'after (projected)',n1,'gained',len(gained))
for g in res['projectedGainedRooms'][:40]: print('  +',g)
for p in props:
    if p['door'] in (2315416,1779388,2471813,621887):
        print(p['door'],p['sideA']['nearestOwner'],p['sideA']['gapFeet'],'<->',p['sideB']['nearestOwner'],p['sideB']['gapFeet'])
