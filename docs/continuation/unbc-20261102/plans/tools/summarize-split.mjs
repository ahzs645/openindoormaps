// Summarize profile-route.mjs timing files into the first-route split.
//   node summarize-split.mjs OUT.json DIR [DIR...]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const [output, ...dirs] = process.argv.slice(2);
const runs = [];
for (const dir of dirs)
  for (const name of readdirSync(dir).filter((n) => n.endsWith("-timing.json"))) {
    const t = JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
    const log = t.log;
    const req = log.find((r) => r.stage === "corridor-default:requested");
    const after = (pred) => {
      const row = log.find((r) => r.seconds >= req.seconds && pred(r));
      return row ? +(row.seconds - req.seconds).toFixed(2) : null;
    };
    const lastBefore = (pred, limit) => {
      const rows = log.filter(
        (r) => r.seconds >= req.seconds && r.seconds <= limit && pred(r),
      );
      return rows.length
        ? +(rows.at(-1).seconds - req.seconds).toFixed(2)
        : null;
    };
    const first = t.results.find((r) => r.name === "corridor-default");
    const second = t.results.find((r) => r.name === "office-transit");
    const floorReady = req.seconds + first.requestToFloorReadySeconds;
    const floorResponse = log.find(
      (r) =>
        r.seconds >= req.seconds &&
        /^floor-worker-\d+:response$/.test(r.stage) &&
        r.kind === "detail",
    );
    const floorRequest = floorResponse
      ? log
          .filter(
            (r) =>
              r.seconds >= req.seconds &&
              r.seconds <= floorResponse.seconds &&
              r.stage === floorResponse.stage.replace("response", "request"),
          )
          .at(-1)
      : undefined;
    const floorWorker = floorResponse?.stage.split(":")[0];
    runs.push({
      file: `${dir}/${name}`,
      mode: t.mode,
      label: t.label,
      loadAverage: t.loadAverage,
      initialFloorReadySeconds: log.find((r) => r.stage === "initial-floor-ready")
        ?.seconds,
      split: {
        routeWorkerCreated: after((r) => /^route-worker-\d+:created$/.test(r.stage)),
        routeRequestPosted: after(
          (r) => /^route-worker-\d+:request$/.test(r.stage) && !r.prepareOnly,
        ),
        routingDownloaded: lastBefore(
          (r) => /route-worker-\d+:routing-part-downloaded/.test(r.stage),
          floorReady,
        ),
        directionsCacheDownloaded: after((r) =>
          /route-worker-\d+:directions-cache-downloaded/.test(r.stage),
        ),
        directionsCacheAdmitted: after((r) =>
          /route-worker-\d+:directions-cache-admitted/.test(r.stage),
        ),
        routeResultMessage: after(
          (r) => /^route-worker-\d+:response$/.test(r.stage) && r.kind === "route",
        ),
        firstRoutePaint: first.requestToRouteShownSeconds,
        routeWorkerTerminated: after((r) =>
          /^route-worker-\d+:terminate$/.test(r.stage),
        ),
        planRequested: after((r) => r.stage === "page:plan-requested"),
        planDownloaded: lastBefore(
          (r) => r.stage === "page:plan-downloaded",
          floorReady,
        ),
        detailDecodeStart: floorRequest
          ? +(floorRequest.seconds - req.seconds).toFixed(2)
          : null,
        detailLastChunkDownloaded: floorResponse
          ? lastBefore(
              (r) => r.stage === `${floorWorker}:download`,
              floorResponse.seconds,
            )
          : null,
        detailDecodeEnd: floorResponse
          ? +(floorResponse.seconds - req.seconds).toFixed(2)
          : null,
        floorReady: first.requestToFloorReadySeconds,
      },
      distance: first.statusText,
      laterRoute: second
        ? {
            routeShown: second.requestToRouteShownSeconds,
            floorReady: second.requestToFloorReadySeconds,
            distance: second.statusText,
          }
        : undefined,
      memory: t.memory,
      pageErrors: log.filter((r) => r.stage === "pageerror").length,
    });
  }
runs.sort((a, b) => (a.mode + a.label).localeCompare(b.mode + b.label));
writeFileSync(output, JSON.stringify(runs, null, 2) + "\n");
const gb = (b) => (b ? (b / 2 ** 30).toFixed(2) : "-");
for (const r of runs) {
  const s = r.split;
  const heaps = Object.entries(r.memory.heapPeak)
    .map(([k, v]) => `${k}=${gb(v.usedBytes)}`)
    .join(" ");
  console.log(
    [
      r.mode,
      r.label,
      `worker ${s.routeWorkerCreated}`,
      `cache dl ${s.directionsCacheDownloaded} adm ${s.directionsCacheAdmitted}`,
      `result ${s.routeResultMessage}`,
      `paint ${s.firstRoutePaint}`,
      `term ${s.routeWorkerTerminated}`,
      `plan ${s.planRequested}/${s.planDownloaded}`,
      `decode ${s.detailDecodeStart}->${s.detailDecodeEnd} (chunks ${s.detailLastChunkDownloaded})`,
      `ready ${s.floorReady}`,
      r.laterRoute
        ? `later ${r.laterRoute.routeShown}/${r.laterRoute.floorReady}`
        : "",
      `rss ${gb(r.memory.rendererPeakRssBytes)}`,
      heaps,
      r.distance,
    ].join(" | "),
  );
}
