import type {IndoorDataset,IndoorEdge} from './contract';
import {certifyNativeRampCrossfall} from './native-ramp-crossfall';
import {routingCalculationValue} from './routing-cache';
/** A saved certificate is evidence to recheck, not permission to ignore native
 * geometry. Each immutable calculation independently recovers its profiles. */
export function validatedNativeRampSurface(data:IndoorDataset,edge:IndoorEdge):boolean {
 return routingCalculationValue(data,`native-ramp-surface:${edge.id}`,()=>{
  const proof=edge.nativeRampSurface;
  if(!proof)return !(data.nativeIndoorEnvelopes&&edge.kind==='ramp');
  if(edge.kind!=='ramp'||proof.version!==1||proof.sourceModelSha256!==data.source.modelSha256||proof.nativeRampId!==edge.nativeElementId||!Number.isSafeInteger(proof.nativeRampId)||proof.nativeRampId<=0||!Array.isArray(proof.nativeFloorElementIds)||!proof.nativeFloorElementIds.length||proof.nativeFloorElementIds.length>100||proof.nativeFloorElementIds.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(proof.nativeFloorElementIds).size!==proof.nativeFloorElementIds.length||JSON.stringify(proof.pointsFeet)!==JSON.stringify(edge.pointsFeet))return false;
  const support=data.walkingSupport,display=data.rampDisplay;
  if(support?.sourceModelSha256!==data.source.modelSha256||display?.sourceModelSha256!==data.source.modelSha256)return false;
  const ramp=display.ramps.find(r=>r.edgeId===edge.id&&r.nativeElementId===proof.nativeRampId&&!r.displayOnly);
  if(!ramp||!ramp.trianglesFeet.length||!proof.widthCertificate||proof.widthCertificate.version!==1||proof.widthCertificate.halfWidthFeet!==.5||!Array.isArray(proof.widthCertificate.tracks)||proof.widthCertificate.tracks.length>3*(edge.pointsFeet.length-1))return false;
  const floors=proof.nativeFloorElementIds.flatMap(id=>support.floors.filter(f=>f.nativeElementId===id));
  if(proof.nativeFloorElementIds.some(id=>!floors.some(f=>f.nativeElementId===id)))return false;
  try {
   const original=floors.map(f=>({elementId:f.nativeElementId,categoryId:-2000032,boundsFeet:{max:{z:f.elevationFeet}},loops:f.ringsFeet.map(r=>r.map(p=>[p[0],p[1],f.elevationFeet] as [number,number,number]))}));
   const certificate=certifyNativeRampCrossfall(ramp.trianglesFeet,original,edge.pointsFeet);
   return !!certificate&&JSON.stringify(certificate)===JSON.stringify(proof.widthCertificate);
  } catch {return false;}
 });
}
