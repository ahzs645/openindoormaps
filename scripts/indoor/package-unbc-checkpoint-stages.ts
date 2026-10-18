/** Package newly completed native-plane work with complete input/algorithm
 * bindings. Backups remain mathematical work, never a route approval.
 * Invoke repeatedly with TASK_ROOT while its isolated rebuild runs.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  copyFile,
  readdir,
  stat,
  rename,
  open,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
async function packageStages() {
  const root = path.resolve(process.argv[2]!),
    reviter = path.join(root, "frozen/workspace/reviter"),
    checkpoints = path.join(root, "production-checkpoints"),
    output = path.join(root, "checkpoint-backup-stages");
  const hash = async (file: string, start?: number) => {
    const h = createHash("sha256");
    for await (const b of createReadStream(
      file,
      start === undefined ? undefined : { start },
    ))
      h.update(b);
    return h.digest("hex");
  };
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const exists = async (p: string) => {
    try {
      await stat(p);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  await mkdir(output, { recursive: true });
  const indexPath = path.join(output, "READY-UPLOADS.json");
  const ready: {
    path: string;
    bytes: number;
    sha256: string;
    kind: string;
    bindingSha256: string;
    taskId?: string;
  }[] = (await exists(indexPath))
    ? JSON.parse(await readFile(indexPath, "utf8"))
    : [];
  const saveIndex = async () => {
    const p = indexPath + ".tmp";
    await writeFile(p, JSON.stringify(ready, null, 2) + "\n");
    await rename(p, indexPath);
  };
  if (!(await exists(checkpoints))) {
    console.log(JSON.stringify({ ready: ready.length, nativePlanes: 0 }));
    return;
  }
  const cp = (await import(
    pathToFileURL(
      path.join(reviter, "scripts/indoor/bounded-worker-checkpoints.ts"),
    ).href
  )) as typeof import("../../../reviter/scripts/indoor/bounded-worker-checkpoints.ts");
  const inputs = path.join(checkpoints, "inputs");
  if (!(await exists(inputs))) {
    console.log(JSON.stringify({ ready: ready.length, nativePlanes: 0 }));
    return;
  }
  const names = await readdir(inputs),
    models = names.filter((n) => /^native-model-[a-f0-9]+\.bin$/.test(n)),
    datasets = names.filter((n) => /^native-dataset-[a-f0-9]+\.bin$/.test(n));
  const namespaces = (
    await readdir(checkpoints, { withFileTypes: true })
  ).filter((d) => d.isDirectory() && /^[a-f0-9]{64}$/.test(d.name));
  const engine = await import(
    pathToFileURL(path.join(reviter, "node_modules/esbuild/lib/main.js")).href
  );
  const build = engine.build ?? engine.default?.build;
  assert(
    typeof build === "function",
    "Matching compiler dependency enumerator missing",
  );
  const worker = path.join(
    reviter,
    "scripts/indoor/native-circulation-plane-worker.ts",
  );
  const graph = await build({
    entryPoints: [worker],
    absWorkingDir: reviter,
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const algorithms = [
    ...Object.keys(graph.metafile!.inputs).map((p) => path.resolve(reviter, p)),
    path.join(reviter, "scripts/indoor/parallel-native-circulation.ts"),
    path.join(reviter, "scripts/register-local-typescript.mjs"),
    path.join(reviter, "scripts/local-typescript-resolver.mjs"),
    path.join(
      reviter,
      "lib/reviter/vendor/native-exact-geos/native-exact-geos.wasm",
    ),
    path.join(reviter, "package.json"),
    path.join(reviter, "package-lock.json"),
  ];
  let completed = 0;
  for (const directory of namespaces) {
    const dir = path.join(checkpoints, directory.name),
      files = (await readdir(dir)).filter((n) => n.endsWith(".checkpoint"));
    if (files.length === 0) continue;
    // Landing-pair checkpoints share this parent directory but have their own
    // inputs and algorithm binding. Never treat them as physical floor work.
    const first = await open(path.join(dir, files[0]!), "r");
    const firstPrefix = Buffer.alloc(65_536);
    let firstBytes: number;
    try {
      firstBytes = (await first.read(firstPrefix, 0, firstPrefix.length, 0))
        .bytesRead;
    } finally {
      await first.close();
    }
    const firstEnd = firstPrefix.subarray(0, firstBytes!).indexOf(10);
    assert(firstEnd > 0, "Checkpoint header missing");
    const firstHeader = JSON.parse(
      firstPrefix.subarray(0, firstEnd).toString(),
    );
    assert.equal(firstHeader.format, "reviter-bounded-checkpoint");
    if (!String(firstHeader.taskId).startsWith("native-plane:")) continue;
    let binding:
      | Awaited<ReturnType<typeof cp.createCheckpointBinding>>
      | undefined;
    for (const model of models)
      for (const dataset of datasets) {
        const candidate = await cp.createCheckpointBinding({
          immutableInputs: [
            { name: "native-model", path: path.join(inputs, model) },
            { name: "native-dataset", path: path.join(inputs, dataset) },
          ],
          algorithmFiles: algorithms,
          algorithmVersion:
            "native-independent-plane-drafts-v1:" + process.version,
        });
        if (candidate.sha256 === directory.name) {
          assert(!binding, "Ambiguous checkpoint input binding");
          binding = candidate;
        }
      }
    assert(
      binding,
      "No current complete input/compiler/engine/Node binding matches native checkpoints",
    );
    await cp.verifyCheckpointBinding(binding);
    const commonName =
        "UNBC.native-checkpoint-inputs-" + binding.sha256.slice(0, 12),
      common = path.join(output, commonName);
    if (
      !ready.some(
        (r) =>
          r.kind === "shared-native-inputs" &&
          r.bindingSha256 === binding!.sha256,
      )
    ) {
      await mkdir(common, { recursive: true });
      const manifest = [];
      const inputRecipes = [];
      for (const item of binding.immutableInputs) {
        const seed =
          item.name === "native-model"
            ? path.join(root, "native-model-restoration-seed.bin")
            : path.join(root, "reviews/prelanding-source-snapshot.bin");
        const deltaName = item.name + ".delta.zst",
          deltaPath = path.join(common, deltaName);
        assert.equal(await hash(item.path), item.sha256);
        execFileSync("zstd", [
          "--long=29",
          "--patch-from=" + seed,
          item.path,
          "-o",
          deltaPath,
          "-q",
          "-f",
        ]);
        const readback = path.join(common, item.name + ".restore-readback.bin");
        execFileSync("zstd", [
          "-d",
          "--long=29",
          "--patch-from=" + seed,
          deltaPath,
          "-o",
          readback,
          "-q",
          "-f",
        ]);
        assert.equal(
          await hash(readback),
          item.sha256,
          "Lossless native input delta restore differs",
        );
        assert.equal((await stat(readback)).size, (await stat(item.path)).size);
        await rm(readback);
        inputRecipes.push({
          name: item.name,
          originalPath: item.path,
          targetBytes: (await stat(item.path)).size,
          targetSha256: item.sha256,
          seedKind:
            item.name === "native-model"
              ? "verified-enriched-cache-v8-model"
              : "stage-04-prelanding-context",
          seedBytes: (await stat(seed)).size,
          seedSha256: await hash(seed),
          deltaFile: deltaName,
          deltaBytes: (await stat(deltaPath)).size,
          deltaSha256: await hash(deltaPath),
        });
      }
      for (const item of binding.algorithmFiles) {
        assert.equal(await hash(item.path), item.sha256);
        const relative = "files/" + item.path.replace(/^\//, "");
        const dest = path.join(common, relative);
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(item.path, dest);
        assert.equal(
          await hash(dest),
          item.sha256,
          "Archived algorithm copy differs",
        );
        manifest.push({
          ...item,
          archivePath: relative,
          bytes: (await stat(dest)).size,
        });
      }
      await copyFile(
        path.join(root, "SOURCE-FREEZE.json"),
        path.join(common, "SOURCE-FREEZE.json"),
      );
      await copyFile(
        new URL("recover-unbc-native-model-seed.ts", import.meta.url),
        path.join(common, "recover-unbc-native-model-seed.ts"),
      );
      await copyFile(
        path.join(root, "checkpoint-upload-queue.py"),
        path.join(common, "checkpoint-upload-queue.py"),
      );
      await copyFile(
        new URL(import.meta.url),
        path.join(common, "package-unbc-checkpoint-stages.ts"),
      );
      await writeFile(
        path.join(common, "package.json"),
        JSON.stringify({ type: "module", private: true }) + "\n",
      );
      await writeFile(
        path.join(common, "INPUT-RESTORE.json"),
        JSON.stringify(inputRecipes, null, 2) + "\n",
      );
      await writeFile(
        path.join(common, "restore-inputs.py"),
        `from pathlib import Path
import hashlib,json,subprocess,sys
root=Path(__file__).resolve().parent;out=Path(sys.argv[3]).resolve();out.mkdir(parents=True,exist_ok=True)
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
for row in json.loads((root/'INPUT-RESTORE.json').read_text()):
 seed=Path(sys.argv[1] if row['name']=='native-model' else sys.argv[2]);delta=root/row['deltaFile'];target=out/Path(row['originalPath']).name
 assert not target.exists(),'Refusing overwrite'
 assert seed.stat().st_size==row['seedBytes'] and sha(seed)==row['seedSha256'],'Wrong seed'
 assert delta.stat().st_size==row['deltaBytes'] and sha(delta)==row['deltaSha256'],'Wrong delta'
 subprocess.run(['zstd','-d','--long=29','--patch-from='+str(seed),str(delta),'-o',str(target),'-q'],check=True)
 assert target.stat().st_size==row['targetBytes'] and sha(target)==row['targetSha256'],'Target mismatch'
 print('Verified exact',row['name'],row['targetSha256'])
`,
      );
      await writeFile(
        path.join(common, "binding.json"),
        JSON.stringify(binding, null, 2) + "\n",
      );
      await writeFile(
        path.join(common, "RESTORE-FILES.json"),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      await writeFile(
        path.join(common, "README.md"),
        "# Shared native checkpoint inputs\n\nExact new V8 model/dataset are stored as lossless binary deltas against shared earlier data. Generate the model seed with the included TypeScript script from Stage 1's exact enriched cache. The dataset seed is Stage 4's prelanding-source-snapshot.bin. Run: python restore-inputs.py MODEL-SEED.bin PRELANDING-SNAPSHOT.bin NEW-INPUTS-DIRECTORY. Each complete seed, delta and reconstructed input is verified. This avoids downloading another full model/dataset copy.\n\nRESTORE-FILES.json maps resolved compiler/engine files to original absolute locations. Reuse only after the normal compiler verifies identical complete inputs, algorithm and Node/runtime bindings. A different path, Node version or source must not be silently rebound. This is incomplete build work, not an accepted map or route proof. All originals and source reviews remain in earlier stages; private source capabilities must be reissued from actual originals.\n",
      );
      const arc = path.join(output, commonName + ".tar.zst");
      await cp.verifyCheckpointBinding(binding);
      execFileSync("tar", ["--zstd", "-cf", arc, "-C", output, commonName]);
      const s = await stat(arc);
      ready.push({
        path: arc,
        bytes: s.size,
        sha256: await hash(arc),
        kind: "shared-native-inputs",
        bindingSha256: binding.sha256,
      });
      await saveIndex();
    }
    for (const name of files) {
      const file = path.join(dir, name),
        handle = await open(file, "r");
      const prefix = Buffer.alloc(65_536);
      let n: number;
      try {
        n = (await handle.read(prefix, 0, prefix.length, 0)).bytesRead;
      } finally {
        await handle.close();
      }
      const end = prefix.subarray(0, n!).indexOf(10);
      assert(end > 0);
      const header = JSON.parse(prefix.subarray(0, end).toString());
      assert.equal(header.format, "reviter-bounded-checkpoint");
      assert.equal(header.version, 1);
      assert.equal(header.bindingSha256, binding.sha256);
      assert(/^native-plane:-?[0-9.]+$/.test(header.taskId));
      const elevationFeet = Number(header.taskId.slice("native-plane:".length));
      assert(Number.isFinite(elevationFeet));
      assert.equal(
        header.taskInputSha256,
        sha(JSON.stringify({ elevationFeet })),
      );
      assert.equal((await stat(file)).size, end + 1 + header.resultBytes);
      assert.equal(await hash(file, end + 1), header.resultSha256);
      completed++;
      if (
        ready.some(
          (r) =>
            r.taskId === header.taskId && r.bindingSha256 === binding!.sha256,
        )
      )
        continue;
      // The actual bounded worker validated the JSON carrier before atomic commit.
      // Keep backup verification streaming to avoid competing with compiler heaps.
      const label = String(elevationFeet).replace("-", "m").replace(".", "p"),
        stageName =
          "UNBC.native-floor-" + label + "-" + binding.sha256.slice(0, 12),
        stage = path.join(output, stageName);
      await mkdir(stage, { recursive: true });
      await copyFile(file, path.join(stage, name));
      assert.equal(
        await hash(path.join(stage, name)),
        await hash(file),
        "Archived floor checkpoint copy differs",
      );
      await writeFile(
        path.join(stage, "CHECKPOINT.json"),
        JSON.stringify(
          {
            ...header,
            checkpointFile: name,
            checkpointBytes: (await stat(file)).size,
            checkpointSha256: await hash(file),
            node: process.version,
            streamedCompletePayloadVerified: true,
            originalWorkerCarrierValidated: true,
            fullCompilerMergeAndFinalAcceptanceStillRequired: true,
            historicalCheckpointRelabelled: false,
            physicalOrRoutingApprovalGranted: false,
          },
          null,
          2,
        ) + "\n",
      );
      const arc = path.join(output, stageName + ".tar.zst");
      execFileSync("tar", ["--zstd", "-cf", arc, "-C", output, stageName]);
      ready.push({
        path: arc,
        bytes: (await stat(arc)).size,
        sha256: await hash(arc),
        kind: "native-plane",
        bindingSha256: binding.sha256,
        taskId: header.taskId,
      });
      await saveIndex();
    }
  }
  console.log(
    JSON.stringify({
      ready: ready.length,
      nativePlanes: completed,
      readyIndex: indexPath,
    }),
  );
}
await packageStages();
