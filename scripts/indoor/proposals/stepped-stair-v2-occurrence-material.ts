/** Exact occurrence lookup only. These plain operands cannot mint original
 * source authority; the caller's issued source factories supply refinements.
 * A certificate never replaces every occurrence sharing one native owner ID. */
import type {SteppedMaterialCell} from "./stepped-stair-v2-kernel.ts";
export type OriginalOccurrenceMaterialRow={nativeElementId:number;sourceFrameSha256:string;categoryId?:number|null};
export type OriginalOccurrenceMaterialRefinement={nativeElementId:number;sourceFrameSha256:string;
  sourceModelSha256:string;sourceSchemaSha256:string;sourceCensusSha256?:string;originalCategoryId?:number;
  cells:SteppedMaterialCell[]};
export const exactOccurrenceMaterialKey=(owner:number,frame:string)=>`${owner}:${frame}`;
export function indexExactOccurrenceMaterialRefinements(
  rows:readonly OriginalOccurrenceMaterialRow[],refinements:readonly OriginalOccurrenceMaterialRefinement[],
  source:{sourceModelSha256:string;sourceSchemaSha256:string;sourceCensusSha256:string},
){
  const result=new Map<string,OriginalOccurrenceMaterialRefinement>(),seenCells=new Set<string>();
  for(const refinement of refinements){
    const key=exactOccurrenceMaterialKey(refinement.nativeElementId,refinement.sourceFrameSha256);
    if(refinement.sourceModelSha256!==source.sourceModelSha256||refinement.sourceSchemaSha256!==source.sourceSchemaSha256||
      refinement.sourceCensusSha256!==undefined&&refinement.sourceCensusSha256!==source.sourceCensusSha256||result.has(key))
      throw Error("Original material refinement source/census/occurrence differs or is duplicated");
    const matches=rows.filter(row=>exactOccurrenceMaterialKey(row.nativeElementId,row.sourceFrameSha256)===key);
    if(matches.length!==1||refinement.originalCategoryId!==undefined&&matches[0]!.categoryId!==refinement.originalCategoryId)
      throw Error("Original material refinement lacks its unique exact source occurrence/category");
    if(!refinement.cells.length||refinement.cells.some(cell=>cell.nativeOwnerId!==refinement.nativeElementId||seenCells.has(cell.id)))
      throw Error("Original material refinement is empty, borrowed or repeats a material cell");
    for(const cell of refinement.cells){if(seenCells.has(cell.id))throw Error("Duplicated original material cell");seenCells.add(cell.id);}
    result.set(key,refinement);
  }
  return result;
}
