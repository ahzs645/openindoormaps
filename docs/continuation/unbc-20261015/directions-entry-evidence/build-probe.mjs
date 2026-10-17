import {build} from '/workspace/openindoormaps/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';import {createHash} from 'node:crypto';
const dir='/workspace/scratch/unbc-pathway-repair-20261015/route-entry-component-qa/';
const out=await build({absWorkingDir:'/workspace/openindoormaps',entryPoints:[dir+'probe.tsx'],bundle:true,platform:'node',format:'esm',target:'node22',nodePaths:['/workspace/openindoormaps/node_modules'],mainFields:['module','main'],outfile:dir+'probe.bundle.mjs',metafile:true,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},banner:{js:'import {createRequire as __createRequire} from "node:module"; const require=__createRequire(import.meta.url);'},tsconfig:'/workspace/openindoormaps/tsconfig.json'});
const inputs=Object.entries(out.metafile.inputs).map(([path,meta])=>{const full=path.startsWith('/')?path:'/workspace/openindoormaps/'+path;return{path:full,bytes:meta.bytes,sha256:createHash('sha256').update(fs.readFileSync(full)).digest('hex')};});
fs.writeFileSync(dir+'simulated-dom-source-closure-before.json',JSON.stringify({inputs},null,2));
console.log(JSON.stringify({bundleBytes:fs.statSync(dir+'probe.bundle.mjs').size,sourceInputs:inputs.length}));
