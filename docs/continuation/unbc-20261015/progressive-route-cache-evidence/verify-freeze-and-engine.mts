import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {preparedDisplayEngineBinding} from '/workspace/openindoormaps/scripts/indoor/prepared-display-engine-binding.ts';
const directory='/workspace/scratch/unbc-pathway-repair-20261015/progressive-route-cache-qa/';
const manifest='/workspace/scratch/unbc-pathway-repair-20261015/regeneration-source-v3-r1-before.json';
const sha=(path:string)=>createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const freeze=JSON.parse(fs.readFileSync(manifest,'utf8'));
const binding=preparedDisplayEngineBinding('/workspace/openindoormaps');
const targets=['app/indoor-project/progressive-route-preparation.ts','app/indoor-project/progressive-route.worker.ts','tests/unit/progressive-route-preparation.test.ts'];
const changes=Object.entries(freeze.files).filter(([path,hash])=>sha(path)!==hash);
if(changes.length)throw Error(JSON.stringify(changes));
const rows=targets.map(path=>({path:'/workspace/openindoormaps/'+path,sha256:sha('/workspace/openindoormaps/'+path),inMainFreeze:Object.hasOwn(freeze.files,'/workspace/openindoormaps/'+path),inPreparationEngineClosure:binding.modules.some(([name])=>name===path)}));
if(rows.some(r=>r.inMainFreeze||r.inPreparationEngineClosure))throw Error('Edited source entered frozen graph');
const result={mainFreezeManifest:manifest,mainFreezeManifestSha256:sha(manifest),files:freeze.files,frozenFileChanges:changes,officialPreparationEngine:binding,editedFilesOutsideFreeze:rows};
const phase=process.argv[2]??'before';
if(phase==='after'){
 const before=JSON.parse(fs.readFileSync(directory+'freeze-and-engine-before.json','utf8'));
 if(JSON.stringify(before.files)!==JSON.stringify(result.files)||JSON.stringify(before.officialPreparationEngine)!==JSON.stringify(result.officialPreparationEngine))throw Error('Engine/module graph changed');
}
fs.writeFileSync(directory+'freeze-and-engine-'+phase+'.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({frozenFiles:Object.keys(freeze.files).length,changed:changes.length,engine:binding.sha256,engineModules:binding.modules.length,excluded:rows}));
