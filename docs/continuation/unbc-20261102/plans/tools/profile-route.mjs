// Split-timing collector for the progressive visitor's first route.
// Adapted from docs/continuation/unbc-20261101/latency/tools/profile-route.mjs
// (same UI actions, same default journey). Nothing in the page changes
// behaviour: the collector only observes.
//
//   node profile-route.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile LABEL
//        [--port=9333] [--later] [--profile=progressive-floor|progressive-route]
//
// Timestamps (seconds from collector start, plus "sinceRequest" for every
// mark after the request):
//  - page:            navigation, initial floor ready, request (click)
//  - route worker:    created, request/response messages (page side),
//                     routing + directions-cache downloads finished (CDP
//                     Network in the worker), cache admitted (the IndexedDB
//                     write of the carrier, which prepareProgressiveRouteCalculator
//                     performs only after decodePublishedRouteCells and
//                     createPublishedRouteCalculator succeed), terminate
//  - floor worker:    created, detail request posted (decode start), last
//                     detail chunk downloaded, response (decode end), terminate
//  - plan:            /data/unbc-plans/ carriers requested/finished (page)
//  - DOM:             every change of route-status text and of
//                     visitor-render-status data-state (MutationObserver), so
//                     "route shown" = first status text with a distance and
//                     "floor ready" = first data-state=ready after it
//  - memory:          per-worker and page V8 heap (CDP Runtime.getHeapUsage,
//                     polled every 500 ms) and renderer-process RSS (/proc)
// With --profile=<name match> a V8 CPU profile is saved for each matching
// worker; profiling runs are not timing runs.
import { chromium, devices } from "playwright";
import {
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const flag = (name) =>
  flags.find((f) => f === `--${name}` || f.startsWith(`--${name}=`));
const [appUrl, manifestUrl, out, mode, label] = args.filter(
  (a) => !a.startsWith("--"),
);
if (
  !appUrl ||
  !manifestUrl ||
  !out ||
  !["desktop", "mobile"].includes(mode) ||
  !label
)
  throw new Error(
    "Usage: profile-route.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile LABEL [--port=N] [--later] [--profile=match]",
  );
const port = Number(flag("port")?.split("=")[1] ?? 9333);
const later = !!flag("later");
const profileMatch = flag("profile")?.split("=")[1];
mkdirSync(out, { recursive: true });
const progressFile = `${out}/${mode}-${label}-progress.jsonl`;
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--js-flags=--max-old-space-size=6144",
    `--remote-debugging-port=${port}`,
  ],
});
const context = await browser.newContext(
  mode === "mobile"
    ? (({ defaultBrowserType, ...d }) => d)(devices["iPhone 13"])
    : { viewport: { width: 1440, height: 900 } },
);
const log = [];
const t0 = Date.now();
let requestedAt;
const mark = (stage, extra = {}) => {
  const now = Date.now();
  const row = {
    mode,
    stage,
    seconds: (now - t0) / 1000,
    ...(requestedAt ? { sinceRequest: (now - requestedAt) / 1000 } : {}),
    ...extra,
  };
  log.push(row);
  appendFileSync(progressFile, JSON.stringify(row) + "\n");
  if (!/heap-sample/.test(stage)) console.log(JSON.stringify(row));
  return row;
};

// ---- renderer RSS (/proc) ------------------------------------------------
const browserPids = () => {
  const pids = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const cmd = readFileSync(`/proc/${name}/cmdline`, "utf8");
      if (cmd.includes(`--remote-debugging-port=${port}`)) pids.push(name);
    } catch {}
  }
  return pids;
};
const children = (root) => {
  const all = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const ppid = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1];
      all.push([name, ppid]);
    } catch {}
  }
  const found = new Set(root);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of all)
      if (found.has(ppid) && !found.has(pid)) {
        found.add(pid);
        grew = true;
      }
  }
  return [...found];
};
const rss = (pid) => {
  try {
    const m = /VmRSS:\s+(\d+)/.exec(
      readFileSync(`/proc/${pid}/status`, "utf8"),
    );
    return m ? Number(m[1]) * 1024 : 0;
  } catch {
    return 0;
  }
};
const memory = {
  rendererPeakRssBytes: 0,
  allProcessesPeakRssBytes: 0,
  heapPeak: {},
};
const rootPids = browserPids();
const rssTimer = setInterval(() => {
  let renderer = 0,
    total = 0;
  for (const pid of children(rootPids)) {
    const bytes = rss(pid);
    total += bytes;
    try {
      if (
        readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("--type=renderer")
      )
        renderer += bytes;
    } catch {}
  }
  memory.rendererPeakRssBytes = Math.max(memory.rendererPeakRssBytes, renderer);
  memory.allProcessesPeakRssBytes = Math.max(
    memory.allProcessesPeakRssBytes,
    total,
  );
}, 500);

