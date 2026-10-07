import{test}from'node:test';import assert from'node:assert/strict';import{fixture,project}from'../fixtures/native-area-project';import{findProjectRoute,projectRouteFailure}from'../../app/indoor-project/routing';import{exportCampusViewer}from'../../app/indoor-project/package';import{doorApertureGeometryKey,validateDoorApertureBinding,type ReviewedDoorApertures}from'../../app/indoor-project/reviewed-door-apertures';
const quad=(y0:number,y1:number)=>[[-1,y0],[1,y0],[1,y1],[-1,y1]]as[number,number][];
function sample(){const data=fixture(),a=quad(2,4),v:ReviewedDoorApertures={version:1,sourceModelSha256:data.source.modelSha256,patches:[{id:'review',levelId:1,nativeDoorId:2,apertureFeet:a,normalFeet:[1,0],wallEvidence:[{nativeElementId:1,partsFeet:[quad(0,6)]}],frameEvidence:[3,4,5,6].map(nativeElementId=>({nativeElementId,orientedBox:Array.from({length:8},(_,i)=>[i,0,0])})),notes:'Reviewed duplicate container, preserve native frame.'}]};data.doors=[{id:'door',nativeElementId:2,levelId:1,pointFeet:[0,3],normalFeet:[1,0],footprintFeet:a,roomKeys:['0','1'],state:'connected'}];data.walls=[0,4].map(y=>({nativeElementId:1,levelId:1,kind:'wall',approximate:false,ringsFeet:[quad(y,y+2)]}));data.doorAperturePatchState={regenerated:true,sourceGeometryKey:doorApertureGeometryKey(v)};return{data,v};}
test('compiled doorway binds original subtractive geometry',()=>{const{data,v}=sample();assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));assert.throws(()=>validateDoorApertureBinding(undefined,data));v.patches[0].notes+=' More authoring notes.';assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));});
test('prepared aperture accepts all exact cyclic and reversed ring orders',()=>{
 for(const direction of [1,-1])for(let offset=0;offset<4;offset++){
  const{data,v}=sample(),key=doorApertureGeometryKey(v),ring=v.patches[0].apertureFeet;
  data.doors![0].footprintFeet=ring.map((_,i)=>[...ring[(offset+direction*i+4)%4]!] as [number,number]);
  assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));
  assert.equal(doorApertureGeometryKey(v),key);
  assert.equal(data.doorAperturePatchState!.sourceGeometryKey,key);
 }
});
test('ring equivalence rejects a moved corner, different topology and reversed normal',()=>{
 for(const change of ['corner','topology','normal']){
  const{data,v}=sample(),ring=structuredClone(v.patches[0].apertureFeet);
  if(change==='corner')ring[0][0]+=1e-12;
  if(change==='topology')[ring[1],ring[2]]=[ring[2],ring[1]];
  data.doors![0].footprintFeet=ring;
  if(change==='normal')data.doors![0].normalFeet=[-1,0];
  assert.throws(()=>validateDoorApertureBinding(v,data),/Prepared door does not match/);
 }
});
test('source geometry key stays exact even for an equivalent source ring order',()=>{
 const{data,v}=sample(),ring=v.patches[0].apertureFeet;
 v.patches[0].apertureFeet=[...ring.slice(1),ring[0]];
 assert.throws(()=>validateDoorApertureBinding(v,data),/source patch and prepared evidence differ/);
});
test('changed source aperture, door footprint and prepared material invalidate application',()=>{for(const edit of[(x:any)=>x.v.patches[0].apertureFeet[0][1]=1.9,(x:any)=>x.data.doors[0].normalFeet=[0,1],(x:any)=>x.data.walls[0].ringsFeet[0][0][0]-=.1]){const x=sample();x.data.doors=structuredClone(x.data.doors);edit(x);assert.throws(()=>validateDoorApertureBinding(x.v,x.data));}});

test('pending doorway correction blocks directions and visitor export until regeneration',async()=>{const p=await project();p.dataset.doorAperturePatchState={regenerated:false,sourceGeometryKey:'pending-native-review'};assert.equal(findProjectRoute(p.dataset,'0','1'),null);assert.match(projectRouteFailure(p.dataset,'0','1','public'),/Regenerate/);await assert.rejects(exportCampusViewer(p),/Regenerate/);});
test('basic-wall overlap correction requires portable original door and host evidence',()=>{const{data,v}=sample();Object.assign(v.patches[0],{kind:'basic-wall-overlap',frameEvidence:[],doorEvidence:{hostId:1,orientedBox:Array.from({length:8},(_,i)=>[i,0,0])}});data.doorAperturePatchState={regenerated:true,sourceGeometryKey:doorApertureGeometryKey(v)};assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));delete v.patches[0].doorEvidence;assert.throws(()=>validateDoorApertureBinding(v,data));});
test('separately checked supplemental boundary faces do not replace original aperture-cut evidence',()=>{const{data,v}=sample();data.walls.push({nativeElementId:1,levelId:1,kind:'wall',approximate:false,ringsFeet:[quad(7,8)],reviewPatchId:'separately-bound-continuation'});assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));data.walls[0].ringsFeet[0][0][0]-=.1;assert.throws(()=>validateDoorApertureBinding(v,data));});

