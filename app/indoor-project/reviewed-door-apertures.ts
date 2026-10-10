import * as DMath from "./deterministic-math";
import pc from "polygon-clipping";
import type {IndoorDataset} from "./contract";
type RoomPoint=[number,number];
export type ReviewedDoorApertures={version:1;sourceModelSha256:string;patches:{kind?:"basic-wall-overlap"|"basic-host-missing-opening";preparedDoorEvidence?:{pointFeet:RoomPoint;normalFeet:RoomPoint;footprintFeet:RoomPoint[];roomKeys:string[];evidenceSha256:string};doorEvidence?:{hostId:number;orientedBox:number[][]};id:string;levelId:number;nativeDoorId:number;apertureFeet:RoomPoint[];normalFeet:RoomPoint;wallEvidence:{nativeElementId:number;partsFeet:RoomPoint[][]}[];frameEvidence:{nativeElementId:number;orientedBox:number[][]}[];notes:string}[]};
const area=(ps:RoomPoint[][][])=>ps.reduce((s,rs)=>s+rs.reduce((a,r,i)=>a+(i?-1:1)*Math.abs(r.reduce((s,p,j)=>{const q=r[(j+1)%r.length]!;return s+p[0]*q[1]-q[0]*p[1]},0))/2,0),0);
export function validateReviewedDoorApertures(v:unknown,sha?:string):asserts v is ReviewedDoorApertures|undefined {
 if(v===undefined)return;const x=v as ReviewedDoorApertures;const pts=(p:unknown):p is RoomPoint[]=>Array.isArray(p)&&p.length>=3&&p.length<=100&&p.every(q=>Array.isArray(q)&&q.length===2&&q.every(n=>Number.isFinite(n)&&Math.abs(n)<1e7));
 if(!x||x.version!==1||!(/^[a-f0-9]{64}$/).test(x.sourceModelSha256)||(sha!==undefined&&sha!==x.sourceModelSha256)||!Array.isArray(x.patches)||x.patches.length>1000||x.patches.some(p=>!p||!p.id||!Number.isSafeInteger(p.levelId)||!Number.isSafeInteger(p.nativeDoorId)||p.nativeDoorId<=0||!pts(p.apertureFeet)||p.apertureFeet.length!==4||p.apertureFeet.some((q,i)=>DMath.hypot(q[0]-p.apertureFeet[(i+1)%4]![0],q[1]-p.apertureFeet[(i+1)%4]![1])>(p.kind==="basic-host-missing-opening"?10:6))||!Array.isArray(p.normalFeet)||p.normalFeet.length!==2||p.normalFeet.some(n=>!Number.isFinite(n))||Math.abs(DMath.hypot(...p.normalFeet)-1)>.000001||!Array.isArray(p.wallEvidence)||!p.wallEvidence.length||p.wallEvidence.length>20||p.wallEvidence.some(w=>!Number.isSafeInteger(w.nativeElementId)||!Array.isArray(w.partsFeet)||!w.partsFeet.length||!w.partsFeet.every(pts))||!Array.isArray(p.frameEvidence)||p.frameEvidence.length!==(p.kind==="basic-wall-overlap"||p.kind==="basic-host-missing-opening"?0:4)||p.frameEvidence.some(f=>!Number.isSafeInteger(f.nativeElementId)||!Array.isArray(f.orientedBox)||f.orientedBox.length!==8||f.orientedBox.some(q=>!Array.isArray(q)||q.length!==3||q.some(n=>!Number.isFinite(n))))||(p.kind!==undefined&&p.kind!=="basic-wall-overlap"&&p.kind!=="basic-host-missing-opening")||((p.kind==="basic-wall-overlap"||p.kind==="basic-host-missing-opening")&&(!p.doorEvidence||!Number.isSafeInteger(p.doorEvidence.hostId)||p.doorEvidence.hostId<=0||!Array.isArray(p.doorEvidence.orientedBox)||p.doorEvidence.orientedBox.length!==8||p.doorEvidence.orientedBox.some(q=>!Array.isArray(q)||q.length!==3||q.some(n=>!Number.isFinite(n)))))||(p.kind==="basic-host-missing-opening"&&(!p.preparedDoorEvidence||p.wallEvidence.length!==1||p.wallEvidence[0]!.nativeElementId!==p.doorEvidence?.hostId||!(/^[a-f0-9]{64}$/).test(p.preparedDoorEvidence.evidenceSha256)||![p.preparedDoorEvidence.pointFeet,p.preparedDoorEvidence.normalFeet].every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite))||JSON.stringify(p.preparedDoorEvidence.normalFeet)!==JSON.stringify(p.normalFeet)||!pts(p.preparedDoorEvidence.footprintFeet)||p.preparedDoorEvidence.footprintFeet.length!==4||!Array.isArray(p.preparedDoorEvidence.roomKeys)||p.preparedDoorEvidence.roomKeys.length!==2||new Set(p.preparedDoorEvidence.roomKeys).size!==2||p.preparedDoorEvidence.roomKeys.some(k=>typeof k!=='string'||!k)))||typeof p.notes!=='string'||!p.notes.trim()||p.notes.length>10000)||new Set(x.patches.map(p=>p.id)).size!==x.patches.length||new Set(x.patches.map(p=>`${p.levelId}:${p.nativeDoorId}`)).size!==x.patches.length)throw new Error('Invalid reviewed native door aperture patch.');
}

