import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {applyReviewedStairContexts} from './reviewed-stair-contexts.mjs';
const evidence=JSON.parse(await readFile(new URL('./targeted-viewer-evidence.json',import.meta.url),'utf8'));
const review=JSON.parse(await readFile(new URL('./reviewed-stair-contexts.authoring-proposal.json',import.meta.url),'utf8'));
const before={version:1,generator:'reviter/native-stair-display-1',sourceModelSha256:evidence.source.modelSha256,sourceFlights:evidence.selectedSourceFlights,flights:evidence.selectedDisplayFlights};
const after=applyReviewedStairContexts(before,review);
assert.equal(before.sourceFlights.length,9);
assert.equal(before.flights.length,0);
assert.deepEqual(after.sourceFlights.filter(f=>f.context!==undefined).map(f=>({stairElementId:f.stairElementId,context:f.context})).sort((a,b)=>a.stairElementId-b.stairElementId),review.entries.map(({stairElementId,context})=>({stairElementId,context})).sort((a,b)=>a.stairElementId-b.stairElementId));
for(let i=0;i<before.sourceFlights.length;i++){const{context,...geometry}=after.sourceFlights[i];assert.deepEqual(geometry,before.sourceFlights[i]);for(const key of ['treads','runs','landings','supportFaces'])assert.strictEqual(after.sourceFlights[i][key],before.sourceFlights[i][key]);}
assert.strictEqual(before.flights,after.flights);
assert.deepEqual(applyReviewedStairContexts(after,review),after);
for(const changedId of [1842431,1460777,1801478,1779473]){
 const changed=structuredClone(before),f=changed.sourceFlights.find(f=>f.stairElementId===changedId);
 f.runs[0].runElementId++;for(const t of f.treads)t.runElementId++;
 assert.throws(()=>applyReviewedStairContexts(changed,review));
}
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const receipt={version:1,scope:'selected nine published source flights only; isolated metadata application',inputIndoorSha256:evidence.indoorEntry.sha256,inputModelSha256:evidence.source.modelSha256,sourceFlightCountInPublishedDataset:evidence.counts.sourceFlights,selectedFlightCount:9,changedContexts:review.entries.map(({stairElementId,context})=>({stairElementId,context})),selectedGeometryPreserved:true,selectedRoomDisplayFlightsPreserved:true,unreviewedFiveUnclassified:true,graphWasNotAnInputToTheHelper:true,currentPreparationFingerprintUnchangedClaimed:false,nativeSourceClearanceCertified:false,routesEnabled:false,sourceAuthoringOrCompiledDatasetModified:false,originalSelectedFlightsJsonSha256:sha(before.sourceFlights),originalGeometryJsonSha256:sha(after.sourceFlights.map(({context,...f})=>f)),changedRunOwnerNegatives:4};
assert.equal(receipt.originalSelectedFlightsJsonSha256,receipt.originalGeometryJsonSha256);
await writeFile(new URL('./actual-retention-parity.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt));
