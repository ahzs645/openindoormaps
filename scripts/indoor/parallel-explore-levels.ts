import { fork } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deserialize, serialize } from "node:v8";
import type {
  ExploreLevelCompiler,
  PublishedNativeExploreMapping,
} from "../../app/indoor-project/native-explore-mapping";

// The CLI owns the temporary snapshot. Each child loads it once. Files are
// indexed by source order so completion timing cannot affect the mapping hash.
export const compileExploreLevelsInParallel: ExploreLevelCompiler = async (
  data,
  onLevel,
) => {
  const directory = await mkdtemp(join(tmpdir(), "native-explore-"));
  const controller = new AbortController();
  let firstFailure: unknown;
  const cancel = (cause: unknown) => {
    if (!controller.signal.aborted) {
      firstFailure = cause;
      controller.abort();
    }
  };
  try {
    await writeFile(join(directory, "dataset"), serialize(data));
    const count = Math.min(2, data.nativeLevels.length);
    const jobs = Array.from({ length: count }, (_, slot) =>
      new Promise<void>((resolve, reject) => {
        const child = fork(
          new URL("./explore-level-worker.ts", import.meta.url),
          [directory],
          {
            execArgv: ["--import", "tsx"],
            stdio: ["ignore", "inherit", "inherit", "ipc"],
          },
        );
        const stop = () => {
          child.kill();
        };
        controller.signal.addEventListener("abort", stop, { once: true });
        child.on("message", (index: unknown) => {
          try {
            if (typeof index !== "number" || !data.nativeLevels[index])
              throw new Error("Unexpected native explore worker progress.");
            onLevel?.(
              data.nativeLevels[index].id,
              index,
              data.nativeLevels.length,
            );
          } catch (cause) {
            cancel(cause);
          }
        });
        child.once("error", cancel);
        child.once("close", (code, signal) => {
          controller.signal.removeEventListener("abort", stop);
          if (code !== 0) {
            reject(
              new Error(`Explore worker ${slot} exited with ${signal ?? code}`),
            );
          } else {
            resolve();
          }
        });
      }).catch((error) => {
        cancel(error);
        throw error;
      }),
    );
    const completed = await Promise.allSettled(jobs);
    if (controller.signal.aborted) throw firstFailure;
    for (const job of completed)
      if (job.status === "rejected") throw job.reason;
    const levels: (
      | PublishedNativeExploreMapping["levels"][number]
      | undefined
    )[] = [];
    for (let index = 0; index < data.nativeLevels.length; index++)
      levels.push(deserialize(await readFile(join(directory, String(index)))));
    return levels;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
