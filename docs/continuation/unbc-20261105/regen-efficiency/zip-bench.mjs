// node zip-bench.mjs path/to/compiled-dataset.json (run from the openindoormaps root so fflate resolves)
import {zipSync,strToU8} from 'fflate';
import {readFileSync} from 'node:fs';import {deflateRawSync,constants} from 'node:zlib';
const fd=readFileSync(process.argv[2]);const slice=fd.subarray(0,40*1024*1024);
for(const level of [1,6]){const t=performance.now();const z=zipSync({'a.json':[slice,{level}]});console.log('fflate level',level,Math.round(performance.now()-t),'ms',z.length);}
for(const level of [1,6]){const t=performance.now();const z=deflateRawSync(slice,{level});console.log('zlib level',level,Math.round(performance.now()-t),'ms',z.length);}
