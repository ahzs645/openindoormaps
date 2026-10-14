"""Light. Site plot: c14 derived regions, native walls (ids), doors, DWG wall/door lines.  site.py lid x0 y0 x1 y1 out.png [elev]"""
import json, sys
from shapely.geometry import Polygon, box, LineString
from shapely.ops import unary_union
from shapely import make_valid
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
lid=int(sys.argv[1]); x0,y0,x1,y1=map(float,sys.argv[2:6]); out=sys.argv[6]
C='candidate-floors-14/data/candidate/'; B=box(x0,y0,x1,y1)
recs={r['key']:r for r in json.load(open(C+'records.json'))}
V=json.load(open('candidate-floors-14/work/vin/db-validation-input.c14.json'))
def poly(rs):
    if isinstance(rs[0][0],(int,float)): return make_valid(Polygon(rs))
    if isinstance(rs[0][0][0],(int,float)): return make_valid(Polygon(rs[0],rs[1:]))
    return unary_union([make_valid(Polygon(r[0],r[1:])) for r in rs])
fig,ax=plt.subplots(figsize=(13,13))
L=json.load(open(C+f'level-{lid}.json'))
for r in L['regions']:
    g=poly(r['rings'])
    if not g.intersects(B): continue
    for gg in getattr(g,'geoms',[g]):
        if gg.geom_type=='Polygon': ax.fill(*gg.exterior.xy,alpha=.3)
    c=g.intersection(B).representative_point()
    ax.text(c.x,c.y,r['id'].split(':')[-1]+' '+','.join(str(recs.get(k,{}).get('number')) for k in r['roomKeys'][:3]),fontsize=7,color='b')
for w in json.load(open(C+f'walls-{lid}.json')):
    g=Polygon(w['rings'][0])
    if g.intersects(B): ax.fill(*g.exterior.xy,color='k',alpha=.8); c=g.intersection(B).representative_point(); ax.text(c.x,c.y,str(w['id']),color='r',fontsize=7)
D=json.load(open(C+'doors.json')); D=D if isinstance(D,list) else D.get('doors',[])
for d in D:
    if d.get('levelId')!=lid: continue
    g=Polygon(d['footprint'])
    if g.intersects(B): ax.fill(*g.exterior.xy,color='saddlebrown',alpha=.7); ax.text(d['point'][0],d['point'][1],str(d['nativeElementId']),color='saddlebrown',fontsize=8)
for s in V['boundaryReference']['sections']:
    for k,col in (('wallSegments','m'),('doorSegments','orange')):
        for seg in s.get(k,[]):
            l=LineString(seg)
            if l.intersects(B): ax.plot(*l.xy,color=col,lw=.8,ls='--')
for o in json.load(open(C+'record-outlines.json')):
    if o['levelId']!=lid: continue
    g=poly(o['outline'])
    if not g.intersects(B): continue
    for gg in getattr(g,'geoms',[g]):
        if gg.geom_type=='Polygon': ax.plot(*gg.exterior.xy,color='blue',lw=1.5,ls=':')
    c=g.representative_point(); ax.text(c.x,c.y,str(recs.get(o['key'],{}).get('number')),color='navy',fontsize=10,weight='bold')
ax.set_xlim(x0,x1); ax.set_ylim(y0,y1); ax.set_aspect('equal'); ax.grid(alpha=.3)
plt.savefig(out,dpi=70,bbox_inches='tight')