export function doorApertureGeometryKey(value:ReviewedDoorApertures){return JSON.stringify(value.patches.map(({notes,...p})=>p));}
// The compiler may change a ring's first corner or winding, but not its
// coordinates or edge order. Keep sourceGeometryKey byte-exact independently.
function sameRingVertices(actual:RoomPoint[]|undefined,expected:RoomPoint[]){
 if(!Array.isArray(actual)||actual.length!==expected.length)return false;
 return expected.some((_,offset)=>[1,-1].some(direction=>expected.every((_,i)=>{
  const p=actual[i];
  const q=expected[(offset+direction*i+expected.length)%expected.length]!;
  return Array.isArray(p)&&p.length===2&&p[0]===q[0]&&p[1]===q[1];
 })));
}
export function validateDoorApertureBinding(value:unknown,data:IndoorDataset){
 validateReviewedDoorApertures(value,data.source.modelSha256);const state=data.doorAperturePatchState;
 if(!value){if(state)throw new Error('Prepared doorway correction has no preserved source patch.');return;}
 if(!state||state.sourceGeometryKey!==doorApertureGeometryKey(value)||typeof state.regenerated!=='boolean')throw new Error('Doorway source patch and prepared evidence differ. Regenerate the master.');
 for(const patch of value.patches.filter(p=>p.kind==='basic-host-missing-opening')){
 const door=data.doors?.find(d=>d.levelId===patch.levelId&&d.nativeElementId===patch.nativeDoorId),proof=patch.preparedDoorEvidence!;
 if(!door||door.state!=='connected'||JSON.stringify(door.pointFeet)!==JSON.stringify(proof.pointFeet)||JSON.stringify(door.normalFeet)!==JSON.stringify(proof.normalFeet)||JSON.stringify([...door.roomKeys].sort())!==JSON.stringify([...proof.roomKeys].sort())||!data.edges.some(e=>e.id===door.id&&e.kind==='door'&&e.enabled&&e.nativeElementId===patch.nativeDoorId&&JSON.stringify([...e.roomKeys].sort())===JSON.stringify([...proof.roomKeys].sort()))||(!state.regenerated&&!sameRingVertices(door.footprintFeet,proof.footprintFeet)))throw new Error('Reviewed basic host opening differs from the preserved enabled physical door.');
 }
 if(!state.regenerated)return;
 for(const p of value.patches){const door=data.doors?.find(d=>d.levelId===p.levelId&&d.nativeElementId===p.nativeDoorId);if(!door||!sameRingVertices(door.footprintFeet,p.apertureFeet)||JSON.stringify(door.normalFeet)!==JSON.stringify(p.normalFeet))throw new Error('Prepared door does not match the reviewed aperture.');
 for(const w of p.wallEvidence){const expected=pc.difference(w.partsFeet.map(r=>[r]),[p.apertureFeet]),actual=data.walls.filter(q=>q.levelId===p.levelId&&q.nativeElementId===w.nativeElementId&&!q.reviewPatchId).map(q=>q.ringsFeet);if(area(pc.xor(expected,actual) as RoomPoint[][][])>.000001)throw new Error('Prepared doorway walls differ from the preserved source correction.');}}
}

/** Recover source evidence for composition only. Every current host must equal
 * either the exact original parts or their exact declared aperture subtraction.
 * This never restores material to prepared walls or admits stale source faces. */
