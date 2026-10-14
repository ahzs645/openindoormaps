// COPY of routing-followup/scripts/db-generate.ts (fix-seams): DB_INPUT selects the validation input; DB_ALONE=1 + DB_BOUND (ids the envelope levels bind) validates each new row alone with only those bound rows, DB_CHUNK=1; the final combined pass adds every accepted row (and DB_PRIOR). GEOS overlay initialised and the per-row check memo enabled (semantics-preserving). Generation code unchanged.
/** Generate drawing-backed rows (nativeProvisionalCornerSeals.rows with `drawingBacked`) from specs,
 * using the production footprint/guards, and validate them with the production index. */
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import pc from '/Users/ahmadjalil/github/openindoormaps/node_modules/polygon-clipping/dist/polygon-clipping.esm.js';
import {setDrawingBackedRowMemoEnabled,createNativeProvisionalCornerSealIndex,drawingBackedAssumptionFootprint,nativeProvisionalCornerSealsHash,nativeProvisionalAssumptionCounts} from '/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-provisional-corner-seals.ts';
import {nativeDerivedFrameHash} from '/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-derived-frame-returns.ts';
import {nativePositiveMaterialBandsAcrossLevels,nativePositiveMaterialBandOverlapsParts} from '/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-positive-material-bands.ts';
type P2=[number,number];
await (await import('/Users/ahmadjalil/github/openindoormaps/app/indoor-project/native-exact-geos-overlay.ts')).initializeNativeExactGeosOverlay();
setDrawingBackedRowMemoEnabled(true); // fix-seams: per-row check memo (as derive-areas.mts); base rows are checked once
const RF='/Users/ahmadjalil/github/openindoormaps/work/floor1-followup-20261009/routing-followup';
const sha=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const input=JSON.parse(readFileSync(process.env.DB_INPUT??RF+'/drawing-backed/inputs/db-validation-input.json','utf8'));
const S=JSON.parse(readFileSync(process.env.DB_SPECS??RF+'/drawing-backed/specs.json','utf8'));
const ONLY=process.env.DB_ONLY?.split(',');if(ONLY)S.specs=S.specs.filter((s:any)=>ONLY.some(o=>s.id.includes(o)));
const OUT=process.env.DB_OUT??RF+'/drawing-backed';
const decisions=JSON.parse(readFileSync(S.decisionsFile,'utf8'));
const br=input.boundaryReference, material=input.nativeMaterialSections, seals=input.nativeProvisionalCornerSeals;
const area=(p:any)=>{let s=0;for(const part of p)for(let k=0;k<part.length;k++){const r=part[k];let a=0;for(let i=0;i<r.length;i++){const x=r[i],y=r[(i+1)%r.length];a+=(x[0]-r[0][0])*(y[1]-r[0][1])-(y[0]-r[0][0])*(x[1]-r[0][1]);}s+=(k?-1:1)*Math.abs(a)/2;}return s;};
const sectionsAt=(lvl:number,cut:number)=>material.levels.filter((l:any)=>l.levelId===lvl&&l.cutElevationFeet===cut).flatMap((l:any)=>l.sections);
const bands=nativePositiveMaterialBandsAcrossLevels(material.levels);
const census=new Map<number,any>(seals.foreignBodies.map((b:any)=>[b.nativeElementId,b]));
const segDist=(p:P2,[a,b]:[P2,P2])=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const nearestOn=(parts:any[],p:P2):P2=>{let best:P2=p,bd=Infinity;for(const part of parts)for(const r of part)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0,q:P2=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<bd){bd=d;best=q;}}return best;};
const rows:any[]=[], notes:any[]=[];
for(const s of S.specs){
  const sec=s.dwg?br.sections.find((x:any)=>x.sectionId===s.dwg.sectionId):undefined;
  const c={...s.construction};
  if(s.id.includes(':q5:')){ // measured on the prepared native section at the first cut of this level
    const cut=material.levels.filter((l:any)=>l.levelId===s.levelId).map((l:any)=>l.cutElevationFeet).sort((a:number,b:number)=>a-b)[0];
    const parts=(id:number)=>sectionsAt(s.levelId,cut).filter((x:any)=>x.nativeElementId===id).flatMap((x:any)=>x.partsFeet);
    const m:P2=[(s.seamFeet[0][0]+s.seamFeet[1][0])/2,(s.seamFeet[0][1]+s.seamFeet[1][1])/2];
    c.pointAFeet=nearestOn(parts(s.owners[0]),m); c.pointBFeet=nearestOn(parts(s.owners[1]),c.pointAFeet);
    s.measuredGapFeet=Math.hypot(c.pointBFeet[0]-c.pointAFeet[0],c.pointBFeet[1]-c.pointAFeet[1]);
    const g=s.measuredGapFeet; if(g>0)c.directionFeet=[(c.pointBFeet[0]-c.pointAFeet[0])/g,(c.pointBFeet[1]-c.pointAFeet[1])/g];
    s.topElevationFeet=Math.min(...s.owners.map((o:number)=>census.get(o).boundsFeet.max[2]));
  }
  if(c.kind==='bridge'){const g=Math.hypot(c.pointBFeet[0]-c.pointAFeet[0],c.pointBFeet[1]-c.pointAFeet[1]); s.measuredGapFeet=g; if(g>0)c.directionFeet=[(c.pointBFeet[0]-c.pointAFeet[0])/g,(c.pointBFeet[1]-c.pointAFeet[1])/g];}
  if(c.kind==='native-column-outline'){
    const sect=sectionsAt(c.sourceLevelId,c.sourceCutElevationFeet).find((x:any)=>x.nativeElementId===s.owners[0]&&x.kind==='column');
    let ring=sect.partsFeet[0][0]; if(JSON.stringify(ring[0])===JSON.stringify(ring.at(-1)))ring=ring.slice(0,-1); c.outlineFeet=ring;
    if(s.dwg.entities==='auto'){const idx=new Set<number>();for(const v of ring){let bi=-1,bd=Infinity;sec.wallSegments.forEach((g:any,i:number)=>{const d=segDist(v,g);if(d<bd){bd=d;bi=i;}});if(bd<=0.1)idx.add(bi);}s.dwg.entities=[...idx].sort((a,b)=>a-b);}
  }
  if(c.kind==='dwg-face-pair'){ // clamp the declared span to where both registered faces exist (exact feet on faceB)
    const [a,b]=c.faceAFeet,[p,q]=c.faceBFeet,la=Math.hypot(b[0]-a[0],b[1]-a[1]),u=[(b[0]-a[0])/la,(b[1]-a[1])/la],lb=Math.hypot(q[0]-p[0],q[1]-p[1]),v=[(q[0]-p[0])/lb,(q[1]-p[1])/lb];
    const s0=(a[0]-p[0])*v[0]+(a[1]-p[1])*v[1],ds=u[0]*v[0]+u[1]*v[1],ts=[(0-s0)/ds,(lb-s0)/ds].sort((x,y)=>x-y);
    // extend each span by up to 0.2 ft (below the 0.25 ft drawing tolerance) to meet jambs/adjacent spans
    c.intervalFeet=[Math.max(c.intervalFeet[0]-0.2,ts[0]-0.2,0),Math.min(c.intervalFeet[1]+0.2,ts[1]+0.2,la)];
  }
  const partsFeet=drawingBackedAssumptionFootprint(c);
  let owners:number[]=[...s.owners];
  const bandCuts=material.levels.filter((l:any)=>l.levelId===s.levelId&&l.cutElevationFeet>=s.baseElevationFeet&&l.cutElevationFeet<s.topElevationFeet);
  if(c.kind==='bridge'){ // a curtain/door assembly host whose section is the union of an owner's children is the same material
    for(const l of bandCuts)for(const x of l.sections)if(!owners.includes(x.nativeElementId)&&(x.sourceAssemblyChildIds??[]).some((k:number)=>owners.includes(k))&&area(pc.intersection(partsFeet as any,x.partsFeet))>0)owners.push(x.nativeElementId);
  }
  if(c.kind!=='bridge'){ // owners: every native member the assumed body meets is declared, never silently skipped
    for(const l of bandCuts)for(const x of l.sections)if(!owners.includes(x.nativeElementId)&&area(pc.intersection(partsFeet as any,x.partsFeet))>0)owners.push(x.nativeElementId);
    for(const b of bands)if(!owners.includes(b.nativeElementId)&&b.baseElevationFeet<s.topElevationFeet&&b.topElevationFeet>s.baseElevationFeet&&nativePositiveMaterialBandOverlapsParts(b,partsFeet as any))owners.push(b.nativeElementId);
  }
  const ps=partsFeet.flat(2),box={min:[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),s.baseElevationFeet],max:[Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1])),s.topElevationFeet]};
  const meets=(b:any)=>!(b.max.some((x:number,i:number)=>x<box.min[i])||b.min.some((x:number,i:number)=>x>box.max[i]));
  const acknowledged=seals.foreignBodies.filter((b:any)=>!owners.includes(b.nativeElementId)&&!(seals.nonPhysicalCurtainHostNativeElementIds??[]).includes(b.nativeElementId)&&meets(b.boundsFeet)&&!b.partsFeet).map((b:any)=>b.nativeElementId).sort((a:number,b:number)=>a-b);
  const near2=(f:any)=>{const q=(f.partsFeet??[f.ringsFeet]).flat(2);return !(Math.min(...q.map((p:any)=>p[0]))>box.max[0]+2||Math.max(...q.map((p:any)=>p[0]))<box.min[0]-2||Math.min(...q.map((p:any)=>p[1]))>box.max[1]+2||Math.max(...q.map((p:any)=>p[1]))<box.min[1]-2);};
  let floorsSel=input.walkingSupport.floors.filter((f:any)=>Math.abs(f.elevationFeet-s.elevationFeet)<0.05&&area(pc.intersection(partsFeet as any,(f.partsFeet??[f.ringsFeet])))>0);
  let offSlab=false;
  { const sup=floorsSel.flatMap((f:any)=>f.partsFeet??[f.ringsFeet]); if(!sup.length||area(pc.difference(partsFeet as any,sup as any))>1e-9)offSlab=true; }
  if(!floorsSel.length)floorsSel=input.walkingSupport.floors.filter((f:any)=>Math.abs(f.elevationFeet-s.elevationFeet)<0.05&&near2(f));
  const floors=floorsSel.map((f:any)=>({nativeElementId:f.nativeElementId,elevationFeet:f.elevationFeet,partsFeet:f.partsFeet??[f.ringsFeet]}));
  // a closure beyond the slab edge cannot carry walking; it is enclosure context only
  let role=s.materialRole??(offSlab&&c.kind==='bridge'?'enclosure-context-only':undefined);
  for(const door of input.doors){const e=input.edges.find((x:any)=>x.id===door.id);if(e?.enabled&&e.kind==='door'&&door.footprintFeet&&e.pointsFeet.some((p:number[])=>p[2]>=s.baseElevationFeet-0.05&&p[2]<=s.topElevationFeet)&&area(pc.intersection(partsFeet as any,[door.footprintFeet]))>0){if(c.kind==='bridge')role='enclosure-context-only';else notes.push({id:s.id,door:door.id,why:'assumed wall body crosses a physical doorway'});}}
  const dwgBlock=sec?{sourceDwgSha256:br.sourceSha256,registrationSha256:sha(JSON.stringify([br.sourceSha256,sec])),sectionId:sec.sectionId,toleranceFeet:0.25,entities:s.dwg.entities.map((i:number)=>({kind:'wallSegments',index:i,segmentFeet:sec.wallSegments[i]}))}:undefined;
  const dec=s.decisionId.split('#')[1];
  const drawingBacked:any={version:1,kind:s.kind,decisionId:s.decisionId,decisionsSha256:S.decisionsSha256,nativeOwnerIds:owners,measuredGapFeet:c.kind==='bridge'?s.measuredGapFeet:0,...(s.kind==='exact-contact-closure'?{numericalBoundFeet:1.5e-5}:{}),construction:c,...(dwgBlock?{dwg:dwgBlock}:{}),acknowledgedUnverifiedBodyIds:acknowledged,...(s.missingCutOffsetsFeet?{missingNativeCutEvidence:{cutElevationsFeet:s.missingCutOffsetsFeet.map((o:number)=>s.elevationFeet+o),evidenceSha256:sha(readFileSync(RF+'/b9/b9-production-cuts-5-heights.json'))}}:{})};
  const row:any={id:s.id,levelId:s.levelId,elevationFeet:s.elevationFeet,baseElevationFeet:s.baseElevationFeet,topElevationFeet:s.topElevationFeet,state:'applied',
    carrierContactNativeElementIds:owners.length>1?owners.slice(0,-1):owners,targetNativeElementId:owners.length>1?owners.at(-1):0,
    carrierContactFaceFeet:c.kind==='bridge'?[c.pointAFeet,c.pointBFeet]:c.kind==='dwg-face-pair'?c.faceAFeet:[c.outlineFeet[0],c.outlineFeet[1]],
    nearestCarrierContactFeet:c.kind==='bridge'?c.pointAFeet:c.kind==='dwg-face-pair'?c.faceAFeet[0]:c.outlineFeet[0],
    nearestTargetContactFeet:c.kind==='bridge'?c.pointBFeet:c.kind==='dwg-face-pair'?c.faceBFeet[0]:c.outlineFeet[1],
    contactPaddingFeet:c.kind==='bridge'?c.overlapFeet:0.00002,partsFeet,sourceFloorIds:floors.map((f:any)=>f.nativeElementId),sourceFloorBindings:floors,sourceFloorPartsSha256:nativeDerivedFrameHash(floors),
    ...(role?{materialRole:role}:{}),drawingBacked,
    assumption:{kind:'drawing-backed',authorizationRecorded:true,authorizationEvidenceSha256:sha([S.decisionsSha256,dec,dec==='standingPolicy'?decisions.standingPolicy:decisions.decisions[dec]]),revisitRequired:true,sourceVerified:false,evidenceSha256:sha(drawingBacked)}};
  row.evidenceSha256=sha({...row});
  rows.push(row);
}
// validate each row alone with the production index, then all together
const base={...input}; const results:any[]=[];
const PRIOR:any[]=process.env.DB_PRIOR?JSON.parse(readFileSync(process.env.DB_PRIOR,'utf8')).rows:[];
const ALONE=!!process.env.DB_ALONE; // fix-seams: stage 1 = each new row alone on the existing descriptor; stage 2 = one combined pass
const BOUND=new Set<string>(process.env.DB_BOUND?JSON.parse(readFileSync(process.env.DB_BOUND,'utf8')):[]);
// alone: the new row with only the rows the envelope levels bind (provisionalCornerIds), so the binding check holds; combined: every existing row + DB_PRIOR + all accepted new rows
const descriptor=(extra:any[],alone=ALONE)=>{const v={...seals,rows:[...(alone?seals.rows.filter((r:any)=>BOUND.has(r.id)):seals.rows),...(alone?[]:PRIOR),...extra]};v.geometrySha256=nativeProvisionalCornerSealsHash(v);return v;};
// Envelope levels bind the seal geometry checksum; a regenerated candidate re-binds them (simulated here only).
const rebound=(v:any)=>({...input.nativeIndoorEnvelopes,levels:input.nativeIndoorEnvelopes.levels.map((l:any)=>l.provisionalCornerGeometrySha256?{...l,provisionalCornerGeometrySha256:v.geometrySha256}:l)});
// Validate together first; on failure split recursively so only failing rows are isolated.
const ok=(rs:any[])=>{try{const v=descriptor(rs);createNativeProvisionalCornerSealIndex({...base,nativeProvisionalCornerSeals:v,nativeIndoorEnvelopes:rebound(v)});return undefined;}catch(e:any){return e;}};
const verdict=new Map<any,any>();
const check=(rs:any[])=>{if(!rs.length)return;const e=ok(rs);if(!e){for(const r of rs)verdict.set(r,{id:r.id,ok:true});return;}if(rs.length===1){verdict.set(rs[0],{id:rs[0].id,ok:false,error:String(e.message).slice(0,400),stack:String(e.stack).split('\n').slice(0,8).join(' | ')});return;}const h=Math.ceil(rs.length/2);check(rs.slice(0,h));check(rs.slice(h));};
const CH=Number(process.env.DB_CHUNK??0);if(CH>0){for(let i=0;i<rows.length;i+=CH)check(rows.slice(i,i+CH));}else check(rows);
for(const r of rows)results.push(verdict.get(r));
const good=rows.filter((r,i)=>results[i].ok);
const all=descriptor(good,false); let allOk=true; try{createNativeProvisionalCornerSealIndex({...base,nativeProvisionalCornerSeals:all,nativeIndoorEnvelopes:rebound(all)});}catch(e:any){allOk=false;console.log('combined failure',e.message);}
writeFileSync(OUT+'/drawing-backed-rows.json',JSON.stringify({format:'unbc-drawing-backed-assumption-rows',version:1,decisionsFile:S.decisionsFile,decisionsSha256:S.decisionsSha256,baseSealsGeometrySha256:seals.geometrySha256,sourceMaterialGeometrySha256:seals.sourceMaterialGeometrySha256,rows:good},null,1));
writeFileSync(OUT+'/drawing-backed-descriptor.json',JSON.stringify(all));
writeFileSync(OUT+'/validation.json',JSON.stringify({allOk,counts:nativeProvisionalAssumptionCounts(all),results,notes,newGeometrySha256:all.geometrySha256},null,1));
console.log('rows',rows.length,'valid',good.length,'combined ok',allOk,JSON.stringify(nativeProvisionalAssumptionCounts(all)));
for(const r of results.filter(r=>!r.ok))console.log('REJECT',r.id,r.error,process.env.DB_STACK?r.stack:'');
for(const n of notes)console.log('NOTE',JSON.stringify(n));
