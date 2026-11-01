// Browser timing and route-worker CPU profiling for the progressive visitor.
// Based on docs/continuation/unbc-20261031/release-gates/proof-link-route.mjs
// (same journeys, same UI actions). Additions:
//  - every route-worker message (request/response) is timestamped in the page
//    by wrapping Worker.prototype.postMessage / message events (no behaviour change);
//  - worker creation / termination is timestamped;
//  - with --profile, a raw CDP connection auto-attaches to each
//    progressive-route worker before it runs, starts the V8 sampling profiler and
//    saves one .cpuprofile per worker. In that mode Worker.prototype.terminate is
//    deferred until the profile has been collected (so profiling runs are not
//    timing runs).
//   node profile-route.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile LABEL [--profile] [--port=9333]
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [appUrl, manifestUrl, out, mode, label] = args.filter(
  (a) => !a.startsWith("--"),
);
const profile = flags.has("--profile");
const profileMatch = new RegExp(
  [...flags].find((f) => f.startsWith("--match="))?.slice(8) ??
    "progressive-route",
);
const port = Number(
  [...flags].find((f) => f.startsWith("--port="))?.slice(7) ?? 9333,
);
mkdirSync(out, { recursive: true });
const progressFile = `${out}/${mode}-${label}-progress.jsonl`;
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--js-flags=--max-old-space-size=6144",
    ...(profile ? [`--remote-debugging-port=${port}`] : []),
  ],
});
const context = await browser.newContext(
  mode === "mobile"
    ? (({ defaultBrowserType, ...d }) => d)(devices["iPhone 13"])
    : { viewport: { width: 1440, height: 900 } },
);
const log = [];
const t0 = Date.now();
const mark = (stage, extra = {}) => {
  const row = { mode, stage, seconds: (Date.now() - t0) / 1000, ...extra };
  log.push(row);
  appendFileSync(progressFile, JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
};

// ---- raw CDP worker profiler -------------------------------------------
const profiles = [];
let cdp;
const pendingStops = new Map();
if (profile) {
  const version = await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json();
  cdp = await new Promise((resolve, reject) => {
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    let id = 0;
    const waiting = new Map();
    const listeners = [];
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && waiting.has(msg.id)) {
        const { ok, fail } = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) fail(new Error(JSON.stringify(msg.error)));
        else ok(msg.result);
      } else for (const l of listeners) l(msg);
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}, sessionId) =>
          new Promise((ok, fail) => {
            const mid = ++id;
            waiting.set(mid, { ok, fail });
            ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
          }),
        on: (l) => listeners.push(l),
        close: () => ws.close(),
      });
  });
  const workers = new Map(); // sessionId -> info
  cdp.on(async (msg) => {
    if (msg.method === "Target.attachedToTarget") {
      const { sessionId, targetInfo, waitingForDebugger } = msg.params;
      const isRoute =
        targetInfo.type === "worker" &&
        profileMatch.test(targetInfo.title + " " + targetInfo.url);
      try {
        if (isRoute) {
          const n = workers.size + 1;
          workers.set(sessionId, { n, targetInfo });
          await cdp.send("Profiler.enable", {}, sessionId);
          await cdp.send(
            "Profiler.setSamplingInterval",
            { interval: 1000 },
            sessionId,
          );
          await cdp.send("Profiler.start", {}, sessionId);
          mark(`route-worker-${n}:profiler-started`, {
            title: targetInfo.title,
          });
        } else if (targetInfo.type === "worker" || targetInfo.type === "page")
          await cdp
            .send(
              "Target.setAutoAttach",
              { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
              sessionId,
            )
            .catch(() => {});
      } finally {
        if (waitingForDebugger)
          await cdp
            .send("Runtime.runIfWaitingForDebugger", {}, sessionId)
            .catch(() => {});
      }
    }
  });
  // Called from the page before a route worker is terminated.
  pendingStops.stopAll = async () => {
    for (const [sessionId, info] of workers) {
      if (info.stopped) continue;
      info.stopped = true;
      try {
        const { profile: p } = await cdp.send("Profiler.stop", {}, sessionId);
        const file = `${out}/${mode}-${label}-route-worker-${info.n}.cpuprofile`;
        writeFileSync(file, JSON.stringify(p));
        profiles.push(file);
        mark(`route-worker-${info.n}:profile-saved`, { file });
      } catch (error) {
        mark(`route-worker-${info.n}:profile-failed`, {
          error: String(error),
        });
      }
    }
  };
  const targets = await cdp.send("Target.getTargets");
  void targets;
  // Attach to every page created in this context (the one below).
  cdp.on(async (msg) => {
    if (
      msg.method === "Target.targetCreated" &&
      msg.params.targetInfo.type === "page"
    )
      await cdp
        .send("Target.attachToTarget", {
          targetId: msg.params.targetInfo.targetId,
          flatten: true,
        })
        .catch(() => {});
  });
  await cdp.send("Target.setDiscoverTargets", { discover: true });
  await context.exposeBinding("__oimProfileStop", async () => {
    await pendingStops.stopAll();
  });
}
// ---- page instrumentation ---------------------------------------------
let responseCount = 0;
await context.exposeBinding("__oimWorkerEvent", async (_source, row) => {
  if (row.body) {
    const { createHash } = await import("node:crypto");
    const file = `${out}/${mode}-${label}-response-${++responseCount}.json`;
    writeFileSync(file, row.body);
    row = {
      ...row,
      body: undefined,
      bodyFile: file,
      bodySha256: createHash("sha256").update(row.body).digest("hex"),
      bodyBytes: row.body.length,
    };
  }
  mark(`worker:${row.event}`, row);
});
await context.addInitScript(
  ({ profile, match }) => {
    const NativeWorker = globalThis.Worker;
    if (!NativeWorker) return;
    const post = NativeWorker.prototype.postMessage;
    const terminate = NativeWorker.prototype.terminate;
    const isRoute = (w) => /progressive-route/.test(w.__oimName ?? "");
    const isProfiled = (w) => new RegExp(match).test(w.__oimName ?? "");
    globalThis.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__oimName = options?.name ?? String(url);
        if (isRoute(this)) {
          globalThis.__oimWorkerEvent?.({
            event: "created",
            name: this.__oimName,
          });
          this.addEventListener("message", (e) => {
            const d = e.data ?? {};
            globalThis.__oimWorkerEvent?.({
              event: "response",
              requestId: d.requestId,
              kind:
                "prepared" in d ? "prepared" : "error" in d ? "error" : "route",
              error: d.error,
              distanceMetres: d.value?.route?.distanceMetres,
              stepCount: d.steps?.length,
              body:
                "value" in d
                  ? JSON.stringify(
                      { value: d.value, steps: d.steps, summary: d.summary },
                      (_k, v) =>
                        v instanceof Set
                          ? { $set: [...v].sort() }
                          : v instanceof Map
                            ? { $map: [...v] }
                            : v,
                    )
                  : undefined,
            });
          });
        }
      }
    };
    NativeWorker.prototype.postMessage = function (message, ...rest) {
      if (isRoute(this))
        globalThis.__oimWorkerEvent?.({
          event: "request",
          requestId: message?.requestId,
          prepareOnly: !!message?.prepareOnly,
          withDelivery: !!message?.delivery,
          start: message?.start,
          end: message?.end,
          options: message?.options,
        });
      return post.call(this, message, ...rest);
    };
    NativeWorker.prototype.terminate = function () {
      if (!isRoute(this) && !isProfiled(this)) return terminate.call(this);
      globalThis.__oimWorkerEvent?.({
        event: "terminate",
        name: this.__oimName,
      });
      if (profile && globalThis.__oimProfileStop) {
        globalThis.__oimProfileStop().finally(() => terminate.call(this));
        return;
      }
      return terminate.call(this);
    };
  },
  { profile, match: profileMatch.source },
);

