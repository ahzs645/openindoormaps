"""Read-only exact binary-rational cap feasibility; never edits source recipes."""
import hashlib, json, math
from fractions import Fraction as F
from pathlib import Path

D = Path(__file__).parent
inp = D / '10-1003-native-section-and-threshold-inventory.json'
x = json.loads(inp.read_text())
parts = x['parts']
point = lambda p: tuple(map(F, p))
sub = lambda a,b: tuple(x-y for x,y in zip(a,b))
cross = lambda a,b: a[0]*b[1]-a[1]*b[0]
dot = lambda a,b: sum(x*y for x,y in zip(a,b))
wire = lambda n: [str(n.numerator),str(n.denominator)]
def polygon_area(ring):
    return abs(sum(cross(p,ring[(i+1)%len(ring)]) for i,p in enumerate(ring)))/2
def distance(p,a,b):
    v=sub(b,a); t=max(F(0),min(F(1),dot(sub(p,a),v)/dot(v,v)))
    return math.hypot(*(float(q-vv*t) for q,vv in zip(sub(p,a),v)))
def cap(s,i,target_id):
    ring=list(map(point,s['ringsFeet'][0])); a,b=ring[i],ring[(i+1)%len(ring)]
    v=sub(b,a); u=(-v[1],v[0]); o=tuple((x+y)/2 for x,y in zip(a,b))
    if max(dot(sub(q,o),u) for q in ring)>0: u=tuple(-q for q in u)
    rows=[]
    for q in[a,b]:
        hits=[]
        for target in[p for p in parts if p['nativeElementId']==target_id]:
            rr=list(map(point,target['ringsFeet'][0]))
            for j,c in enumerate(rr):
                d=rr[(j+1)%len(rr)]; w=sub(d,c); den=cross(u,w)
                if not den: continue
                t=cross(sub(c,q),w)/den; k=cross(sub(c,q),u)/den
                if t>=0 and 0<=k<=1:
                    hit=tuple(qq+t*uu for qq,uu in zip(q,u))
                    hits.append({'tQ':wire(t),'depthFeet':float(t)*math.hypot(*map(float,u)),
                        'pointQ':list(map(wire,hit)),'pointFeet':list(map(float,hit)),
                        'targetPartSha256':target['sourcePartSha256'],'targetEdgeIndex':j})
        hits.sort(key=lambda h:F(*map(int,h['tQ'])))
        rows.append({'sourcePointFeet':list(map(float,q)),'firstHit':hits[0] if hits else None})
    lengths=[math.dist(a,ring[(j+1)%len(ring)]) for j,a in enumerate(ring)]
    return {'sourceNativeElementId':s['nativeElementId'],'sourcePartSha256':s['sourcePartSha256'],
        'sourceEdgeIndex':i,'sourceCapFeet':list(map(lambda p:list(map(float,p)),[a,b])),
        'sourceWidthFeet':lengths[i],'minimumOriginalEdgeWidthFeet':min(lengths),
        'existingShortCapGuard':abs(lengths[i]-min(lengths))<=1e-6,
        'allSameOwnerOriginalVerticesInInwardHalfPlane':all(dot(sub(point(q),o),u)<=0 for p in parts if p['nativeElementId']==s['nativeElementId'] for r in p['ringsFeet'] for q in r),
        'endpointFirstHits':rows}, (a,b,u)

source=next(p for p in parts if p['nativeElementId']==1501345)
first,(a,b,u)=cap(source,3,1501344)
hits=[r['firstHit'] for r in first['endpointFirstHits']]
assert all(hits) and len({(h['targetPartSha256'],h['targetEdgeIndex']) for h in hits})==1
ends=[tuple(F(*map(int,q)) for q in h['pointQ']) for h in hits]
area=polygon_area([a,b,ends[1],ends[0]])
assert area>0
gap=max(h['depthFeet'] for h in hits)
first.update({'exactPositiveNewGapAreaSquareFeetQ':wire(area),'exactPositiveNewGapAreaSquareFeet':float(area),
    'maximumFirstContactDepthFeet':gap,'existingMinimumPositiveGapFeet':1e-7,
    'passesExistingMinimumPositiveGap':gap>1e-7,
    'refusal':'Existing native continuation requires gap > 1e-7 ft; both exact first-contact depths are smaller. No far-face substitution or artificial extra gap is permitted.'})
