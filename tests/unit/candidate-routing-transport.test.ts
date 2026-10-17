import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { candidateNativeRoutingFixture } from "../fixtures/candidate-native-routing";
import { routeWorkerDataset } from "../../app/indoor-project/route-worker-dataset";
import { createImmutableRoutingSession } from "../../app/indoor-project/routing-cache";
import {
  createWorkerRouteCalculator,
  type RouteCalculation,
  type RouteResponse,
} from "../../app/indoor-project/route-calculation";
import {
  RouteWorkerClient,
  type RouteWorker,
} from "../../app/indoor-project/route-worker-client";
import {
  decodePublishedRouteCells,
  createPublishedRouteCalculator,
  publishedRouteCellReceipt,
} from "../../app/indoor-project/published-route-cells";
import {
  collectFreshCandidateRoutingCache,
  writeFreshCandidateRoutingCache,
} from "../../scripts/indoor/candidate-routing-cache";
import { buildCandidateProductionRouteBundle } from "../../scripts/indoor/candidate-route-worker-bundle";
import { initializeNativeExactGeosOverlay } from "../../app/indoor-project/native-exact-geos-overlay";

test(
  "fresh source calculations round-trip through the real bounded production worker and client, while a source mutation invalidates the receipt",
  { timeout: 60000 },
  async () => {
    await initializeNativeExactGeosOverlay();
    const data = routeWorkerDataset(await candidateNativeRoutingFixture()),
      run = createImmutableRoutingSession(data),
      original = createWorkerRouteCalculator(data),
      start = data.records[0].key,
      end = data.records[1].key;
    for (const mode of ["public", "accessible"] as const)
      assert.equal(
        !!run(() => original(start, end, mode)).route,
        mode === "public",
      );
    const fresh = run(() => collectFreshCandidateRoutingCache(data)),
      out = await fs.mkdtemp(
        path.join(os.tmpdir(), "candidate-route-transport-"),
      );
    let worker: Worker | undefined, client: RouteWorkerClient | undefined;
    try {
      const { receipt, cachePath } = await writeFreshCandidateRoutingCache(
          fresh,
          path.join(out, "cache"),
        ),
        cache = new Uint8Array(await fs.readFile(cachePath)),
        decoded = decodePublishedRouteCells(data, receipt, cache);
      assert(
        createPublishedRouteCalculator(data, decoded)(start, end, "public")
          .route,
      );
      const edited = structuredClone(data);
      edited.source.roomsSha256 = "f".repeat(64);
      assert.equal(
        publishedRouteCellReceipt(edited, {
          receipts: [receipt],
          engineSha256: receipt.engineSha256,
        }),
        undefined,
      );
      const root = fileURLToPath(new URL("../../", import.meta.url)),
        { bundle } = await buildCandidateProductionRouteBundle(
          root,
          out,
          receipt,
        );
      let downloads = 0,
        largestHeapLimit = 0;
      client = new RouteWorkerClient(() => {
        const native = new Worker(pathToFileURL(bundle), {
          execArgv: [],
          resourceLimits: {
            maxOldGenerationSizeMb: 128,
            maxYoungGenerationSizeMb: 32,
          },
          workerData: { receipt, cachePath },
        });
        worker = native;
        const adapter: RouteWorker = {
          onmessage: null,
          onerror: null,
          onmessageerror: null,
          postMessage(request) {
            native.postMessage(request);
          },
          terminate() {
            void native.terminate();
          },
        };
        native.on("message", (message) => {
          if (message._qaFetch) downloads++;
          if (message.memory)
            largestHeapLimit = Math.max(
              largestHeapLimit,
              message.memory.heapLimit,
            );
          if (message._qaResponse)
            adapter.onmessage?.({
              data: message._qaResponse,
            } as MessageEvent<RouteResponse>);
        });
        native.on("error", (error) =>
          adapter.onerror?.({
            message: error.message,
            preventDefault() {},
          } as ErrorEvent),
        );
        return adapter;
      });
      for (const mode of ["public", "accessible"] as const)
        for (const reverse of [false, true]) {
          const a = reverse ? end : start,
            b = reverse ? start : end,
            value: RouteCalculation = await client.request(data, a, b, mode)
              .promise;
          assert.equal(!!value.route, mode === "public");
          if (value.route) {
            assert.equal(
              value.route.nodeIds[0],
              data.records[reverse ? 1 : 0].arrivalNodeId,
            );
            assert.equal(
              value.route.nodeIds.at(-1),
              data.records[reverse ? 0 : 1].arrivalNodeId,
            );
          }
        }
      assert.equal(downloads, 1);
      assert(
        largestHeapLimit > 0 && largestHeapLimit <= 256 * 1024 * 1024,
        `Measured worker heap limit ${largestHeapLimit}; resource limit must be effective`,
      );
    } finally {
      client?.dispose();
      if (worker) await worker.terminate();
      await fs.rm(out, { recursive: true, force: true });
    }
  },
);