export function reviewedDoorWallSourceEvidence<T extends {levelId:number;nativeElementId:number;ringsFeet:RoomPoint[][];kind?:"wall"|"column";approximate?:boolean;reviewPatchId?:string}>(walls:T[],value:unknown,sha:string,boundaries?:{patches:{id:string;levelId:number;status:string;ringsFeet:RoomPoint[][];wallEvidence:{nativeElementId:number;ringsFeet:RoomPoint[][]}[]}[]}):T[]{
 validateReviewedDoorApertures(value,sha);if(!value?.patches.length)return walls;
 const groups=new Map<string,{levelId:number;id:number;parts:RoomPoint[][];apertures:RoomPoint[][]}>();
 for(const p of value.patches)for(const w of p.wallEvidence){const key=p.levelId+':'+w.nativeElementId,old=groups.get(key);if(old){if(JSON.stringify(old.parts)!==JSON.stringify(w.partsFeet))throw new Error('Conflicting original doorway host evidence.');old.apertures.push(p.apertureFeet);}else groups.set(key,{levelId:p.levelId,id:w.nativeElementId,parts:w.partsFeet,apertures:[p.apertureFeet]});}
 let result=[...walls];
 for(const g of groups.values()){
  // A saved continuation can already bind retained post-cut pieces. Restore
  // only referenced full original faces; current-piece evidence stays checked
  // against current geometry and never becomes an archived-source exception.
  const key=(rs:RoomPoint[][])=>JSON.stringify(rs.map(r=>r.map(p=>p.map(n=>Math.round(n*1e6)/1e6))));
  const usesOriginal=(p:NonNullable<typeof boundaries>['patches'][number])=>p.status==='applied'&&p.levelId===g.levelId&&p.wallEvidence.some(w=>w.nativeElementId===g.id&&g.parts.some(r=>key([r])===key(w.ringsFeet)));
  if(!boundaries?.patches.some(usesOriginal))continue;
  if(!walls.some(w=>w.levelId===g.levelId))continue; // Compiler levels are populated incrementally.
  const current=walls.filter(w=>w.levelId===g.levelId&&w.nativeElementId===g.id&&!w.reviewPatchId);
  if(!current.length||current.some(w=>w.approximate||w.kind!=='wall'))throw new Error('Reviewed doorway host source evidence has no precise prepared wall.');
  const actual=current.map(w=>w.ringsFeet),original=g.parts.map(r=>[r]),cut=pc.difference(original,...g.apertures.map(r=>[r]));
  const equal=(a:RoomPoint[][][],b:RoomPoint[][][])=>area(pc.xor(a,b) as RoomPoint[][][])<=1e-6;
  if(!equal(actual,original)&&!equal(actual,cut as RoomPoint[][][]))throw new Error('Prepared doorway host differs from exact original/aperture composition.');
  for(const p of boundaries?.patches??[])if(usesOriginal(p)){
   if(g.apertures.some(aperture=>area(pc.intersection(p.ringsFeet,[aperture]) as RoomPoint[][][])>1e-8)||(area(pc.intersection(p.ringsFeet,original) as RoomPoint[][][])>1e-10&&area(pc.intersection(p.ringsFeet,cut) as RoomPoint[][][])<=1e-10))throw new Error('Boundary continuation loses retained host contact or fills a reviewed doorway: '+p.id);
  }
  for(const r of g.parts)if(!current.some(w=>key(w.ringsFeet)===key([r])))result.push({...current[0]!,ringsFeet:[r]});
 }
 return result;
}

/** Native preview workers have the exact geometry-only aperture key, while
 * authoring notes remain in source rooms. Rebind decoded geometry to the current
 * prepared doors/walls before using it as original support evidence. */
export function preparedReviewedDoorApertures(data:IndoorDataset):ReviewedDoorApertures|undefined {
 const state=data.doorAperturePatchState;if(!state)return undefined;
 let patches:ReviewedDoorApertures['patches'];try{patches=JSON.parse(state.sourceGeometryKey);}catch{throw new Error('Invalid prepared doorway geometry key.');}
 if(!Array.isArray(patches))throw new Error('Invalid prepared doorway geometry key.');
 const value:ReviewedDoorApertures={version:1,sourceModelSha256:data.source.modelSha256,patches:patches.map(p=>({...p,notes:'Prepared source-bound aperture geometry; original authoring notes remain in rooms.'}))};
 validateDoorApertureBinding(value,data);return value;
}
