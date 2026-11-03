// Load the master once with the normal validated importer, then keep a local
// v8 snapshot (scratch only, bound to the master SHA) so later diagnostic
// passes do not repeat the long import. The snapshot is not validation authority.
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { serialize, deserialize } from "node:v8";
import { dirname } from "node:path";
import { readIndoorProject, type IndoorProject } from "../../../../../app/indoor-project/package";
import { initializeNativeExactGeosOverlay } from "../../../../../app/indoor-project/native-exact-geos-overlay";
export async function loadProject(master: string, snapshot: string): Promise<{ project: IndoorProject; masterSha256: string }> {
  await initializeNativeExactGeosOverlay();
  const bytes = await readFile(master);
  const masterSha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await access(snapshot);
    const v = deserialize(await readFile(snapshot)) as { masterSha256: string; project: IndoorProject };
    if (v.masterSha256 === masterSha256) { console.log(`snapshot reused for ${masterSha256.slice(0, 12)}`); return { project: v.project, masterSha256 }; }
  } catch {}
  const t = Date.now();
  const project = await readIndoorProject(bytes);
  console.log(`imported ${masterSha256.slice(0, 12)} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  // Only the dataset and room review are needed downstream; drop file bytes.
  const slim = { ...project, files: {} } as IndoorProject;
  await mkdir(dirname(snapshot), { recursive: true });
  await writeFile(snapshot, serialize({ masterSha256, project: slim }));
  return { project: slim, masterSha256 };
}
