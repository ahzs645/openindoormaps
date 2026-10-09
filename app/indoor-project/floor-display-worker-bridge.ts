import type { FloorWorker } from "./floor-worker-client";
import type { FloorPreparationResponse, PreparedFloor } from "./prepared-floor";
import type { NativeExploreResult } from "./native-explore";
const nativeDisplays = new WeakMap<PreparedFloor, NativeExploreResult>();
export function preparedFloorNativeDisplay(value: PreparedFloor | undefined) {
  return value ? nativeDisplays.get(value) : undefined;
}
/** One validated worker envelope supplies both room display and native faces.
 * Keep the original shared graph; never clone or rebuild it on the UI thread. */
export function bridgeFloorDisplayWorker(raw: FloorWorker): FloorWorker {
  let requestId: number | undefined;
  let receive: FloorWorker["onmessage"] = null;
  raw.onmessage = (event) => {
    const response = event.data as FloorPreparationResponse & {
      nativeFaces?: NativeExploreResult;
    };
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
      raw.postMessage(request);
    },
    terminate() {
      requestId = undefined;
      receive = null;
      raw.terminate();
    },
  };
}