test('single native basic host variant preserves enabled door binding before and after regeneration',()=>{
 const {data,v}=sample(),physical=quad(2,9),host=quad(0,12),p=v.patches[0];
 Object.assign(p,{kind:'basic-host-missing-opening',frameEvidence:[],doorEvidence:{hostId:1,orientedBox:[...physical.map(q=>[...q,0]),...physical.map(q=>[...q,7])]},preparedDoorEvidence:{pointFeet:[0,5.5],normalFeet:[1,0],footprintFeet:physical,roomKeys:['0','1'],evidenceSha256:'b'.repeat(64)},apertureFeet:physical,wallEvidence:[{nativeElementId:1,partsFeet:[host]}]});
 data.doors![0]={...data.doors![0],pointFeet:[0,5.5],footprintFeet:physical};data.edges.push({id:'door',from:'0',to:'1',kind:'door',enabled:true,nativeElementId:2,roomKeys:['0','1'],pointsFeet:[],profiles:['public','step-free'],distanceMetres:0}as any);
 data.doorAperturePatchState={regenerated:false,sourceGeometryKey:doorApertureGeometryKey(v)};assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));
 data.walls=[0,9].map(y=>({nativeElementId:1,levelId:1,kind:'wall',approximate:false,ringsFeet:[quad(y,y===0?2:12)]}));data.doorAperturePatchState.regenerated=true;assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));
 for(const edit of[(x:any)=>x.doors[0].pointFeet[0]+=.01,(x:any)=>x.doors[0].roomKeys=['0','foreign'],(x:any)=>x.doors[0].state='unmatched',(x:any)=>x.edges.find((e:any)=>e.id==='door').enabled=false,(x:any)=>x.edges.find((e:any)=>e.id==='door').roomKeys=['0','foreign']]){const changed=structuredClone(data);edit(changed);assert.throws(()=>validateDoorApertureBinding(v,changed));}
});

test('app and sibling aperture schemas agree on the distinct double-door variant without widening older kinds',async()=>{
 const{validateReviewedDoorApertures:app}=await import('../../app/indoor-project/reviewed-door-apertures');
 const{validateReviewedDoorApertures:compiler}=await import('../../../reviter/lib/reviter/reviewed-door-apertures.ts');
 const{v}=sample(),base=structuredClone(v);Object.assign(base.patches[0],{kind:'basic-host-missing-opening',frameEvidence:[],doorEvidence:{hostId:1,orientedBox:Array.from({length:8},()=>[0,0,0])},preparedDoorEvidence:{pointFeet:[0,5.5],normalFeet:[1,0],footprintFeet:quad(2,9),roomKeys:['0','1'],evidenceSha256:'b'.repeat(64)},apertureFeet:quad(2,9)});
 for(const validate of[app,compiler])assert.doesNotThrow(()=>validate(base));
 for(const edit of[(x:any)=>x.patches[0].kind='basic-wall-overlap',(x:any)=>x.patches[0].apertureFeet=quad(2,13),(x:any)=>x.patches[0].preparedDoorEvidence.roomKeys=['0','0'],(x:any)=>x.patches[0].preparedDoorEvidence.evidenceSha256='stale',(x:any)=>x.patches[0].wallEvidence.push(x.patches[0].wallEvidence[0]),(x:any)=>delete x.patches[0].preparedDoorEvidence]){
  const changed=structuredClone(base);edit(changed);for(const validate of[app,compiler])assert.throws(()=>validate(changed));
 }
 const curtain=structuredClone(v);curtain.patches[0].apertureFeet=quad(2,9);for(const validate of[app,compiler])assert.throws(()=>validate(curtain));
});