# A concrete shape exercises the existing production guard. The 0.0002ft end
# overlap is disclosed existing-material overlap; it does not enlarge the true gap.
unit=tuple(float(t)/math.hypot(*map(float,u)) for t in u); overlap=.0002
strip=[[float(q)-overlap*uu for q,uu in zip(p,unit)] for p in[a,b]]
strip += [[float(q)+overlap*uu for q,uu in zip(p,unit)] for p in[ends[1],ends[0]]]
target=next(p for p in parts if p['sourcePartSha256']==hits[0]['targetPartSha256'])
patch={'id':'diagnostic-new-native-cap:1501345-to-1501344:10-1003','levelId':1487816,
    'sourceModelSha256':x['sourceModelSha256'],'status':'proposed','widthFeet':gap,'ringsFeet':[strip],
    'wallEvidence':[{k:p[k] for k in['nativeElementId','kind','ringsFeet']} for p in[source,target]],
    'nativeDoorIds':[],'notes':'Scratch-only refused proposal. Original four provisional seals and all source geometry remain unchanged. No authoring admission or physical clearance is claimed.',
    'continuationProof':{'sourceWallId':1501345,'sourceCapFeet':first['sourceCapFeet'],
        'targetContactFeet':[h['pointFeet'] for h in hits],
        'evidenceSha256':hashlib.sha256(json.dumps(first,sort_keys=True).encode()).hexdigest()}}

column_source=[p for p in parts if p['nativeElementId']==1501344][1]
second,_=cap(column_source,0,2235615)
assert not second['existingShortCapGuard']
assert not all(r['firstHit'] for r in second['endpointFirstHits'])
anchor=[131.4964675450325,812.8716059063944]
true_caps=[]
for p in[p for p in parts if p['nativeElementId']==1501344]:
    ring=p['ringsFeet'][0]; lengths=[math.dist(q,ring[(i+1)%len(ring)]) for i,q in enumerate(ring)]
    for i,q in enumerate(ring):
        if abs(lengths[i]-min(lengths))<=1e-6:
            c,_=cap(p,i,2235615)
            c['distanceFromOriginalSeamCarrierPointFeet']=distance(point(anchor),point(q),point(ring[(i+1)%len(ring)]))
            true_caps.append(c)
second.update({'originalSeamCarrierPointFeet':anchor,
    'nearestActualShortCapDistanceFeet':min(c['distanceFromOriginalSeamCarrierPointFeet'] for c in true_caps),
    'refusal':'Original seam lies on a long side, not an exposed full short cap. Its entire long edge also has no first column contact on one endpoint ray. A different cap elsewhere is not a repair of this local seam.',
    'completeExactColumnProfileAuthorityAvailable':False,
    'columnSourceLimit':'Complete original column mesh recovered (26 faces/94 triangles), with notches retained; existing Float32/1e-4 mesh cuts cannot certify the exact 1ULP seam. No new source profile authority is inferred from that diagnostic.',
    'actualShortCaps':true_caps})
report={'authority':'Read-only exact binary-rational line intersections on retained complete source-section operands. New recipe feasibility only: no source/application/physical/access authority. Original native cuts, rooms, four thresholds and four provisional seals are immutable.',
    'sourceModelSha256':x['sourceModelSha256'],'freshCacheSha256':x['freshCacheSha256'],
    'inputSha256':hashlib.sha256(inp.read_bytes()).hexdigest(),
    'firstSeam':first,'firstSeamProposedPatchForExistingGuard':patch,'secondSeam':second,
    'newRecipesApplied':0,'oldProvisionalSealsPreserved':4,'sourceOrRuntimeMutation':False}
(D/'10-1003-new-native-cap-feasibility.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'wallGapFeet':gap,'exactPositiveNewAreaSquareFeet':float(area),'existingMinimumGapPass':False,
    'columnSeamOnShortCap':False,'nearestShortCapDistanceFeet':second['nearestActualShortCapDistanceFeet'],
    'columnFullWidthEndpointContacts':[bool(r['firstHit']) for r in second['endpointFirstHits']],
    'newRecipesApplied':0,'oldProvisionalSealsPreserved':4}))
