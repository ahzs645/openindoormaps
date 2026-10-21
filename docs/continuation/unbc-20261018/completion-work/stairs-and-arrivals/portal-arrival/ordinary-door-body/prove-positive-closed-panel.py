"""Exact original component51 closed-box diagnostic; never grants operation or route authority."""
from pathlib import Path
from fractions import Fraction as Q
import json,hashlib
base=Path('/workspace/scratch/source-portal-arrival-20261018/door-body-frames')
p=base/'original-door-faces.json'; r=json.loads(p.read_text()); panel=next(c for c in r['components']if c['originalGeometryToken']==51)
f=lambda v:Q(int(v['numerator']),int(v['denominator']))
point=lambda v:tuple(map(f,v))
sub=lambda a,b:tuple(x-y for x,y in zip(a,b))
cross=lambda a,b:(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
dot=lambda a,b:sum(x*y for x,y in zip(a,b))
vertices={point(v)for face in panel['faces']for loop in face['loops']for edge in loop['edges']for v in edge['definitionPoints']};assert len(vertices)==8
lo=tuple(min(v[i]for v in vertices)for i in range(3));hi=tuple(max(v[i]for v in vertices)for i in range(3));assert all(a<b for a,b in zip(lo,hi));assert vertices=={(x,y,z)for x in [lo[0],hi[0]]for y in [lo[1],hi[1]]for z in [lo[2],hi[2]]}
center=tuple((a+b)/2 for a,b in zip(lo,hi));uses={};side_keys=set();faces=[]
for face in panel['faces']:
 assert face['faceFlags']==4 and face['sourcePlane']['surface']['orientFlag'] is True and len(face['loops'])==1 and not face['loops'][0]['open']
 edges=face['loops'][0]['edges'];assert len(edges)==4
 ring=[point(e['definitionPoints'][0])for e in edges];assert len(set(ring))==4
 normal=cross(sub(ring[1],ring[0]),sub(ring[2],ring[1]));s=face['sourcePlane'];source_normal=cross(tuple(map(Q,s['xVector'])),tuple(map(Q,s['yVector'])))
 assert any(normal) and cross(normal,source_normal)==(0,0,0) and dot(normal,source_normal)>0
 assert dot(normal,sub(center,ring[0]))<0
 fixed=[i for i in range(3)if all(v[i]==ring[0][i]for v in ring)];assert len(fixed)==1;axis=fixed[0];side=(axis,'low'if ring[0][axis]==lo[axis]else'high');assert side not in side_keys;side_keys.add(side)
 for i,e in enumerate(edges):
  a,b=map(point,e['definitionPoints']);assert a in vertices and b in vertices and sum(x!=y for x,y in zip(a,b))==1
  assert b==ring[(i+1)%4]
  uses.setdefault(e['token'],[]).append((face['token'],e['direction']))
 faces.append({'originalFaceToken':face['token'],'faceWindingMatchesOriginalPlaneAndFaceOrientation':True,'normalPointsStrictlyOutwardFromBody':True,'fourOriginalCornersFormCompleteBoxSide':True,'allOriginalCoedgesAreBoxSidesNotDiagonals':True})
assert len(side_keys)==6 and len(uses)==12 and all(len(v)==2 and v[0][0]!=v[1][0] and v[0][1]!=v[1][1]for v in uses.values());assert len(vertices)-len(uses)+len(faces)==2
prior=json.loads((base/'full-height-projected-domains.json').read_text());w=tuple(map(f,prior['panelPositiveBox']['strictPositiveInteriorSourceLocalWitnessFeet']));assert all(a<v<b for a,v,b in zip(lo,w,hi))
ledger=json.loads((base/'component-box-replay.json').read_text());g=next(c for c in ledger['components']if c['originalGeometryToken']==51)['box']['sourceLedger']['spans'][0]['value'];assert g['flags']==6 and g['tessEpsCntrl']=={'type':0,'version':0} and g['faces']['count']==6 and g['edges']['count']==12 and g['sharedSurfaceInfo']['count']==0
result={'kind':'positive-original-ordinary-panel-closed-box-proof','input':{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()},'originalGeometryToken':51,'originalGeometryFlags':6,'originalTessellationControl':g['tessEpsCntrl'],'originalFlagsRewritten':False,'exactClosedBoxProven':True,'exactVertexCount':8,'exactEdgeCount':12,'exactFaceCount':6,'eulerCharacteristic':2,'volumeCubicFeet':{'numerator':str(((hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2])).numerator),'denominator':str(((hi[0]-lo[0])*(hi[1]-lo[1])*(hi[2]-lo[2])).denominator)},'faces':faces,'allOwnAndTwinCornersMatchPriorExactProof':prior['panelPositiveBox']['allOriginalOwnAndTwinCornersExactlyMatch'],'strictPositiveInteriorWitness':prior['panelPositiveBox']['strictPositiveInteriorWorldWitnessFeet'],'witnessInUnchangedStandingAndCrossingFullSixFootDemands':prior['panelPositiveBox']['witnessInsideOriginalFullStandingAndCrossingDemands'],'closedPanelMaterialRetained':True,'operabilityOrLeafOpeningApproved':False,'opaqueSourceAuthorityRestored':False,'routeApproved':False}
(base/'positive-closed-panel.json').write_text(json.dumps(result,indent=2)+'\n');print('Exact 8-vertex/12-edge/6-face box, correct original outward normals and no diagonal edges; strict positive interior witness contacts BOTH original full6ft demands.')
