import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.env.REVITER_ROOT??process.cwd()),folder=dirname(fileURLToPath(import.meta.url)),output=resolve(process.argv[2]??join(folder,'typed-source'));
assert(!existsSync(output),'Use a new immutable extraction directory');mkdirSync(output,{recursive:true});
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),load=(n:string)=>import(pathToFileURL(join(root,'lib/reviter',n)).href);
const {openRevitContainer}=await load('convert-container.ts'),chunks=await load('revit-container.ts'),{createSplitFrameStream}=await load('split-frame-stream.ts'),{readSchema}=await load('schema-reader.ts'),{readNativeStairTypedFifo}=await load('native-stair-typed-fifo.ts');
const previous=JSON.parse(readFileSync(join(folder,'diagnosis.json'),'utf8')),wanted=new Map(previous.rows.map(r=>[r.nativeRunId,r])),bytes=readFileSync(process.env.UNBC_ORIGINAL_RVT??resolve(root,'../scratch/native-source-restored/derived/UNBC.original.rvt'));
assert.equal(hash(bytes),previous.sourceModelSha256);const started=Date.now(),opened=openRevitContainer(bytes,{});assert(opened.nativeSourceSchemaBytes);assert.equal(hash(opened.nativeSourceSchemaBytes),previous.sourceSchemaSha256);writeFileSync(join(output,'original-schema.bin'),opened.nativeSourceSchemaBytes,{flag:'wx'});
const parsed=readSchema(opened.nativeSourceSchemaBytes);assert(parsed.ok);const frames=new Map();let pages=0;
for(const partition of opened.partitions){const stream=createSplitFrameStream({markers:[4102],minObjectLength:40,maxFrameBytes:16*1024*1024,acceptHeader:(view,offset)=>wanted.has(view.getUint32(offset,true))}),data=chunks.stripRevitPageChecksums(chunks.asBytes(partition.entry.content)),offsets=chunks.gzipOffsets(data,10001);let window=null;
 for(let i=0;i<offsets.length;i++){const page=chunks.inflateRevitChunk(data,offsets[i],offsets[i+1],window);assert(page);window=chunks.revitWindowTail(page);pages++;for(const frame of stream.push(page)){assert(!frames.has(frame.elementId));frames.set(frame.elementId,Uint8Array.from(frame.data));}}
}
assert.equal(pages,3666);assert.equal(frames.size,17);
const resolveEntry=(run:any,d:any)=>{if(!d)return null;const a=run.entries.filter(e=>d.token>0?e.descriptor.token===d.token:e.descriptor.start===d.start&&e.descriptor.end===d.end&&e.descriptor.path===d.path);assert.equal(a.length,1);return a[0]};
for(const [id,frame] of frames)writeFileSync(join(output,`${id}.4102.bin`),frame,{flag:'wx'});
const rows=[];
for(const [id,frame] of frames){const old:any=wanted.get(id);assert.equal(hash(frame),old.sourceFrameSha256s[`${id}:4102`]);const name=`${id}.4102.bin`;const typed=readNativeStairTypedFifo(frame,parsed.schema);assert(typed.ok);const run=typed.value;
 const related=run.entries.filter(e=>!['GLine','GArc','CurveLoop','StairsTreadInfo','Face','Edge','EdgeLoop','Geometry','Plane'].includes(e.sourceClassName));
 const info={nativeRunId:id,frameSha256:hash(frame),frameBytes:frame.length,frameFile:name,rootFields:run.rootFields,root:run.root,allRelatedEntries:related,runInfoEntries:(run.root.m_stairsRunInfoArr??[]).map(d=>resolveEntry(run,d)),completeOriginalTypedRootAndFifoByteReplay:run.completeOriginalTypedRootAndFifoByteReplay};
 rows.push(info);
}
const classes=parsed.schema.classes.filter(c=>/IntStairInfo|StairsRunInfo|StairsTreadInfo|Riser|StairsRunAndLanding|StairsRun$/.test(c.name));
const report={format:'original-named-mode-typed-frame-extraction-v1',sourceModelSha256:previous.sourceModelSha256,sourceSchemaSha256:previous.sourceSchemaSha256,completePages:pages,expectedFrames:17,extractedFrames:frames.size,allFramesMatchFreshOpaqueContext:true,elapsedMs:Date.now()-started,schemaClasses:classes,rows,sourceAuthorityGranted:false,routeApproved:false};
const encoded=JSON.stringify(report,(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n';
writeFileSync(join(output,'run-info.full.json.gz'),gzipSync(encoded),{flag:'wx'});
const keep=new Set(['StairsRunInfo','StairsRunAndLandingPatternHelper','MultistoryStairsMembership','StairsStraightRunCell','StairsSketchedRunCell','StairsElementMembership']);
for(const row of rows){row.allRelatedEntries=row.allRelatedEntries.filter(e=>keep.has(e.sourceClassName));}
writeFileSync(join(output,'run-info.json'),JSON.stringify({...report,completeRelatedReplayArchivedIn:'run-info.full.json.gz'},(_,x)=>typeof x==='bigint'?x.toString():x,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({complete:true,pages,frames:frames.size,elapsedMs:Date.now()-started}));
