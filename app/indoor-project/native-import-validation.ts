import type { IndoorDataset } from "./contract";
/** Import-only concurrent proof. All package checks still run; acceptance waits
 * for this independent worker's complete exact mapping validation. A detached
 * structured clone keeps the proof separate from subsequent read-only checks. */
export function beginNativeImportValidation(data: unknown):
  | {
      result: Promise<{ error?: string }>;
      cancel: () => void;
    }
  | undefined {
  if (
    typeof window !== "undefined" ||
    typeof Worker === "undefined" ||
    !data ||
    typeof data !== "object"
  )
    return;
  const candidate = data as IndoorDataset;
  if (candidate.nativeExploreMapping?.version !== 3) return;
  let payload = candidate;
  if (Object.getPrototypeOf(candidate) === Object.prototype) {
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    if (
      Reflect.ownKeys(descriptors).every((key) => {
        const d = Reflect.get(descriptors, key) as PropertyDescriptor;
        return d.enumerable && "value" in d;
      })
    ) {
      // Historical raised meshes are validated by the package, but do not
      // participate in the exact native mapping validator.
      delete descriptors.presentation;
      payload = Object.defineProperties({}, descriptors) as IndoorDataset;
    }
  }
  const worker = new Worker(
    new URL("native-explore-export.worker.ts", import.meta.url),
    { type: "module" },
  );
  let settled = false,
    complete!: (result: { error?: string }) => void;
  const result = new Promise<{ error?: string }>((resolve) => {
    complete = resolve;
  });
  const finish = (error?: string) => {
    if (settled) return;
    settled = true;
    worker.terminate();
    complete(error ? { error } : {});
  };
  worker.onmessage = ({
    data: response,
  }: MessageEvent<{ error?: unknown }>) => {
    if (
      !response ||
      typeof response !== "object" ||
      Object.keys(response).some((key) => key !== "error") ||
      (response.error !== undefined &&
        (typeof response.error !== "string" || !response.error))
    ) {
      finish("Invalid native import validation response.");
      return;
    }
    finish(response.error as string | undefined);
  };
  worker.onerror = () => finish("Native floor map validation failed.");
  worker.onmessageerror = () =>
    finish("Native floor map validation response could not be read.");
  try {
    worker.postMessage({ data: payload, validation: true });
  } catch (error) {
    finish(error instanceof Error ? error.message : String(error));
  }
  return {
    result,
    cancel: () => finish("Native import validation cancelled."),
  };
}
