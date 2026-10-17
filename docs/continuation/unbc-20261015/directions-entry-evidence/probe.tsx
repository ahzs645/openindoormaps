import React from 'react';
import {createRoot} from 'react-dom/client';
import {act} from 'react-dom/test-utils';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {useProjectRoute} from '/workspace/openindoormaps/app/indoor-project/use-project-route.ts';
import {ProjectNavigation} from '/workspace/openindoormaps/app/indoor-project/project-navigation.tsx';
import {MapProvider} from '/workspace/openindoormaps/app/components/map/map.tsx';
import {ThemeContext} from '/workspace/openindoormaps/app/hooks/use-theme.ts';
import {RouteWorkerClient} from '/workspace/openindoormaps/app/indoor-project/route-worker-client.ts';
import {heavyWorkerSchedule} from '/workspace/openindoormaps/app/indoor-project/heavy-worker-schedule.ts';
import {configureFloorDiagnostics} from '/workspace/openindoormaps/app/indoor-project/floor-diagnostics.ts';
import type {IndoorDataset} from '/workspace/openindoormaps/app/indoor-project/contract.ts';

const dir='/workspace/scratch/unbc-pathway-repair-20261015/route-entry-component-qa/';
const rootDir='/workspace/scratch/unbc-four-door-review-20261015/';
const paths={inventory:'/workspace/scratch/unbc-pathway-repair-20261015/destination-completeness/destination-source-gap-inventory.json',records:rootDir+'field-records.json',nodes:rootDir+'field-nodes.json',edges:rootDir+'field-edges.json',source:rootDir+'field-source.json'};
const sha=(raw:Uint8Array)=>createHash('sha256').update(raw).digest('hex');
const inputs=Object.fromEntries(Object.entries(paths).map(([k,path])=>{const raw=fs.readFileSync(path);return[k,{path,sha256:sha(raw),value:JSON.parse(raw.toString())}]}));
const inventory=inputs.inventory.value, records=inputs.records.value;
assert.equal(inputs.records.sha256,inventory.sourceInputs.records.sha256);
const missing=inventory.rows.filter((r:any)=>r.baselineFamily==='missing-entrance');
assert.equal(missing.length,115);assert.equal(new Set(missing.map((r:any)=>r.key)).size,115);
for(const item of missing){const record=records.find((r:any)=>r.key===item.key);assert(record);assert(!record.arrivalNodeId);}
const data={records,nodes:inputs.nodes.value,edges:inputs.edges.value,source:inputs.source.value,floors:[],nativeLevels:[],doors:[],walls:[],connectors:[],issues:[]} as unknown as IndoorDataset;
const originalData=JSON.stringify(data);
const physicalReads:string[]=[];let rejectPhysicalRead=true;
for(const name of ['circulationGeometry','walkingSupport','nativeMaterialSections','nativeMaterialSectionSupplement'])
  Object.defineProperty(data,name,{configurable:true,enumerable:false,get(){physicalReads.push(name);if(rejectPhysicalRead)throw Error('Unexpected physical preparation access: '+name);return undefined;}});
