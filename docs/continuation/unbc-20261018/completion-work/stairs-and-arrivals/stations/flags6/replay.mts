import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createOriginalNativeStairPhysicalContext,readOriginalNativeStairPhysicalSource,inspectOriginalNativeStairPhysicalInventory} from '/workspace/reviter/lib/reviter/native-source-stair-physical-inventory.ts';
import {revit2027OwnerMeshIndex,revit2027OwnerSurface} from '/workspace/reviter/lib/reviter/revit-2027-owner-mesh-index.ts';
import {walkRevit2027DirectedLoopEdges,revit2027DirectedEdgeUvs} from '/workspace/reviter/lib/reviter/revit-2027-owner-mesh-trim.ts';
import {inspectOriginalStairSourceTopology} from '/workspace/reviter/lib/reviter/native-source-stair-solid-proof.ts';
import {Rational,rational} from '/workspace/reviter/lib/reviter/native-rational-overlay.ts';
const folder='/workspace/openindoormaps/docs/continuation/unbc-20261018/completion-work/stairs-and-arrivals/stations/flags6';
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const request=JSON.parse(readFileSync(folder+'/requests.json','utf8'));
const bytes=readFileSync(process.env.UNBC_ORIGINAL_RVT??'/workspace/scratch/native-source-restored/derived/UNBC.original.rvt');
const started=Date.now(),context=createOriginalNativeStairPhysicalContext(bytes,request.sourceModelSha256,request.requests);
assert.equal(context.completeSourcePages,3666);assert.deepEqual(context.missingOriginalRecords,[]);
const add=(a:Rational,b:Rational)=>new Rational(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a:Rational,b:Rational)=>new Rational(a.n*b.d-b.n*a.d,a.d*b.d),mul=(a:Rational,b:Rational)=>new Rational(a.n*b.n,a.d*b.d);
const scalar=(q:Rational)=>`${q.n}/${q.d}`,sign=(q:Rational)=>q.n===0n?0:q.n>0n?1:-1;
const cross=(a:number[],b:number[])=>[sub(mul(rational(a[1]),rational(b[2])),mul(rational(a[2]),rational(b[1]))),sub(mul(rational(a[2]),rational(b[0])),mul(rational(a[0]),rational(b[2]))),sub(mul(rational(a[0]),rational(b[1])),mul(rational(a[1]),rational(b[0])))];
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n';
const rows=[];
for(const r of request.requests){
 const source=readOriginalNativeStairPhysicalSource(context,r.nativeRunId),roles=inspectOriginalNativeStairPhysicalInventory(context,r.nativeRunId),replay=source.physicalDefinition,index=revit2027OwnerMeshIndex(replay),topology=inspectOriginalStairSourceTopology(replay);
 const faces=[];
 for(const [token,face] of index.faces){
  const plane:any=revit2027OwnerSurface(index,634,token),normal=plane?cross(plane.xVector,plane.yVector):[],vertical=normal.length===3&&normal[2]!.n===0n&&(normal[0]!.n!==0n||normal[1]!.n!==0n),horizontal=normal.length===3&&normal[0]!.n===0n&&normal[1]!.n===0n&&normal[2]!.n!==0n;
  const loop=index.loops.get(face.firstLoop.token),walked=loop?walkRevit2027DirectedLoopEdges({faceToken:token,loop,edges:index.edges,loopArity:'open'}):undefined;
  const edges=walked?.ok?walked.edges.map(e=>({token:e.token,side:e.side,direction:e.direction,faceReferences:e.edge.faceReferences,nextReferences:e.edge.nextReferences,previousReferences:e.edge.previousReferences,sourceUvs:revit2027DirectedEdgeUvs(e)})):[];
  let uvCrossSum=new Rational(0n),exactEndpointMismatches=0;
  for(const [i,e] of edges.entries()){
   const uv=e.sourceUvs;
   for(let j=1;j<uv.length;j++)uvCrossSum=add(uvCrossSum,sub(mul(rational(uv[j-1]![0]),rational(uv[j]![1])),mul(rational(uv[j-1]![1]),rational(uv[j]![0]))));
   const end=uv.at(-1)!,next=edges[(i+1)%edges.length]!.sourceUvs[0]!;
   if(end.some((n,k)=>rational(n).n*rational(next[k]!).d!==rational(next[k]!).n*rational(n).d))exactEndpointMismatches++;
  }
  faces.push({token,tag:face.gInfo.tag,faceFlags:face.faceFlags,cutType:face.cutType,faceRegions:face.faceRegions.count,foregroundFilling:face.foregroundFilling,backgroundFilling:face.backgroundFilling,firstLoopToken:face.firstLoop.token,faceByteSpan:[face.byteOffset,face.endOffset],surfaceClassSlot:face.surface.sourceClassSlot,plane:plane?{origin:plane.origin,xVector:plane.xVector,yVector:plane.yVector,orientFlag:plane.surface.orientFlag,envelope:plane.surface.envelope}:null,rawPlaneNormalExact:normal.map(scalar),surfaceOrientedNormalExact:normal.map(q=>scalar(mul(q,rational(plane.surface.orientFlag?1:-1)))),candidateFaceBit2AdjustedNormalExact:normal.map(q=>scalar(mul(q,rational((plane.surface.orientFlag?1:-1)*((face.faceFlags&2)?-1:1))))),exactlyVerticalPlane:vertical,exactlyHorizontalPlane:horizontal,originalLoop:loop?.loop,loopWalked:walked?.ok??false,loopIssue:walked&&!walked.ok?walked.issue:null,directedEdgeCount:edges.length,sourceUvDirectedSegmentCrossSumExact:scalar(uvCrossSum),sourceUvDirectedSegmentCrossSumSign:sign(uvCrossSum),exactUvEndpointMismatchCount:exactEndpointMismatches,originalDirectedEdges:face.faceFlags===6?edges:undefined});
 }
 const counts=(values:(string|number)[])=>Object.fromEntries([...new Set(values)].map(v=>[v,values.filter(w=>w===v).length]));
 const unusual=faces.filter(f=>f.faceFlags!==4),caps=faces.filter(f=>f.exactlyHorizontalPlane),allowed=new Set(['Revit2027Geometry','Revit2027Face','Revit2027GEdge','Revit2027EdgeLoop','Revit2027AnalyticSurface:634']);
 const row={...r,sourceFrameSha256s:source.sourceFrameSha256s,completeOriginalSourceFaceCensus:roles.completeOriginalSourceFaceCensus,treadHistoryBindingComplete:roles.treadHistoryBindingComplete,sourceFaceCount:index.faces.size,sourceEdgeCount:index.edges.size,sourceLoopCount:index.loops.size,readerCounts:counts(replay.spans.map(s=>s.readerId)),unsupportedReaderIds:[...new Set(replay.spans.filter(s=>!allowed.has(s.readerId)).map(s=>s.readerId))],faceFlagCounts:counts(faces.map(f=>f.faceFlags)),surfaceSlotCounts:counts(faces.map(f=>f.surfaceClassSlot??'null')),fillingReplayCount:replay.spans.filter(s=>s.readerId==='Revit2027GFilling').length,allFillingDescriptorsNull:faces.every(f=>f.foregroundFilling.token===0&&f.backgroundFilling.token===0),unusualFaceTokens:unusual.map(f=>f.token),allUnusualFacesAreOnlyFlags6VerticalPlanes:unusual.length>0&&unusual.every(f=>f.faceFlags===6&&f.exactlyVerticalPlane),horizontalCapFaces:caps.length,allHorizontalCapsRetainFlags4:caps.every(f=>f.faceFlags===4),allHistoryBoundWalkingFacesRetainFlags4:roles.treads.every(t=>index.faces.get(t.physicalFaceToken)?.faceFlags===4),originalTopology:topology,faces,geometryChanged:false,exactSolidBodyApproved:false,routeApproved:false};
 rows.push(row);console.log(json({run:r.nativeRunId,faceFlags:row.faceFlagCounts,allUnusualFacesAreOnlyFlags6VerticalPlanes:row.allUnusualFacesAreOnlyFlags6VerticalPlanes,topology:topology.completeClosedSourceTopology,unusualFaces:unusual}));
}
const report={format:'original-flags6-plane-semantics-v1',sourceModelSha256:context.sourceModelSha256,sourceSchemaSha256:context.sourceSchemaSha256,completeSourcePages:context.completeSourcePages,missingOriginalRecords:context.missingOriginalRecords,elapsedMs:Date.now()-started,rows,physicalBodyApproved:false,routeApproved:false};
writeFileSync(folder+'/diagnosis.json',json(report));