// ---- CDP: workers (network, cache admission, heap, optional profile) ------
const version = await (
  await fetch(`http://127.0.0.1:${port}/json/version`)
).json();
const cdp = await new Promise((resolve, reject) => {
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
const sessions = new Map(); // sessionId -> { kind, n, title, requests }
const kindOf = (title) =>
  /progressive-route/.test(title)
    ? "route"
    : /progressive-floor/.test(title)
      ? "floor"
      : "other";
const counters = { route: 0, floor: 0, other: 0, page: 0 };
// Inside a worker (before it runs): report IndexedDB asset writes. The key is
// the content hash, never content. Only the stage and key prefix leave.
const workerProbe = `(() => {
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    try {
      if (this.name === "assets" && typeof key === "string")
        console.debug("[oim-probe]" + JSON.stringify({ event: "idb-put", key: key.slice(0, 16) }));
    } catch {}
    return put.apply(this, arguments);
  };
})();`;
const carrierPrefix = "dec83a467f07fdf1"; // directions-cache carrier sha prefix
cdp.on(async (msg) => {
  const { sessionId } = msg;
  if (msg.method === "Target.attachedToTarget") {
    const { sessionId: child, targetInfo, waitingForDebugger } = msg.params;
    try {
      if (targetInfo.type === "worker") {
        const kind = kindOf(targetInfo.title + " " + targetInfo.url);
        const n = ++counters[kind];
        sessions.set(child, {
          kind,
          n,
          title: targetInfo.title,
          requests: new Map(),
        });
        if (kind !== "other") {
          await cdp.send("Runtime.enable", {}, child);
          await cdp.send(
            "Runtime.evaluate",
            { expression: workerProbe },
            child,
          );
          await cdp.send("Network.enable", {}, child).catch((error) =>
            mark(`${kind}-worker-${n}:network-unavailable`, {
              error: String(error),
            }),
          );
          if (profileMatch && new RegExp(profileMatch).test(targetInfo.title)) {
            await cdp.send("Profiler.enable", {}, child);
            await cdp.send(
              "Profiler.setSamplingInterval",
              { interval: 1000 },
              child,
            );
            await cdp.send("Profiler.start", {}, child);
            sessions.get(child).profiling = true;
          }
          mark(`${kind}-worker-${n}:attached`);
        }
      } else if (targetInfo.type === "page") {
        sessions.set(child, {
          kind: "page",
          n: ++counters.page,
          requests: new Map(),
        });
        await cdp
          .send(
            "Target.setAutoAttach",
            { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
            child,
          )
          .catch(() => {});
      }
    } finally {
      if (waitingForDebugger)
        await cdp
          .send("Runtime.runIfWaitingForDebugger", {}, child)
          .catch(() => {});
    }
    return;
  }
  if (msg.method === "Target.detachedFromTarget") {
    const s = sessions.get(msg.params.sessionId);
    if (s && s.kind !== "page" && s.kind !== "other") {
      mark(`${s.kind}-worker-${s.n}:detached`);
      s.detached = true;
    }
    return;
  }
  const s = sessions.get(sessionId);
  if (!s || s.kind === "other") return;
  const who = `${s.kind}-worker-${s.n}`;
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = msg.params.args?.[0]?.value;
    if (typeof text === "string" && text.startsWith("[oim-probe]")) {
      const probe = JSON.parse(text.slice(11));
      if (probe.event === "idb-put")
        mark(
          probe.key === carrierPrefix
            ? `${who}:directions-cache-admitted`
            : `${who}:idb-put`,
          { key: probe.key },
        );
    }
  } else if (msg.method === "Network.requestWillBeSent") {
    s.requests.set(msg.params.requestId, msg.params.request.url);
  } else if (msg.method === "Network.loadingFinished") {
    const url = s.requests.get(msg.params.requestId) ?? "";
    const path = new URL(url, "http://x/").pathname;
    let what = "download";
    if (/\/data\/unbc-routing\//.test(path))
      what = "directions-cache-downloaded";
    else if (/\.part$/.test(path)) what = "routing-part-downloaded";
    mark(`${who}:${what}`, {
      path: path.split("/").slice(-2).join("/"),
      encodedBytes: msg.params.encodedDataLength,
    });
  }
});
await cdp.send("Target.setDiscoverTargets", { discover: true });
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
const heapTimer = setInterval(async () => {
  for (const [sessionId, s] of sessions) {
    if (s.kind === "other" || s.detached) continue;
    const key = `${s.kind}-${s.n}`;
    try {
      const { usedSize, totalSize } = await cdp.send(
        "Runtime.getHeapUsage",
        {},
        sessionId,
      );
      const peak = memory.heapPeak[key] ?? { usedBytes: 0, totalBytes: 0 };
      if (usedSize > peak.usedBytes) peak.usedBytes = usedSize;
      if (totalSize > peak.totalBytes) peak.totalBytes = totalSize;
      memory.heapPeak[key] = peak;
    } catch {}
  }
}, 500);

// ---- page instrumentation ---------------------------------------------
await context.exposeBinding("__oimEvent", async (_source, row) => {
  mark(row.stage, row.extra ?? {});
});
await context.addInitScript(() => {
  const report = (stage, extra) => globalThis.__oimEvent?.({ stage, extra });
  const NativeWorker = globalThis.Worker;
  if (NativeWorker) {
    const post = NativeWorker.prototype.postMessage;
    const terminate = NativeWorker.prototype.terminate;
    const kind = (w) =>
      /progressive-route/.test(w.__oimName ?? "")
        ? "route"
        : /progressive-floor/.test(w.__oimName ?? "")
          ? "floor"
          : undefined;
    const counts = { route: 0, floor: 0 };
    globalThis.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        this.__oimName = options?.name ?? String(url);
        const k = kind(this);
        if (!k) return;
        this.__oimLabel = `${k}-worker-${++counts[k]}`;
        report(`${this.__oimLabel}:created`);
        this.addEventListener("message", (e) => {
          const d = e.data ?? {};
          if (k === "route")
            report(`${this.__oimLabel}:response`, {
              kind:
                "prepared" in d ? "prepared" : "error" in d ? "error" : "route",
              requestId: d.requestId,
              error: d.error,
              distanceMetres: d.value?.route?.distanceMetres,
              stepCount: d.steps?.length,
            });
          else
            report(`${this.__oimLabel}:response`, {
              kind: d.error ? "error" : d.display ? "detail" : "other",
              error: d.error,
            });
        });
      }
    };
    NativeWorker.prototype.postMessage = function (message, ...rest) {
      if (this.__oimLabel)
        report(`${this.__oimLabel}:request`, {
          prepareOnly: !!message?.prepareOnly,
          withDelivery: !!message?.delivery,
          scopeId: message?.scopeId?.slice?.(0, 20),
          start: message?.start,
          end: message?.end,
        });
      return post.call(this, message, ...rest);
    };
    NativeWorker.prototype.terminate = function () {
      if (this.__oimLabel) report(`${this.__oimLabel}:terminate`);
      return terminate.call(this);
    };
  }
  // DOM state transitions (route status text, render status state).
  let lastStatus, lastRender;
  const check = () => {
    const status =
      document
        .querySelector('[data-testid="route-status"]')
        ?.textContent?.trim() ?? "";
    const render =
      document
        .querySelector('[data-testid="visitor-render-status"]')
        ?.getAttribute("data-state") ?? "";
    if (status !== lastStatus) {
      lastStatus = status;
      report("dom:route-status", { text: status.slice(0, 160) });
    }
    if (render !== lastRender) {
      lastRender = render;
      report("dom:render-status", { state: render });
    }
  };
  const start = () => {
    new MutationObserver(check).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    check();
  };
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start);
});