test('aperture and historical cap composition restores only exactly bound original evidence',async()=>{
 const{reviewedDoorWallSourceEvidence:app}=await import('../../app/indoor-project/reviewed-door-apertures');
 const{reviewedDoorWallSourceEvidence:compiler}=await import('../../../reviter/lib/reviter/reviewed-door-apertures.ts');
 const{data,v}=sample();const original=structuredClone(data.walls),boundary={patches:[{id:'historical-cap',levelId:1,status:'applied',ringsFeet:[quad(-.01,.01)],wallEvidence:[{nativeElementId:1,ringsFeet:[quad(0,6)]}]}]};
 const restored=app(data.walls,v,data.source.modelSha256,boundary);assert.deepEqual(restored,compiler(data.walls,v,data.source.modelSha256,boundary));assert(restored.some(w=>JSON.stringify(w.ringsFeet)===JSON.stringify(v.patches[0].wallEvidence[0].partsFeet.map(r=>r))));assert.deepEqual(data.walls,original);
 for(const change of['changed-cut','changed-original','fills-door']){
  const walls=structuredClone(data.walls),value=structuredClone(v),patches=structuredClone(boundary);
  if(change==='changed-cut')walls[0].ringsFeet[0][0][0]-=.1;
  if(change==='changed-original'){value.patches[0].wallEvidence[0].partsFeet[0][0][0]-=.1;patches.patches[0].wallEvidence[0].ringsFeet=structuredClone(value.patches[0].wallEvidence[0].partsFeet);}
  if(change==='fills-door')patches.patches[0].ringsFeet=[quad(2.5,3.5)];
  for(const restore of[app,compiler])assert.throws(()=>restore(walls,value,data.source.modelSha256,patches));
 }
});

test('unrelated historical aperture supports keep their own binding without being promoted to precise boundary evidence',async()=>{
 const{reviewedDoorWallSourceEvidence:app}=await import('../../app/indoor-project/reviewed-door-apertures');
 const{reviewedDoorWallSourceEvidence:compiler}=await import('../../../reviter/lib/reviter/reviewed-door-apertures.ts');
 const{data,v}=sample();const unrelated=structuredClone(v.patches[0]);unrelated.id='old-other-frame';unrelated.nativeDoorId=3;unrelated.wallEvidence[0].nativeElementId=7;v.patches.push(unrelated);
 data.doors!.push({...structuredClone(data.doors![0]),id:'other-door',nativeElementId:3});data.walls.push(...[0,4].map(y=>({nativeElementId:7,levelId:1,kind:'wall' as const,approximate:true,ringsFeet:[quad(y,y+2)]})));data.doorAperturePatchState!.sourceGeometryKey=doorApertureGeometryKey(v);
 const boundary={patches:[{id:'cap-only-host1',levelId:1,status:'applied',ringsFeet:[quad(-.01,.01)],wallEvidence:[{nativeElementId:1,ringsFeet:[quad(0,6)]}]}]};
 assert.doesNotThrow(()=>validateDoorApertureBinding(v,data));for(const restore of[app,compiler]){const result=restore(data.walls,v,data.source.modelSha256,boundary);assert.deepEqual(result.filter(w=>w.nativeElementId===7),data.walls.filter(w=>w.nativeElementId===7));}
 const changed=structuredClone(data);changed.walls.find(w=>w.nativeElementId===7)!.ringsFeet[0][0][0]-=.1;assert.throws(()=>validateDoorApertureBinding(v,changed));
 const forbidden=structuredClone(boundary);forbidden.patches[0].wallEvidence=[{nativeElementId:7,ringsFeet:[quad(0,6)]}];for(const restore of[app,compiler])assert.throws(()=>restore(data.walls,v,data.source.modelSha256,forbidden),/precise/);
});

test('mixed original and retained-piece supports preserve their own exact evidence on the same cut host',async()=>{
 const{reviewedDoorWallSourceEvidence:app}=await import('../../app/indoor-project/reviewed-door-apertures');
 const{reviewedDoorWallSourceEvidence:compiler}=await import('../../../reviter/lib/reviter/reviewed-door-apertures.ts');
 const{data,v}=sample(),before=structuredClone(data.walls),boundaries={patches:[
 {id:'original-supported-cap',levelId:1,status:'applied',ringsFeet:[quad(-.01,.01)],wallEvidence:[{nativeElementId:1,ringsFeet:[quad(0,6)]}]},
 {id:'already-cut-supported-cap',levelId:1,status:'applied',ringsFeet:[quad(1.9998,2.0002)],wallEvidence:[{nativeElementId:1,ringsFeet:[quad(0,2)]}]},
 {id:'contextual-original',levelId:1,status:'applied',ringsFeet:[quad(7,8)],wallEvidence:[{nativeElementId:1,ringsFeet:[quad(0,6)]}]}]};
 for(const restore of[app,compiler]){const proof=restore(data.walls,v,data.source.modelSha256,boundaries);for(const p of boundaries.patches)assert(proof.some(w=>JSON.stringify(w.ringsFeet)===JSON.stringify(p.wallEvidence[0].ringsFeet)));assert.deepEqual(proof.slice(0,before.length),before);}
 assert.deepEqual(data.walls,before);
});
