/** Unimported actual-source Library replay. Called inside the retained original
 * RVT context so all narrow certificates share exactly one census capability.
 * Saved station coordinates are a PROPOSAL; every source cap/riser/whole body
 * predicate is reconstructed through the actual issued original source handles.
 */
import fs from "node:fs/promises";
import {createHash} from "node:crypto";
import {extractOriginalSteppedStairV2Candidate,type SteppedSourceRouteProposal} from "./stepped-stair-v2-source-adapter.ts";
import {inspectOriginalSteppedStairGraphDemand,type OriginalSteppedStairGraphDemand} from "./original-stepped-stair-graph-demand.ts";
import {encodeSteppedStairV2Operands,replayPortableSteppedStairV2} from "./stepped-stair-v2-kernel.ts";
import type {OriginalNativePlanarSlabEnvelope} from "../../../../reviter/lib/reviter/native-source-planar-slab-envelope.ts";
import type {OriginalNativeFloorObstacleDomains} from "../../../../reviter/lib/reviter/native-source-floor-obstacle-domains.ts";
type Sources=Parameters<typeof extractOriginalSteppedStairV2Candidate>[0];
type Shared={census:Sources["foreign"];physical:Sources["stair"];own:Sources["own"];
  upper:OriginalNativePlanarSlabEnvelope;lower:OriginalNativeFloorObstacleDomains;
  door?:NonNullable<Sources["additionalForeignMaterials"]>[number];demand:OriginalSteppedStairGraphDemand;
  mullions:{id:number;ok:boolean;certificate?:NonNullable<Sources["rectangularMullions"]>[number];blockers?:string[]}[];
  panels?:{id:number;ok:boolean;certificate?:NonNullable<Sources["simpleSystemPanels"]>[number];blockers?:string[]}[];
  dir?:string;log?:(value:unknown)=>void;
};
export async function run(shared:Shared){
  const started=Date.now(),graph=inspectOriginalSteppedStairGraphDemand(shared.demand),log=shared.log??(()=>{});
  if(graph.edge.nativeElementId!==1696006)throw Error("This isolated Library proposal requires the original1696006 stair demand");
  const proposalPath="/workspace/scratch/unbc-pathway-repair-20261015/stair-bodies/1696006-original-generator-history-census.json",
    bytes=await fs.readFile(proposalPath),proposalRecord=JSON.parse(bytes.toString("utf8")),
    lower=graph.terminals[0]!.node.pointFeet,upper=graph.terminals[1]!.node.pointFeet;
  const proposal:SteppedSourceRouteProposal={nativeRunId:1696012,terminals:[
    {nativeFloorElementId:402395,originalCapFaceToken:249,lateralAxis:"y",approachXYFeet:[
      [lower[0],lower[1]],[lower[0],-323.3025630530456],[1.6,-323.3025630530456],[.5148043399884723,-323.3025630530456]]},
    {nativeFloorElementId:405772,originalCapFaceToken:5,lateralAxis:"y",approachXYFeet:[
      [upper[0],upper[1]],[upper[0],-318.12343176841307],[-.9831061180773955,-318.12343176841307]]},
  ],stations:proposalRecord.originalPhysicalTreadStationSequence};
  const sources:Sources={stair:shared.physical,foreign:shared.census,own:shared.own,
    terminalMaterials:[{kind:"floor-domains",certificate:shared.lower},{kind:"planar-slab",certificate:shared.upper}],
    additionalForeignMaterials:shared.door?[shared.door]:[],
    rectangularMullions:shared.mullions.filter(m=>m.ok&&m.certificate).map(m=>m.certificate!),
    simpleSystemPanels:(shared.panels??[]).filter(p=>p.ok&&p.certificate).map(p=>p.certificate!),
  };
  const output=(shared.dir??"/workspace/scratch/unbc-pathway-repair-20261015/entrances")+"/1696006-actual-source-v2-profile-replay.json";
  let report:unknown;
  try{
    log({stage:"v2-actual-source-extraction-start",mullionCertificates:sources.rectangularMullions!.length,
      panelCertificates:sources.simpleSystemPanels!.length,
      refusedMullions:shared.mullions.filter(m=>!m.ok).map(m=>({id:m.id,blockers:m.blockers})),
      refusedPanels:(shared.panels??[]).filter(p=>!p.ok).map(p=>({id:p.id,blockers:p.blockers}))});
    const extracted=extractOriginalSteppedStairV2Candidate(sources,shared.demand,proposal);
    const operandsPath=output.replace("-profile-replay.json","-portable-operands.json");
    await fs.writeFile(operandsPath,encodeSteppedStairV2Operands({index:extracted.index,receipt:extracted.receipt,
      originalGraphDemandSnapshot:graph,sourceCensusSha256:extracted.sourceCensusSha256,originalSourceAuthorityGranted:false,routeApproved:false})+"\n");
    log({stage:"v2-actual-source-extraction-finished",bodies:extracted.index.physicalBodies.length,cells:extracted.index.cells.length,
      issues:extracted.replay.issues,elapsedMs:Date.now()-started});
    const reverse=replayPortableSteppedStairV2(extracted.index,extracted.receipt,shared.demand,{direction:"reverse"});
    report={format:"unimported-original-library-stepped-v2-replay",originalRvtSourceHandlesConsumed:true,
      sourceModelSha256:shared.demand.sourceModelSha256,sourceCensusSha256:extracted.sourceCensusSha256,
      originalCanonicalGraph:graph,proposalFile:{path:proposalPath,sha256:createHash("sha256").update(bytes).digest("hex"),sourceAuthority:false},
      sourceProposal:proposal,counts:{bodies:extracted.index.physicalBodies.length,cells:extracted.index.cells.length,
        supports:extracted.index.supports.length,stations:extracted.receipt.stations.length},
      operandsPath,forward:extracted.replay,reverse,actualCompleteProfilePassedBothDirections:extracted.replay.mathematicalReplayPassed&&reverse.mathematicalReplayPassed,
      originalSourceAuthorityGranted:false,runtimeIntegrationApproved:false,routeApproved:false,elapsedMs:Date.now()-started};
  }catch(error){report={format:"unimported-original-library-stepped-v2-replay",originalRvtSourceHandlesConsumed:true,
    sourceModelSha256:shared.demand.sourceModelSha256,sourceCensusSha256:shared.census.sourceCensusSha256,
    error:error instanceof Error?error.message:String(error),actualCompleteProfilePassedBothDirections:false,
    originalSourceAuthorityGranted:false,runtimeIntegrationApproved:false,routeApproved:false,elapsedMs:Date.now()-started};}
  await fs.writeFile(output,encodeSteppedStairV2Operands(report)+"\n");log({stage:"v2-actual-source-report-saved",output,elapsedMs:Date.now()-started});
  return report;
}
