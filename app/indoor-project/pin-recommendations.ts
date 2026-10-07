import type { IndoorDataset } from "./contract";
import type { IndoorProject } from "./package";
import { reviewFileBytes } from "./review-bundle";
import { saveReviewCompanion } from "./review-companion-save";
export type PinRecommendation = { id: string; pinId: string; title: string; recommendation: string; question: string; evidencePaths: string[]; patchIds: string[] };
export type PinRecommendationFile = { format: "openindoormaps-pin-recommendations"; version: 1; sourceModelSha256: string; roomsSha256: string; geometrySha256: string; entries: PinRecommendation[] };
export type PinDecision = { recommendationId: string; evidenceSha256: string; decision: "accept" | "reject" | "more-evidence"; notes: string; geometrySha256: string; roomsSha256: string; reviewedAt: string };
export type PinDecisions = { format: "openindoormaps-pin-decisions"; version: 1; sourceModelSha256: string; roomsSha256: string; decisions: PinDecision[] };
export function pinRecommendations(project: IndoorProject, geometrySha256?: string) {
  const entries: { recommendation: PinRecommendation; evidenceSha256: string; current: boolean }[] = [];
  for (const file of project.rooms.reviewBundle?.files ?? []) {
    if (!file.path.endsWith('pin-recommendations.json')) continue;
    let value: PinRecommendationFile;
    try { value = JSON.parse(new TextDecoder().decode(reviewFileBytes(file))); } catch { continue; }
    if (value.format !== 'openindoormaps-pin-recommendations' || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 5000) continue;
    for (const r of value.entries) {
      if (!r || typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.recommendation !== 'string' || typeof r.question !== 'string' || !Array.isArray(r.patchIds) || !r.patchIds.every(p => typeof p === 'string') || !Array.isArray(r.evidencePaths) || !r.evidencePaths.every(p => typeof p === 'string')) continue;
      if (!project.rooms.reviewPins?.pins.some(p => p.id === r.pinId)) continue;
      if (entries.some(e => e.recommendation.id === r.id)) continue;
      entries.push({ recommendation: r, evidenceSha256: file.sha256, current: value.sourceModelSha256 === project.dataset.source.modelSha256 && value.geometrySha256 === geometrySha256 && !!geometrySha256 });
    }
  }
  return entries;
}
export function readPinDecisions(project: IndoorProject): PinDecisions {
  const file = project.rooms.reviewBundle?.files.find(f => f.path === 'pin-review/decisions.json');
  if (file) {
    const value = JSON.parse(new TextDecoder().decode(reviewFileBytes(file))) as PinDecisions;
    if (value.format === 'openindoormaps-pin-decisions' && value.version === 1 && value.sourceModelSha256 === project.dataset.source.modelSha256 && Array.isArray(value.decisions)) return value;
  }
  return { format: 'openindoormaps-pin-decisions', version: 1, sourceModelSha256: project.dataset.source.modelSha256, roomsSha256: project.dataset.source.roomsSha256, decisions: [] };
}
export async function savePinDecision(project: IndoorProject, id: string, decision: PinDecision['decision'], notes: string, verifiedGeometrySha256?: string) {
  const geometrySha256 = verifiedGeometrySha256 ?? await pinRecommendationGeometryHash(project.dataset);
  const entry = pinRecommendations(project, geometrySha256).find(e => e.recommendation.id === id);
  if (!entry?.current) throw new Error('Recommendation belongs to older geometry. Update its evidence before deciding.');
  if (!['accept','reject','more-evidence'].includes(decision) || !notes.trim() || notes.length > 4000) throw new Error('Choose a decision and add a note (up to 4000 characters).');
  const old = readPinDecisions(project);
  return saveReviewCompanion(project, 'pin-review/decisions.json', { ...old, roomsSha256: project.dataset.source.roomsSha256, decisions: [...old.decisions.filter(d => d.recommendationId !== id), { recommendationId: id, evidenceSha256: entry.evidenceSha256, decision, notes: notes.trim(), geometrySha256, roomsSha256: project.dataset.source.roomsSha256, reviewedAt: new Date().toISOString() }] });
}

/** Archive room checksums include authoring notes/companions and change on export.
 * Bind decisions to actual dataset evidence instead, excluding that byte checksum
 * and the publication binding derived from it. Mapping polygons, identities and
 * their own checksum remain evidence and must still invalidate decisions. */
export async function pinRecommendationGeometryHash(data: IndoorDataset) {
  const value = JSON.stringify({ ...data, source: { ...data.source, roomsSha256: undefined }, nativeExploreMapping: data.nativeExploreMapping ? { ...data.nativeExploreMapping, datasetGeometrySha256: undefined } : undefined });
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, "0")).join("");
}