const page = await context.newPage();
page.on("pageerror", (e) => mark("pageerror", { error: String(e) }));
page.on("console", (m) => {
  if (m.type() === "error") mark("console-error", { text: m.text() });
});
const ready = () =>
  page
    .locator('[data-testid="visitor-render-status"][data-state="ready"]')
    .waitFor({ timeout: 900_000 });
await page.goto(
  `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}`,
);
await ready();
mark("floor-ready");
await page.getByText("Directions", { exact: true }).click();

const results = [];
async function route(name, from, to, transit) {
  const change = page.getByText("Change journey", { exact: true });
  if (await change.isVisible().catch(() => false)) await change.click();
  const box = page.getByLabel("Allow paths through other rooms");
  if ((await box.isChecked()) !== transit) await box.setChecked(transit);
  await page.getByLabel("From", { exact: true }).selectOption(from);
  await page.getByLabel("To", { exact: true }).selectOption(to);
  const requested = Date.now();
  await page
    .getByRole("button", { name: "Get directions", exact: true })
    .click();
  mark(`${name}:requested`);
  await page.getByTestId("route-status").waitFor({ timeout: 900_000 });
  await page.waitForFunction(
    () => {
      const s =
        document.querySelector('[data-testid="route-status"]')?.textContent ??
        "";
      return (
        /\d+\s*m\b|No route|not available|unavailable|No hallway/i.test(s) &&
        !/preparing|checking|loading/i.test(s)
      );
    },
    null,
    { timeout: 1_800_000, polling: 100 },
  );
  const shown = Date.now();
  await ready();
  const statusText = (
    await page.getByTestId("route-status").textContent()
  )?.trim();
  const steps = await page
    .locator('[data-testid="route-step-context"]')
    .allTextContents();
  const instructions = await page
    .locator('[data-testid="route-step"], [data-testid="route-step-text"]')
    .allTextContents()
    .catch(() => []);
  mark(`${name}:shown`, {
    statusText,
    requestToShownSeconds: (shown - requested) / 1000,
    stepCount: steps.length,
  });
  results.push({
    name,
    from,
    to,
    transit,
    statusText,
    requestToShownSeconds: (shown - requested) / 1000,
    steps,
    instructions,
  });
  await page.screenshot({ path: `${out}/${mode}-${label}-${name}.png` });
}
await route(
  "corridor-default",
  "rm-694-2b971ef6dc47",
  "rm-694-43988ffdc334",
  false,
);
await route(
  "office-transit",
  "rm-694-072a835d76b9",
  "rm-694-0179b206bb5d",
  true,
);
if (profile) await pendingStops.stopAll();
writeFileSync(
  `${out}/${mode}-${label}-timing.json`,
  JSON.stringify(
    { appUrl, manifestUrl, mode, label, profile, results, profiles, log },
    null,
    2,
  ),
);
cdp?.close();
await browser.close();
