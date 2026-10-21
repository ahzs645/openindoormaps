/** Freeze the complete resolved normal CLI closure, not a partial fixture.
 * The resulting source snapshot is inert; shared-source admission needs its
 * own final coherent replay. Dependencies are linked for local execution. */
import {readFile,mkdir,writeFile,symlink} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {originalSourceConsumerBinding} from "../../../../../../reviter/scripts/indoor/native-source-consumer-binding.ts";
const [destination,...extra]=process.argv.slice(2);
if(!destination||extra.length)throw Error("Usage: capture-normal-threshold-source.mts NEW-SNAPSHOT-DIRECTORY");
const sourceRoot=fileURLToPath(new URL("../../../../../../reviter/",import.meta.url)),snapshot=resolve(destination),targetRoot=resolve(snapshot,"reviter"),entries=["scripts/indoor/audit-native-source-door-thresholds.ts","scripts/register-test-typescript.mjs","package.json"],before=originalSourceConsumerBinding(sourceRoot,entries),hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex"),driver=await readFile(fileURLToPath(import.meta.url));
await mkdir(snapshot,{recursive:false});
const files=[];
for(const [name,sha256] of before.modules){const bytes=await readFile(resolve(sourceRoot,name));if(hash(bytes)!==sha256)throw Error(`Source changed before closure copy: ${name}`);const target=resolve(targetRoot,name);if(!target.startsWith(snapshot+"/"))throw Error("Source dependency escapes paired snapshot");await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:"wx"});files.push({path:target.slice(snapshot.length+1),bytes:bytes.length,sha256});}
const pairedMetadata=[];
for(const name of["package.json","package-lock.json"]){const source=resolve(sourceRoot,"../openindoormaps",name),bytes=await readFile(source),sha256=hash(bytes),target=resolve(snapshot,"openindoormaps",name);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes,{flag:"wx"});pairedMetadata.push({source,target,bytes:bytes.length,sha256});}
await symlink(resolve(sourceRoot,"node_modules"),resolve(targetRoot,"node_modules"),"dir");
await symlink(resolve(sourceRoot,"../openindoormaps/node_modules"),resolve(snapshot,"openindoormaps/node_modules"),"dir");
const after=originalSourceConsumerBinding(sourceRoot,entries),copied=originalSourceConsumerBinding(targetRoot,entries);
if(before.sha256!==after.sha256||before.sha256!==copied.sha256||hash(driver)!==hash(await readFile(fileURLToPath(import.meta.url))))throw Error("Source closure changed during copy or copied closure differs");
for(const p of pairedMetadata)if(hash(await readFile(p.source))!==p.sha256)throw Error("Paired dependency metadata changed during copy");
const receipt={format:"isolated-original-threshold-consumer-source-v1",sourceRoot,snapshotRoot:snapshot,originalConsumerBinding:before,originalConsumerBindingAfterCopy:after,copiedConsumerBinding:copied,completeResolvedClosureCopied:true,allSourceAndCopiedHashesAgree:true,driverSha256:hash(driver),files,pairedDependencyMetadata:pairedMetadata,dependenciesLinkedOnlyForLocalExecution:true,sourceSnapshotInert:true,currentSharedSourceAdmissionGranted:false,routeApproved:false,published:false};
await writeFile(resolve(snapshot,"CAPTURE.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({snapshotRoot:snapshot,modules:copied.modules.length,sha256:copied.sha256,sourceSnapshotInert:true}));
