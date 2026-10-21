import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deserialize } from 'node:v8';
import { createOriginalNativeStairPhysicalContext } from '../../../../../../../reviter/lib/reviter/native-source-stair-physical-inventory.ts';
import { certifyOriginalNativePlacedStairEnvelope, auditOriginalPlacedStairAboveFoot, auditOriginalPlacedStairAgainstWalkingLine, originalNativePlacedStairMaterialEnvelope } from '../../../../../../../reviter/lib/reviter/native-source-stair-placed-envelope.ts';
import { originalTwoFootStandingSquare } from '../../../../../../../reviter/lib/reviter/native-source-standing-footprint.ts';
import { rational, Rational } from '../../../../../../../reviter/lib/reviter/native-rational-overlay.ts';

const [rvtPath, preparedPath, outputPath] = process.argv.slice(2);
assert(rvtPath && preparedPath && outputPath, 'Usage: RVT PREPARED.bin NEW_OUTPUT.json');
const bytes = new Uint8Array(await readFile(rvtPath)), preparedBytes = await readFile(preparedPath);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const sourceSha = '8c294549ee667ed7aba38f1f4f3a53514dae7544af97f0157ee8187dd8702178';
assert.equal(sha(bytes), sourceSha);
assert.equal(sha(preparedBytes), 'fd37be0d0a5a40b4772cdd5693106be0b3b1a85b0ea7eae2441543eb2db2e878');
const requests = [{nativeStairId:1638837,nativeRunId:1638854,nativeDefinitionId:1638855,key:'rm-694-0bed6b73a3bd'},{nativeStairId:2354630,nativeRunId:2354663,nativeDefinitionId:2354664,key:'rm-694-504b25e5319a'}];
console.log('actual-original-context-start');
const context = createOriginalNativeStairPhysicalContext(bytes, sourceSha, requests);
console.log('actual-original-context-ready');
const prepared = deserialize(preparedBytes), rows = [];
for (const req of requests) {
 const envelope = certifyOriginalNativePlacedStairEnvelope(context, req.nativeRunId);
 assert(envelope.ok);
 assert.deepEqual(envelope.summary.sourceMaterialLocalizationBlockers, []);
 const seed = prepared.nodes.find(n => n.id === `arrival:${req.key}`).pointFeet;
 const footprint = originalTwoFootStandingSquare([rational(seed[0]), rational(seed[1])]);
 const audit = auditOriginalPlacedStairAboveFoot(envelope.certificate, footprint, rational(seed[2]), rational(6));
 assert.notEqual(audit.localizedComponentContacts, undefined);
 assert.equal(audit.completeHumanHeadroomApproved, false);
 assert.equal(audit.routeApproved, false);
 assert.throws(() => auditOriginalPlacedStairAboveFoot({...envelope.certificate}, footprint, rational(seed[2]), rational(6)), /Untrusted/);
 const high = auditOriginalPlacedStairAboveFoot(envelope.certificate, footprint, rational(100), rational(6));
 assert.deepEqual(high.localizedComponentContacts, []);
 assert.deepEqual(high.componentContacts, []);
 const material = originalNativePlacedStairMaterialEnvelope(envelope.certificate);
 const contactDetails = audit.localizedComponentContacts.map(contact => ({...contact, cells: material.localizedCells.filter(c => c.sourceComponentIndex === contact.sourceComponentIndex && c.role === contact.role && c.originalFaceTokens.join(',') === contact.originalFaceTokens.join(',')).map(c=>({minimumElevationFeet:c.minimumElevationFeet,maximumElevationFeet:c.maximumElevationFeet,partsFeet:c.partsFeet,closedSegmentsFeet:c.closedSegmentsFeet}))}));
 const portal = prepared.nodes.find(n => n.roomKey === req.key && n.kind === 'portal');
 const row = { ...req, originalSeedFeet: seed, unchangedDemand:{widthFeet:2,headroomFeet:6,footprintFeet:footprint}, originalSourceSummary:envelope.summary, standingAudit:audit, contactDetails, portalToOriginalSeed:portal ? {originalPortalId:portal.id,originalPortalFeet:portal.pointFeet,audit:auditOriginalPlacedStairAgainstWalkingLine(envelope.certificate,[portal.pointFeet,seed],6)} : undefined, controls:{clonedCapabilityRefused:true,highEmptySpaceClears:true}, completeForeignCensusPerformed:false, routeApproved:false };
 rows.push(row);
 console.log('actual-original-run-done',req.nativeRunId,'localized standing contacts',contactDetails.length);
}
assert.throws(() => createOriginalNativeStairPhysicalContext(bytes, '0'.repeat(64), requests), /checksum mismatch/);
const exact = (value: unknown): unknown => value instanceof Rational
 ? {numerator:value.n.toString(),denominator:value.d.toString()}
 : typeof value === 'bigint' ? value.toString()
 : Array.isArray(value) ? value.map(exact)
 : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v])=>[k,exact(v)]))
 : value;
await writeFile(outputPath,JSON.stringify(exact({sourceModelSha256:sourceSha,preparedSha256:sha(preparedBytes),context,rows,staleModelHashRefused:true,sourceCorrectionCommitted:false,routeApproved:false}),null,2)+'\n',{flag:'wx'});
