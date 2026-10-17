// Read the ZIP member as a stream. No project importer or complete dataset object.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const Parser=require('/workspace/openindoormaps/node_modules/jsonparse');
const zip='/workspace/scratch/unbc-download-outdoor-20261016/UNBC.campus-viewer.zip';
const out=new URL('./targeted-viewer-evidence.json',import.meta.url);
const selected=new Set([1842431,1460777,1821194,1523099,1844188,1728649,1727059,1801478,1779473]);
function command(args){return new Promise((resolve,reject)=>{const p=spawn('/usr/bin/unzip',args,{stdio:['ignore','pipe','pipe']});const chunks=[];let err='';p.stdout.on('data',b=>chunks.push(b));p.stderr.on('data',b=>{err+=b;if(err.length>4096)p.kill()});p.on('error',reject);p.on('close',c=>c===0?resolve(Buffer.concat(chunks)):reject(new Error(`unzip ${c}: ${err}`)));});}
const manifest=JSON.parse(await command(['-p',zip,'manifest.json']));
const result={version:1,method:'streamed ZIP member / selected records only / no package importer',manifest,source:null,topLevelFields:[],counts:{},sourceContexts:[],selectedSourceFlights:[],selectedDisplayFlights:[],selectedGraphEdges:[],verticalEdges:[],selectedNodes:[],selectedRecords:[],samples:{}};
const rootArrays=new Set(['nodes','edges','records','nativeLevels','physicalLevels']);
const sourceKinds=new Set(['stairs','local-steps','ramp','elevator','lift']);
const hasId=v=>{if(!v||typeof v!=='object')return false;return selected.has(v.nativeElementId)||selected.has(v.stairElementId)||[...selected].some(id=>Object.values(v).some(x=>typeof x==='string'&&new RegExp(`(^|:)${id}(:|$)`).test(x)));};
const p=new Parser();
p.onError=e=>{throw e};
p.onValue=function(v){
  if(this.stack.length===0)return;
  const path=this.stack.slice(1).map(s=>s.key).concat(this.key);
  if(path.length===1){result.topLevelFields.push(path[0]);if(path[0]==='source')result.source=v;delete this.value[this.key];return;}
  const root=path[0];
  if(root==='source')return;
  if(root==='stairDisplay'){
    if(path.length===3&&Number.isInteger(path[2])){
      const kind=path[1];result.counts[kind]=(result.counts[kind]??0)+1;
      if(kind==='sourceFlights'&&v.context!==undefined)result.sourceContexts.push({stairElementId:v.stairElementId,context:v.context});
      if(selected.has(v.stairElementId)){
        if(kind==='sourceFlights')result.selectedSourceFlights.push(v);
        if(kind==='flights')result.selectedDisplayFlights.push(v);
      }
      delete this.value[this.key];
    } else if(path.length===2&&path[1]!=='sourceFlights'&&path[1]!=='flights') result.counts[`stairDisplay.${path[1]}`]=typeof v==='object'?'present':v;
    return;
  }
  if(rootArrays.has(root)){
    if(path.length===2&&Number.isInteger(path[1])){
      result.counts[root]=(result.counts[root]??0)+1;
      if(!result.samples[root])result.samples[root]=v;
      if(root==='edges'){
        if(sourceKinds.has(v.kind))result.verticalEdges.push(v);
        if(hasId(v))result.selectedGraphEdges.push(v);
      } else if(root==='nodes'&&hasId(v))result.selectedNodes.push(v);
      else if(root==='records'&&hasId(v))result.selectedRecords.push(v);
      delete this.value[this.key];
    }
    return;
  }
  // Free unneeded nested values promptly, rather than hydrate large source indices.
  if(path.length<=3&&this.value)delete this.value[this.key];
};
const child=spawn('/usr/bin/unzip',['-p',zip,manifest.indoor.path],{stdio:['ignore','pipe','pipe']});
const hash=createHash('sha256');let bytes=0,stderr='';
child.stderr.on('data',b=>{stderr+=b;if(stderr.length>4096)child.kill()});
const completion=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`unzip ${code}: ${stderr}`)));});
for await(const chunk of child.stdout){hash.update(chunk);bytes+=chunk.length;p.write(chunk);}
await completion;
assert.equal(bytes,manifest.indoor.bytes);assert.equal(hash.digest('hex'),manifest.indoor.sha256);
assert.equal(result.source.modelSha256,manifest.model.sha256);
result.zip={path:zip,sha256:createHash('sha256').update(await readFile(zip)).digest('hex')};
result.indoorEntry={...manifest.indoor,verified:true};
result.parser={path:require.resolve('/workspace/openindoormaps/node_modules/jsonparse'),sha256:createHash('sha256').update(await readFile(require.resolve('/workspace/openindoormaps/node_modules/jsonparse'))).digest('hex')};
result.runtime={node:process.version,resourceUsage:process.resourceUsage()};
await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({counts:result.counts,sourceContexts:result.sourceContexts,selectedSourceFlights:result.selectedSourceFlights.length,selectedGraphEdges:result.selectedGraphEdges.length,verticalEdges:result.verticalEdges.length,out:out.pathname}));
