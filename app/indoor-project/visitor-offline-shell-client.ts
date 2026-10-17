export type VisitorOfflineShellProgress = {
  completedAssets: number;
  totalAssets: number;
  verifiedBytes: number;
  totalBytes: number;
};
export type VisitorOfflineShellResult = {
  complete: true;
  revisionSha256: string;
  assetCount: number;
  /** Uncompressed app/static bytes, separate from downloaded map data. */
  bytes: number;
};
type ServiceWorkers = Pick<
  ServiceWorkerContainer,
  "register" | "getRegistration"
>;
const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted)
    throw (
      signal.reason ??
      new DOMException("Offline app download cancelled.", "AbortError")
    );
};
async function activated(worker: ServiceWorker, signal?: AbortSignal) {
  aborted(signal);
  if (worker.state === "activated") return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("statechange", changed);
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => {
      cleanup();
      reject(
        signal?.reason ??
          new DOMException("Offline app download cancelled.", "AbortError"),
      );
    };
    const changed = () => {
      if (worker.state === "activated") {
        cleanup();
        resolve();
      } else if (worker.state === "redundant") {
        cleanup();
        reject(new Error("The offline visitor app worker could not start."));
      }
    };
    worker.addEventListener("statechange", changed);
    signal?.addEventListener("abort", cancel, { once: true });
    changed();
  });
}

/** Call only for the explicit complete-offline action. Registration itself
 * downloads no app/map assets; the worker verifies its complete build inventory. */
export async function prepareVisitorOfflineShell(
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: VisitorOfflineShellProgress) => void;
    baseUrl?: string;
    serviceWorkers?: ServiceWorkers;
  } = {},
): Promise<VisitorOfflineShellResult> {
  aborted(options.signal);
  const workers = options.serviceWorkers ?? globalThis.navigator?.serviceWorker;
  if (!workers)
    throw new Error(
      "This browser cannot save the visitor app for offline reopening.",
    );
  const base = new URL(
    options.baseUrl ?? import.meta.env?.BASE_URL ?? "/",
    globalThis.location?.href ?? "http://localhost/",
  );
  if (
    !/^https?:$/.test(base.protocol) ||
    !base.pathname.endsWith("/") ||
    base.search ||
    base.hash ||
    (globalThis.location && base.origin !== globalThis.location.origin)
  )
    throw new Error(
      "The offline visitor app requires this app's same-origin base URL.",
    );
  const script = new URL("visitor-offline-sw.js", base).href;
  let registration: ServiceWorkerRegistration;
  try {
    registration = await workers.register(script, {
      scope: base.href,
      updateViaCache: "none",
    });
  } catch (error) {
    aborted(options.signal);
    const saved = await workers.getRegistration(base.href);
    if (saved?.active?.scriptURL !== script) throw error;
    registration = saved;
  }
  aborted(options.signal);
  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker)
    throw new Error("The offline visitor app worker is unavailable.");
  await activated(worker, options.signal);
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const cleanup = () => {
      channel.port1.close();
      channel.port2.close();
      options.signal?.removeEventListener("abort", cancel);
      worker.removeEventListener("statechange", changed);
    };
    const cancel = () => {
      failed(
        options.signal?.reason ??
          new DOMException("Offline app download cancelled.", "AbortError"),
      );
    };
    const changed = () => {
      if (worker.state === "redundant") {
        cleanup();
        reject(
          new Error(
            "The offline visitor app worker stopped before verification completed.",
          ),
        );
      }
    };
    const failed = (error: unknown) => {
      try {
        worker.postMessage({ kind: "OIM_VISITOR_SHELL_CANCEL", requestId });
      } catch {
        /* The worker may already be unavailable. */
      }
      cleanup();
      reject(error);
    };
    channel.port1.onmessage = ({ data }) => {
      switch (data?.kind) {
        case "progress": {
          try {
            options.onProgress?.({
              completedAssets: data.completedAssets,
              totalAssets: data.totalAssets,
              verifiedBytes: data.verifiedBytes,
              totalBytes: data.totalBytes,
            });
          } catch (error) {
            failed(error);
          }
          break;
        }
        case "complete": {
          if (
            data.value?.complete !== true ||
            !/^[a-f0-9]{64}$/.test(data.value.revisionSha256) ||
            !Number.isSafeInteger(data.value.assetCount) ||
            data.value.assetCount <= 0 ||
            data.value.assetCount > 2048 ||
            !Number.isSafeInteger(data.value.bytes) ||
            data.value.bytes <= 0 ||
            data.value.bytes > 128 * 1024 * 1024
          ) {
            failed(
              new Error(
                "The offline visitor app returned an invalid completion receipt.",
              ),
            );
            return;
          }
          cleanup();
          resolve(data.value as VisitorOfflineShellResult);
          break;
        }
        case "error": {
          cleanup();
          reject(new Error(data.message || "Offline app verification failed."));
          break;
        }
        default: {
          failed(
            new Error("The offline visitor app returned an unknown response."),
          );
        }
      }
    };
    channel.port1.onmessageerror = () => {
      failed(
        new Error("The offline visitor app returned unreadable progress."),
      );
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    worker.addEventListener("statechange", changed);
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    try {
      worker.postMessage({ kind: "OIM_VISITOR_SHELL_PREPARE", requestId }, [
        channel.port2,
      ]);
    } catch (error) {
      failed(error);
    }
  });
}