const page = await context.newPage();
page.on("pageerror", (e) => mark("pageerror", { error: String(e) }));
page.on("console", (m) => {
  if (m.type() === "error")
    mark("console-error", { text: m.text().slice(0, 300) });
});
page.on("request", (r) => {
  if (/\/data\/unbc-plans\//.test(r.url()))
    mark("page:plan-requested", {
      path: new URL(r.url()).pathname.split("/").pop(),
    });
});
page.on("requestfinished", (r) => {
  if (/\/data\/unbc-plans\//.test(r.url()))
    mark("page:plan-downloaded", {
      path: new URL(r.url()).pathname.split("/").pop(),
    });
});
const ready = () =>
  page
    .locator('[data-testid="visitor-render-status"][data-state="ready"]')
    .waitFor({ timeout: 900_000 });
mark("navigate");
await page.goto(
  `${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}`,
);
await ready();
mark("initial-floor-ready");
await page.getByText("Directions", { exact: true }).click();

const results = [];
async function route(name, from, to, transit) {
  const change = page.getByText("Change journey", { exact: true });
  if (await change.isVisible().catch(() => false)) await change.click();
  const box = page.getByLabel("Allow paths through other rooms");
  if ((await box.isChecked()) !== transit) await box.setChecked(transit);
  await page.getByLabel("From", { exact: true }).selectOption(from);
  await page.getByLabel("To", { exact: true }).selectOption(to);
  const button = page.getByRole("button", {
    name: "Get directions",
    exact: true,
  });
  await button.waitFor();
  // Directions stay disabled while a floor loads; record how long.
  const enabledWait = Date.now();
  while (await button.isDisabled()) await page.waitForTimeout(100);
  if (Date.now() - enabledWait > 150)
    mark(`${name}:button-was-disabled`, {
      seconds: (Date.now() - enabledWait) / 1000,
    });
  requestedAt = Date.now();
  await button.click();
  mark(`${name}:requested`);
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
  mark(`${name}:route-shown`);
  // The route result switches to the start's floor and focuses it; wait until
  // that floor is drawn (the first data-state=ready at or after the result).
  await page.waitForTimeout(250);
  await ready();
  const floorReady = Date.now();
  mark(`${name}:floor-ready`);
  const statusText = (
    await page.getByTestId("route-status").textContent()
  )?.trim();
  const steps = await page
    .locator('[data-testid="route-step-context"]')
    .allTextContents();
  results.push({
    name,
    from,
    to,
    transit,
    statusText,
    requestToRouteShownSeconds: (shown - requestedAt) / 1000,
    requestToFloorReadySeconds: (floorReady - requestedAt) / 1000,
    stepCount: steps.length,
  });
  await page.screenshot({ path: `${out}/${mode}-${label}-${name}.png` });
  requestedAt = undefined;
}
await route(
  "corridor-default",
  "rm-694-2b971ef6dc47",
  "rm-694-43988ffdc334",
  false,
);
if (later)
  await route(
    "office-transit",
    "rm-694-072a835d76b9",
    "rm-694-0179b206bb5d",
    true,
  );
// Let late worker terminations / heap samples land.
await page.waitForTimeout(1500);
const profiles = [];
for (const [sessionId, s] of sessions) {
  if (!s.profiling || s.detached) continue;
  try {
    const { profile } = await cdp.send("Profiler.stop", {}, sessionId);
    const file = `${out}/${mode}-${label}-${s.kind}-worker-${s.n}.cpuprofile`;
    writeFileSync(file, JSON.stringify(profile));
    profiles.push(file);
  } catch (error) {
    mark("profile-failed", { error: String(error) });
  }
}
clearInterval(rssTimer);
clearInterval(heapTimer);
const loadAverage = readFileSync("/proc/loadavg", "utf8").trim();
writeFileSync(
  `${out}/${mode}-${label}-timing.json`,
  JSON.stringify(
    {
      appUrl,
      manifestUrl,
      mode,
      label,
      results,
      memory,
      loadAverage,
      profiles,
      log,
    },
    null,
    2,
  ),
);
cdp.close();
await browser.close();
