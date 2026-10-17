import fs from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {routeWorkerDataset} from '../../app/indoor-project/route-worker-dataset';
/** Lossless compiler-input transformation only. This grants no import, routing
 * or publication trust. Both original importers and all fresh output guards
 * remain mandatory. Usage: INPUT.zip OUTPUT.zip RECEIPT.json EXPECTED_INPUT_SHA256 */
const args=process.argv.slice(2);
if(args.length!==4 || !/^[a-f0-9]{64}$/.test(args[3]!))
 throw Error('Usage: node --import tsx scripts/indoor/prepare-source-rebuild-input.ts INPUT.zip OUTPUT.zip RECEIPT.json EXPECTED_INPUT_SHA256');
const input=resolve(args[0]!),output=resolve(args[1]!),receiptFile=resolve(args[2]!);
const expectedSha=args[3]!;
assert.equal(new Set([input,output,receiptFile]).size,3,'Input, output and receipt must be different paths');
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const bytes=new Uint8Array(await fs.readFile(input));
assert.equal(sha(bytes),expectedSha,'Original input archive differs from the requested immutable source');
const files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
assert.equal(manifest.format,'reviter-project');
assert.equal(manifest.version,2);
assert.equal(manifest.indoor.path,'viewer/indoor.json');
const originalIndoor=files['viewer/indoor.json'];
assert.equal(sha(originalIndoor),manifest.indoor.sha256);
const data=JSON.parse(strFromU8(originalIndoor));
assert.ok(data.nativeExploreMapping,'Expected an existing derived display mapping');
const mapping=data.nativeExploreMapping;
const routingBefore=sha(JSON.stringify(routeWorkerDataset(data)));
delete data.nativeExploreMapping;
const indoor=strToU8(JSON.stringify(data));
assert.deepEqual(JSON.parse(strFromU8(indoor)),data);
const routingAfter=sha(JSON.stringify(routeWorkerDataset(data)));
assert.equal(routingAfter,routingBefore,'Navigation projection must remain exactly unchanged');
const retained=[];
for (const [path,payload] of Object.entries(files)) {
 if(path==='viewer/indoor.json'||path==='manifest.json')continue;
 retained.push({path,bytes:payload.length,sha256:sha(payload)});
}
files['viewer/indoor.json']=indoor;
manifest.indoor={...manifest.indoor,bytes:indoor.length,sha256:sha(indoor)};
files['manifest.json']=strToU8(JSON.stringify(manifest));
const packed=zipSync(files,{level:6});
const replay=unzipSync(packed);
for(const entry of retained)assert.equal(sha(replay[entry.path]),entry.sha256,'Preserved source asset '+entry.path);
assert.deepEqual(JSON.parse(strFromU8(replay['viewer/indoor.json'])),data);
assert.equal(sha(new Uint8Array(await fs.readFile(input))),expectedSha,'Original source changed during transformation');
await fs.mkdir(dirname(output),{recursive:true});
await fs.mkdir(dirname(receiptFile),{recursive:true});
await fs.writeFile(output,packed,{flag:'wx'});
const receipt={
 authority:'Source rebuild input only. Both original importers and all physical/route guards remain mandatory; no visitor cache trust is granted.',
 input:{path:input,sha256:sha(bytes),bytes:bytes.length},
 output:{path:output,sha256:sha(packed),bytes:packed.length},
 removedDerivedField:'viewer/indoor.json:nativeExploreMapping',
 removedMappingSha256:sha(JSON.stringify(mapping)),
 originalIndoorSha256:sha(originalIndoor),rebuiltIndoorSha256:sha(indoor),
 routingProjectionBefore:routingBefore,routingProjectionAfter:routingAfter,
 allOtherParsedDatasetFieldsUnchanged:true,allSourceAssetsByteIdentical:true,
 retainedAssets:retained,canonicalReplaced:false,freshOutputMappingValidationRequired:true,
};
await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt,null,2));
