// Collect per-journey browser timings from profile-route.mjs timing JSON files.
//   node summarize-timings.mjs OUT.json VARIANT=DIR ...
// Metrics per journey (seconds from the Get directions click):
//   workerResponse: route worker posted its result (page-side message event)
//   statusShown:    route status shows the distance (what the visitor sees first)
//   readyAfterShown: as the original proof-link-route.mjs measured it: status
//                   shown AND visitor-render-status ready (detail floor drawn)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [out, ...inputs] = process.argv.slice(2);
const rows = [];
for (const input of inputs) {
  const [variant, dir] = input.split("=");
  for (const file of readdirSync(dir).filter((f) =>
    f.endsWith("-timing.json"),
  )) {
    const t = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const log = t.log;
    for (const name of ["corridor-default", "office-transit"]) {
      const requested = log.find((r) => r.stage === `${name}:requested`);
      const shown = log.find((r) => r.stage === `${name}:shown`);
      const idx = log.indexOf(requested);
      const response = log
        .slice(idx)
        .find((r) => r.stage === "worker:response" && r.kind === "route");
      const request = log
        .slice(0, idx + 1)
        .reverse()
        .find((r) => r.stage === "worker:request");
      const result = t.results.find((r) => r.name === name);
      rows.push({
        variant,
        mode: t.mode,
        run: t.label,
        journey: name,
        freshWorker: !!request?.withDelivery,
        workerResponse: response
          ? +(response.seconds - requested.seconds).toFixed(3)
          : null,
        statusShown: result?.requestToShownSeconds,
        readyAfterShown: +(shown.seconds - requested.seconds).toFixed(3),
        statusText: result?.statusText,
        stepCount: response?.stepCount,
        responseSha256: response?.bodySha256,
        pageErrors: log.filter((r) => r.stage === "pageerror").length,
      });
    }
  }
}
writeFileSync(out, JSON.stringify(rows, null, 2));
for (const r of rows)
  console.log(
    [
      r.variant,
      r.mode,
      r.run,
      r.journey,
      r.freshWorker ? "fresh" : "reused",
      r.workerResponse,
      r.statusShown,
      r.readyAfterShown,
      r.statusText,
      r.stepCount,
      r.responseSha256?.slice(0, 12),
      r.pageErrors,
    ].join("\t"),
  );
