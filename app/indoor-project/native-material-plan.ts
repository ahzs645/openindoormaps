import type {IndoorDataset} from './contract';
import {createNativeMaterialSectionIndex} from './native-material-sections';
/** Analytical masks only. Original prepared wall/jamb evidence stays byte-for-byte
 * in data.walls so historical door and continuation checks retain their binding. */
export function nativeMaterialPlanWalls(data:IndoorDataset, levelId:number) {
  const original=data.walls.filter(w=>w.levelId===levelId);
  const level=data.nativeLevels.find(l=>l.id===levelId);
  if(!level || !data.nativeMaterialSections) return original;
  const rows=createNativeMaterialSectionIndex(data.nativeMaterialSections,data.source.modelSha256).at(level.elevationFeet,level.elevationFeet+4,levelId);
  const corrected=new Set([
    ...(data.nativeWallPositionRepairs?.walls??[]).filter(w=>w.levelId===levelId).map(w=>w.nativeElementId),
    ...(data.reviewedDoorApertures?.patches??[]).filter(p=>p.levelId===levelId).flatMap(p=>p.wallEvidence.map(w=>w.nativeElementId)),
  ]);
  const replaced=new Set(rows.flatMap(r=>r.sourceElementIds).filter(id=>!corrected.has(id)));
  const recovered:IndoorDataset['walls']=rows.flatMap(row=>row.sections.filter(s=>!corrected.has(s.nativeElementId)).flatMap(s=>s.partsFeet.map(ringsFeet=>({
    levelId,nativeElementId:s.nativeElementId,kind:s.kind==='column'?'column' as const:'wall' as const,
    geometrySource:'original-native-material-section',ringsFeet,
  }))));
  return [...original.filter(w=>w.reviewPatchId||!replaced.has(w.nativeElementId)),...recovered];
}