const diagnostics:any[]=[];configureFloorDiagnostics(true,e=>diagnostics.push(e));
const observed={requests:[] as any[],workers:[] as any[],posts:[] as any[],terminations:0,schedule:[] as string[]};
const originalRequest=RouteWorkerClient.prototype.request;
RouteWorkerClient.prototype.request=function(...args:Parameters<typeof originalRequest>){observed.requests.push({start:args[1],end:args[2],mode:args[3]});return originalRequest.apply(this,args);};
const originalBegin=heavyWorkerSchedule.begin;
heavyWorkerSchedule.begin=function(kind:Parameters<typeof originalBegin>[0]){observed.schedule.push(kind);return originalBegin.call(this,kind);};
// Controlled transport is the test boundary. Real React effects, client request,
// worker payload projection and scheduling run unchanged. Global validation does not.
class ControlledWorker {
  onmessage:any=null;onerror:any=null;onmessageerror:any=null;
  constructor(public url:URL,public options:any){observed.workers.push({url:String(url),options});}
  postMessage(request:any){observed.posts.push({requestId:request.requestId,start:request.start,end:request.end,mode:request.mode,hasDataset:!!request.data});}
  terminate(){observed.terminations++;}
}
Object.defineProperty(globalThis,'Worker',{value:ControlledWorker,configurable:true,writable:true});
const noop=()=>{};const styles={light:{version:8,sources:{},layers:[]},dark:{version:8,sources:{},layers:[]}} as any;
const container=document.createElement('main');document.body.appendChild(container);const root=createRoot(container);
type Scenario={start:string;end:string;mode:'public'|'accessible';showUI:boolean};let latest:any;
function App({scenario}:{scenario:Scenario}){
  const result=useProjectRoute(data,scenario.start,scenario.end,scenario.mode,true);latest=result;
  return <ThemeContext.Provider value={{theme:'light',setTheme:noop}}><MapProvider styles={styles}>
    {scenario.showUI?<ProjectNavigation data={data} route={result.route} calculating={result.calculating} preparingRoutes={result.preparing}
      calculationError={result.error} routeDiagnostic={result.diagnostic} reachable={result.reachable} start={scenario.start} end={scenario.end}
      mode={scenario.mode} arrivalMode="inside" onArrivalMode={noop} arrivalReasons={{}} selected="" onStart={noop} onEnd={noop} pickTarget={null}
      onPickTarget={noop} onMode={noop} onPick={noop} onFloor={noop} roomThree={false} showPassThroughPlaces={true} onPassThroughPlaces={noop}
      showDoorwayRecesses={false} onDoorwayRecesses={noop} showDoorLocations={false} onDoorLocations={noop} showVestibuleDoors={false} onVestibuleDoors={noop}
      showStructures={false} onStructures={noop} simplifyGeometry={false} onSimplifyGeometry={noop} keepBuildingOverview={false} onKeepBuildingOverview={noop}
      labelSettings={{preset:'balanced',roomZoom:21,fullNameZoom:22,spacing:18}} onLabelSettings={noop} basemapBuildings={{mode:'show',marginMetres:15,areas:[]}}
      onBasemapBuildings={noop} onDrawBasemapArea={noop}/>:null}
  </MapProvider></ThemeContext.Provider>;
}
async function render(scenario:Scenario){await act(async()=>{root.render(<App scenario={scenario}/>);await Promise.resolve();});}
async function openDirections(){const button=container.querySelector<HTMLButtonElement>('button.project-directions-entry');if(button)await act(async()=>{button.click();await Promise.resolve();});}
function assertNoWork(){assert.equal(latest.calculating,false);assert.equal(latest.preparing,false);assert.equal(latest.route,null);assert.equal(observed.requests.length,0);assert.equal(observed.workers.length,0);assert.equal(observed.posts.length,0);assert.equal(physicalReads.length,0);assert(!diagnostics.some(d=>['route:request','route:warmup-start'].includes(d.stage)));}
const valid=records.find((r:any)=>r.number==='05-136'&&r.arrivalNodeId)??records.find((r:any)=>r.arrivalNodeId&&!r.circulation&&!r.stair&&r.walkable&&r.access!=='staff');assert(valid);
const another=records.find((r:any)=>r.number==='05-173'&&r.arrivalNodeId)??records.find((r:any)=>r.key!==valid.key&&r.arrivalNodeId&&!r.circulation&&!r.stair&&r.walkable&&r.access!=='staff');assert(another);
const rows:any[]=[];const started=performance.now();
for(const mode of ['public','accessible'] as const)for(const m of missing)for(const orientation of ['missing-start','missing-end'] as const){
  const start=orientation==='missing-start'?m.key:valid.key,end=orientation==='missing-end'?m.key:valid.key,t=performance.now();
  await render({start,end,mode,showUI:true});await openDirections();assertNoWork();
  assert.equal(latest.diagnostic.kind,'missing-entrance');assert.equal(latest.diagnostic.reviewRoomKey,m.key);
  assert.equal(container.querySelector('[data-testid="project-route-calculating"]'),null);
  const text=container.querySelector('[data-testid="project-route-result"]')?.textContent??'';
  assert.match(text,/An entrance is unavailable/);assert.doesNotMatch(text,/Preparing|Calculating|review/i);
  rows.push({key:m.key,number:m.number,mode,orientation,diagnostic:latest.diagnostic.kind,preparing:false,calculating:false,workerRequests:0,uiText:text,elapsedMs:performance.now()-t});
}
assert.equal(rows.length,460);
const sameRows:any[]=[];
for(const mode of ['public','accessible'] as const)for(const record of records){
  await render({start:record.key,end:record.key,mode,showUI:false});assertNoWork();assert.equal(latest.diagnostic,undefined);
  sameRows.push({key:record.key,mode,preparing:false,calculating:false,workerRequests:0});
}
const sameUISamples=[];
for(const mode of ['public','accessible'] as const)for(const key of [valid.key,missing[0].key,...records.filter((r:any)=>/agora/i.test(r.name)).map((r:any)=>r.key)]){
  await render({start:key,end:key,mode,showUI:true});await openDirections();assertNoWork();
  const text=container.querySelector('[data-testid="project-route-same-place"]')?.textContent??'';assert.match(text,/same place/);assert.doesNotMatch(text,/Preparing|Calculating/);
  sameUISamples.push({key,mode,text});
}
const invalidCheckpoint={requests:observed.requests.length,workers:observed.workers.length,posts:observed.posts.length,physicalReads:physicalReads.length,scheduleStarts:[...observed.schedule],elapsedMs:performance.now()-started};
// Positive control: same exact production hook/client reaches transport for two
// actual, distinct source arrivals. The controlled transport stays pending.
rejectPhysicalRead=false;
await render({start:valid.key,end:another.key,mode:'public',showUI:true});await openDirections();
assert.equal(observed.requests.length,1);assert.equal(observed.workers.length,1);assert.equal(observed.posts.length,1);
assert.equal(latest.calculating,true);assert.equal(latest.preparing,true);assert(observed.schedule.includes('route'));
assert.match(container.querySelector('[data-testid="project-route-calculating"]')?.textContent??'',/Preparing directions/);
const positiveControl={start:valid.key,end:another.key,requests:observed.requests.length,workers:observed.workers.length,posts:observed.posts.length,preparing:latest.preparing,calculating:latest.calculating,workerComputesGeometry:false};
// A missing destination cancels the actual pending client request and removes
// preparation immediately; the old pending promise cannot resurrect its UI.
await render({start:valid.key,end:missing[0].key,mode:'public',showUI:true});
assert.equal(latest.calculating,false);assert.equal(latest.preparing,false);assert.equal(observed.terminations,1);assert.equal(observed.requests.length,1);
assert.match(container.querySelector('[data-testid="project-route-result"]')?.textContent??'',/entrance is unavailable/);
const cancelToMissing={requestsAfter:observed.requests.length,terminations:observed.terminations,preparing:false,calculating:false};
const releaseFloor=heavyWorkerSchedule.begin('floor');
await render({start:valid.key,end:another.key,mode:'accessible',showUI:false});
assert.equal(observed.requests.length,1);
await render({start:valid.key,end:missing[1].key,mode:'accessible',showUI:false});
releaseFloor();await act(async()=>{await Promise.resolve();});
assert.equal(observed.requests.length,1);assert.equal(latest.preparing,false);assert.equal(latest.calculating,false);
await act(async()=>root.unmount());
for(const name of ['circulationGeometry','walkingSupport','nativeMaterialSections','nativeMaterialSectionSupplement'])delete (data as any)[name];
assert.equal(JSON.stringify(data),originalData);
assert(Object.values(inputs).every((i:any)=>sha(fs.readFileSync(i.path))===i.sha256));
const report={authority:'Simulated-DOM React component/effect integration test under happy-dom21.0.3. Actual unchanged useProjectRoute, RouteWorkerClient, scheduler and ProjectNavigation render/effects are executed. Worker is a controlled transport observation boundary; global geometry/calculator is intentionally not run. This is not browser, mobile, hosted-deployment or end-to-end map-load proof.',
  baselineVisitorSha256:inventory.baselineVisitorSha256,baselineRoutingDatasetSha256:inventory.baselineRoutingDatasetSha256,
  fixtureProjection:{records:records.length,nodes:data.nodes.length,edges:data.edges.length,fullPhysicalGeometryLoaded:false,floorsAndNativeLevelDisplayMetadata:'omitted; empty lists provide only generic Floor display fallback'},
  sourceInputs:Object.fromEntries(Object.entries(inputs).map(([k,i]:any)=>[k,{path:i.path,sha256:i.sha256}])),
  missingEntranceCases:rows,sameIdentityCases:sameRows,sameIdentityUISamples:sameUISamples,
  invalidCheckpoint,positiveControl,cancelToMissing,queuedValidThenMissingDoesNotStartAfterFloorRelease:true,
  sourceRecordsGraphAndInputsUnchanged:true,sourcePolicyModified:false,elapsedMs:performance.now()-started};
fs.writeFileSync(dir+'actual-hook-and-ui-results.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({missingEntranceCases:rows.length,sameIdentityCases:sameRows.length,sameIdentityUISamples:sameUISamples.length,invalidCheckpoint,positiveControl,cancelToMissing,elapsedMs:report.elapsedMs}));
