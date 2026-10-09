import type { FloorWorker } from "./floor-worker-client";
import type { FloorPreparationResponse, PreparedFloor } from "./prepared-floor";
import type { NativeExploreResult } from "./native-explore";
import {
  floorDiagnostic,
  floorDiagnosticsEnabled,
  recordFloorDiagnostic,
  type FloorDiagnosticEntry,
} from "./floor-diagnostics";
const nativeDisplays = new WeakMap<PreparedFloor, NativeExploreResult>();
export function preparedFloorNativeDisplay(value: PreparedFloor | undefined) {
  return value ? nativeDisplays.get(value) : undefined;
}
/** One validated worker envelope supplies both room display and native faces.
 * Keep the original shared graph; never clone or rebuild it on the UI thread.
 * Opt-in scalar diagnostics are consumed here and never reach the client. */
export function bridgeFloorDisplayWorker(raw: FloorWorker): FloorWorker {
  let requestId: number | undefined;
  let receive: FloorWorker["onmessage"] = null;
  let postedAt = 0;
  raw.onmessage = (event) => {
    const start = performance.now();
    // Structured-clone deserialization happens on first access of event.data.
    const response = event.data as FloorPreparationResponse & {
      nativeFaces?: NativeExploreResult;
      diagnostic?: FloorDiagnosticEntry;
    };
    if (response && "diagnostic" in response && response.diagnostic) {
      recordFloorDiagnostic(response.diagnostic);
      return;
    }
    if (floorDiagnosticsEnabled())
      floorDiagnostic("floor-main:receive", {
        requestId: response?.requestId,
        deserializeMs: performance.now() - start,
        sincePostMs: start - postedAt,
        error: !!response && "error" in response,
      });
    if (response.requestId === requestId) {
      requestId = undefined;
      if (!("error" in response) && response.nativeFaces)
        nativeDisplays.set(response.value, response.nativeFaces);
    }
    receive?.(event);
  };
  return {
    get onmessage() {
      return receive;
    },
    set onmessage(value) {
      receive = value;
    },
    get onerror() {
      return raw.onerror;
    },
    set onerror(value) {
      raw.onerror = value;
    },
    get onmessageerror() {
      return raw.onmessageerror;
    },
    set onmessageerror(value) {
      raw.onmessageerror = value;
    },
    postMessage(request) {
      requestId = request.requestId;
      if (!floorDiagnosticsEnabled()) {
        raw.postMessage(request);
        return;
      }
      const start = performance.now();
      raw.postMessage({ ...request, diagnostics: true } as typeof request);
      postedAt = performance.now();
      floorDiagnostic("floor-main:postMessage", {
        requestId: request.requestId,
        datasetIncluded: !!request.data,
        levels: request.levelIds.length,
        preparedAssetOffered: !!request.preparedDisplay,
        ms: postedAt - start,
      });
    },
    terminate() {
      requestId = undefined;
      receive = null;
      raw.terminate();
    },
  };
}
