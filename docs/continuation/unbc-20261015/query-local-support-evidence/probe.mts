import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{deserialize}from'node:v8';
import{nativeRationalOverlay,Rational}from'/workspace/reviter/lib/reviter/native-rational-overlay.ts';
import{nativeRationalIntersectionOperand}from'/workspace/reviter/lib/reviter/native-rational-intersection-broadphase.ts';
import{freezeNativeRationalParts,nativeRationalFootprintSupported}from'/workspace/reviter/lib/reviter/native-exact-planar-topology.ts';
import{walkingStrip}from'/workspace/reviter/lib/reviter/native-circulation-links.ts';
const dir='/workspace/scratch/unbc-pathway-repair-20261015/query-local-support-qa/',sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const rectangle=(x:number,y:number,w:number,h:number)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]] as [number,number][];
const encode=(v:any):any=>v instanceof Rational?[String(v.n),String(v.d)]:Array.isArray(v)?v.map(encode):v;
const bytes=(v:any)=>JSON.stringify(encode(v));
function selected(a:any,b:any){return freezeNativeRationalParts(nativeRationalIntersectionOperand(a,b) as any);}
function shape(a:any,b:any){return{components:b.length,rings:b.reduce((n:number,p:any)=>n+p.length,0),vertices:b.reduce((n:number,p:any)=>n+p.reduce((s:number,r:any)=>s+r.length,0),0)};}
const controls:any[]=[];
for(const specimen of[
 {name:'distant-component-and-hole',a:[[rectangle(1,1,1,1)]],b:[[rectangle(0,0,10,10),rectangle(7,7,1,1)],[rectangle(30,30,2,2)]],expected:true,kept:[1,1]},
 {name:'enclosing-hole-must-remain',a:[[rectangle(2,2,1,1)]],b:[[rectangle(0,0,10,10),rectangle(1,1,4,4)]],expected:false,kept:[1,2]},
 {name:'crossing-hole-must-remain',a:[[rectangle(1,1,3,3)]],b:[[rectangle(0,0,10,10),rectangle(3,3,2,2)]],expected:false,kept:[1,2]},
 {name:'touching-hole-bounds-must-remain',a:[[rectangle(1,1,1,1)]],b:[[rectangle(0,0,10,10),rectangle(2,1,1,1)]],expected:true,kept:[1,2]},
 {name:'touching-outer-component-must-remain',a:[[rectangle(1,1,1,1)]],b:[[rectangle(0,0,2,2)],[rectangle(2,1,1,1)]],expected:true,kept:[2,2]},
 {name:'multipart-query-keeps-second-relevant-shell',a:[[rectangle(1,1,1,1)],[rectangle(31,31,1,1)]],b:[[rectangle(0,0,10,10),rectangle(7,7,1,1)],[rectangle(30,30,5,5)]],expected:true,kept:[2,2]},
 {name:'unsupported-positive-sliver-remains',a:[[rectangle(9.5,1,1,1)]],b:[[rectangle(0,0,10,10),rectangle(7,7,1,1)]],expected:false,kept:[1,1]},
]){
 for(const reverse of[false,true]){
  const rawA=specimen.a.map(p=>p.map(r=>reverse?[...r].reverse():r)),rawB=specimen.b.map(p=>p.map(r=>reverse?[...r].reverse():r));
  const a=freezeNativeRationalParts(nativeRationalOverlay('union',rawA)),b=freezeNativeRationalParts(nativeRationalOverlay('union',rawB));
  const before=bytes(b),s=selected(a,b),old=nativeRationalFootprintSupported(a,b),next=nativeRationalFootprintSupported(a,s);
  assert.equal(old,specimen.expected);assert.equal(next,old);
  assert.equal(bytes(nativeRationalOverlay('difference',a,b)),bytes(nativeRationalOverlay('difference',a,s)));
  assert.equal(bytes(b),before);
  // Overlay normalization can merge touching outer components; inspect raw
  // operands separately to ensure strictly touching bounds are never pruned.
  const rawSelected=nativeRationalIntersectionOperand(rawA,rawB);const st=shape(rawA,rawSelected);
  assert.equal(st.components,specimen.kept[0]);assert.equal(st.rings,specimen.kept[1]);
  controls.push({name:specimen.name,reverse,boolean:old,exactDifferenceBytesEqual:true,sourceBytesUnchanged:true,rawSelectedComponents:st.components,rawSelectedRings:st.rings});
 }
}
const unknown:any=[[],[[[new Rational(0n),new Rational(0n)]]]];assert.equal(nativeRationalIntersectionOperand([],unknown),unknown);
console.log(JSON.stringify({syntheticControls:controls.length,unknownSubjectRetained:true}));
const input='/workspace/scratch/unbc-pathway-repair-20261015/checkpoints/inputs/landing-dataset-a2c81e7c1b01e5d9f3c529c943326132123c709571588f1af3e33d15fa3c68cf.bin',raw=fs.readFileSync(input),inputSha=sha(raw),data=deserialize(raw);
const ledger='/workspace/scratch/unbc-pathway-repair-20261015/checkpoints/landing-approaches/a04393b680a280a45af4872d2cc94d14e21c555c13fafbfd33d14e645fc4625d.jsonl';
const rows=fs.readFileSync(ledger,'utf8').split('\n').flatMap(l=>{try{return[JSON.parse(l)]}catch{return[]}}),saved=rows.find(r=>r.candidate?.path?.length>=2);assert(saved);
assert.equal(sha(JSON.stringify(saved.candidate)),saved.candidateSha256);
fs.writeFileSync(dir+'selected-original-candidate.json',JSON.stringify(saved,null,2));
const [a,b]=saved.candidate.path,plane=a[2],floors=data.walkingSupport.floors.filter((f:any)=>f.elevationFeet===plane);assert(floors.length);
const support=freezeNativeRationalParts(nativeRationalOverlay('union',floors.map((f:any)=>f.ringsFeet))),footprint=freezeNativeRationalParts(nativeRationalOverlay('union',[walkingStrip(a,b)]));
const supportBefore=bytes(support),short=selected(footprint,support),stats={original:shape(footprint,support),selected:shape(footprint,short)};
console.log(JSON.stringify({actualCandidatePairKey:saved.pairKey,plane,floors:floors.map((f:any)=>f.nativeElementId),stats}));
const measure=(label:string,run:()=>any)=>{const start=performance.now(),cpu=process.cpuUsage(),rssBefore=process.memoryUsage().rss,result=run(),elapsedMs=performance.now()-start,used=process.cpuUsage(cpu);return{label,result,elapsedMs,userCpuMs:used.user/1000,systemCpuMs:used.system/1000,rssBefore,rssAfter:process.memoryUsage().rss}};
const timings=[];
timings.push(measure('baseline-existing-support-cold',()=>nativeRationalFootprintSupported(footprint,support)));
timings.push(measure('query-local-filter-plus-existing-support-cold',()=>nativeRationalFootprintSupported(footprint,selected(footprint,support))));
for(let i=0;i<2;i++){
 timings.push(measure('baseline-existing-support-warm-'+i,()=>nativeRationalFootprintSupported(footprint,support)));
 timings.push(measure('query-local-filter-plus-existing-support-repeat-'+i,()=>nativeRationalFootprintSupported(footprint,selected(footprint,support))));
}
assert(timings.every(t=>t.result===timings[0].result));
const baselineDifference=nativeRationalOverlay('difference',footprint,support),selectedDifference=nativeRationalOverlay('difference',footprint,short);assert.equal(bytes(baselineDifference),bytes(selectedDifference));assert.equal(bytes(support),supportBefore);assert.equal(sha(fs.readFileSync(input)),inputSha);
const report={authority:'Scratch-only query-local support operand filtering using the existing exact rational nativeRationalIntersectionOperand followed by unchanged nativeRationalFootprintSupported/tile clipping. This is a floor-only check for one saved landing-candidate segment, not the full source walking region, ownership, wall/mask/headroom qualification, route calculation or end-to-end performance. No source/canonical/runtime mutation.',
  currentImplementation:'Footprint support already exact-clips frozen large operands to cached16ft tiles, retaining all holes of retained components. Strict disjoint hole pruning exists in intersection broadphase but is not currently used by footprint support.',
  mathematicalScope:'For valid polygon operands, B and filteredB agree inside every subject-shell bound; therefore A\\B=A\\filteredB. Whole outer components and hole rings are omitted only on strict exact rational bounds disjointness from EVERY actual A shell. Touching/unknown bounds retain original rings; all coordinates and source material stay unchanged.',
  controls,unknownSubjectRetained:true,input:{path:input,sha256:inputSha,bytes:raw.length},savedCandidate:{bindingSha256:saved.bindingSha256,pairKey:saved.pairKey,candidateSha256:saved.candidateSha256,selectedCandidateSha256:sha(fs.readFileSync(dir+'selected-original-candidate.json')),firstSegment:[a,b],planeFeet:plane},
  floorNativeIds:floors.map((f:any)=>f.nativeElementId),stats,timings,actualDifferenceBytesEqual:true,actualDifferenceParts:baselineDifference.length,supportBytesUnchanged:true,sourceInputUnchanged:true,productionChanged:false,visitorLatencyClaim:false};
fs.writeFileSync(dir+'query-local-support-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stats,timings,actualDifferenceParts:baselineDifference.length,actualDifferenceBytesEqual:true}));
