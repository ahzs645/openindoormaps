// Asserted, timed browser proof of the 8 visitor journeys on the final app.
// Extends ../../visitor/proof-chosen-candidate-asserted.mjs (same UI actions,
// same journeys file, same assertions) with:
//  - identity: IDENTITY.json from collect-identity.ts is embedded and checked
//    against what the page actually received (manifest revision, manifest file
//    hash, candidate and visitor hashes in the manifest provenance, the
//    directions carrier URL the route worker fetched, and every plan carrier
//    fetched is an admitted plan receipt of this revision);
//  - timings per journey from the "Get directions" click: final route-status
//    text, route paint (first map frame with the drawn route line, from
//    half-scale CDP captures of the map canvas polled after the click; the
//    value is the end of the first capture that shows the line, and the end of
//    the previous capture is recorded as a lower bound), and floor ready;
//  - browser version and host load average at start, per journey and at end.
// Exits non-zero on any page error, wrong identity, unexpected route/refusal,
// distance outside tolerance, refusal text mismatch, a route without
// instructions, or a route whose line is never drawn.
//
//   node proof-final-journeys.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile JOURNEYS.json IDENTITY.json RUN_LABEL
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const [appUrl, manifestUrl, out, mode, journeysPath, identityPath, runLabel] =
  process.argv.slice(2);
if (
  !appUrl ||
  !manifestUrl ||
  !out ||
  !["desktop", "mobile"].includes(mode) ||
  !journeysPath ||
  !identityPath ||
  !runLabel
)
  throw new Error(
    "Usage: APP_URL MANIFEST_URL OUT_DIR desktop|mobile JOURNEYS.json IDENTITY.json RUN_LABEL",
  );
const plan = JSON.parse(readFileSync(journeysPath, "utf8"));
const identity = JSON.parse(readFileSync(identityPath, "utf8"));
if (plan.expectedRevisionSha256 !== identity.manifestRevisionSha256)
  throw new Error("JOURNEYS.json and IDENTITY.json name different revisions");
mkdirSync(out, { recursive: true });
const loadAverage = () => readFileSync("/proc/loadavg", "utf8").trim();
const failures = [];
const fail = (message) => {
  failures.push(message);
  console.log(JSON.stringify({ FAIL: message }));
};
const loadAverageAtStart = loadAverage();
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--js-flags=--max-old-space-size=6144"],
});
const browserVersion = browser.version();
const context = await browser.newContext(
  mode === "mobile"
    ? (({ defaultBrowserType: _, ...d }) => d)(devices["iPhone 13"])
    : { viewport: { width: 1440, height: 900 } },
);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const userAgent = await page.evaluate(() => navigator.userAgent);
const log = [],
  pageErrors = [],
  consoleErrors = [],
  failedRequests = [],
  manifestResponses = [],
  dataRequests = [];
const t0 = Date.now();
const mark = (stage, extra = {}) => {
  const row = { mode, stage, seconds: (Date.now() - t0) / 1000, ...extra };
  log.push(row);
  console.log(JSON.stringify(row));
};
page.on("pageerror", (e) => {
  pageErrors.push(String(e));
  fail(`page error: ${e}`);
});
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("requestfailed", (r) =>
  failedRequests.push({ url: r.url(), error: r.failure()?.errorText }),
);
// Page and dedicated-worker requests for routing and plan carriers.
page.on("requestfinished", async (r) => {
  const p = new URL(r.url()).pathname;
  if (!/\/data\/unbc-(routing|plans)\//.test(p)) return;
  const response = await r.response().catch(() => null);
  dataRequests.push({
    path: p,
    status: response?.status(),
    seconds: (Date.now() - t0) / 1000,
  });
});
page.on("response", async (r) => {
  if (r.url().split("?")[0] !== manifestUrl) return;
  try {
    const body = await r.body();
    const value = JSON.parse(body.toString());
    manifestResponses.push({
      status: r.status(),
      sha256: createHash("sha256").update(body).digest("hex"),
      revisionSha256: value.revisionSha256,
      packageSha256: value.provenance?.packageSha256,
      datasetSha256: value.provenance?.datasetSha256,
    });
  } catch (error) {
    manifestResponses.push({ status: r.status(), error: String(error) });
  }
});
// One cheap in-page sampler: route status text, render state and the floor
// loading notice, timestamped on the page clock (epoch ms).
await page.addInitScript(() => {
  const samples = [];
  let last = "";
  const now = () => performance.timeOrigin + performance.now();
  window.__proof = { samples, clicks: [] };
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button")?.textContent?.trim() === "Get directions"
      )
        window.__proof.clicks.push(now());
    },
    true,
  );
  setInterval(() => {
    const status =
      document.querySelector('[data-testid="route-status"]')?.textContent ?? "";
    const render =
      document
        .querySelector('[data-testid="visitor-render-status"]')
        ?.getAttribute("data-state") ?? "";
    const loading = !!document.querySelector(".visitor-loading");
    const key = JSON.stringify([status, render, loading]);
    if (key !== last) {
      last = key;
      samples.push({ t: now(), status, render, loading });
    }
  }, 50);
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
mark("floor-ready");
// The manifest the app actually received, and an independent fetch.
const fetched = await page.evaluate(async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  return (await r.json()).revisionSha256;
}, manifestUrl);
if (fetched !== identity.manifestRevisionSha256)
  fail(`manifest revision ${fetched} != ${identity.manifestRevisionSha256}`);
if (manifestResponses.length === 0) fail("app manifest response not observed");
for (const r of manifestResponses) {
  if (r.revisionSha256 !== identity.manifestRevisionSha256)
    fail(`app received manifest revision ${r.revisionSha256}`);
  if (r.sha256 !== identity.manifestFileSha256)
    fail(`app received manifest file ${r.sha256}`);
  if (r.packageSha256 !== identity.candidateSha256)
    fail(`manifest names candidate ${r.packageSha256}`);
  if (r.datasetSha256 !== identity.visitorSha256)
    fail(`manifest names visitor ${r.datasetSha256}`);
}
mark("manifest", { fetchedRevisionSha256: fetched, manifestResponses });
await page.getByText("Directions", { exact: true }).click();

const finalStatus = (s) =>
  /^\d+\s*m$/.test(s.trim()) ||
  (/No |unavailable|not available/i.test(s) && !/Loading|checking/i.test(s));

// ---- route-line pixels ----------------------------------------------------
// Route line colour #38b5eb (56,181,235), as drawn by RouteOverlay.
const isRoute = (r, g, b) =>
  Math.abs(r - 56) <= 14 && Math.abs(g - 181) <= 14 && Math.abs(b - 235) <= 14;
function decodePng(buf) {
  let p = 8,
    width,
    height,
    type,
    depth,
    interlace;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p),
      kind = buf.toString("ascii", p + 4, p + 8),
      data = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![2, 6].includes(type))
    throw new Error(`unsupported PNG (depth ${depth}, type ${type})`);
  const bpp = type === 6 ? 4 : 3,
    stride = width * bpp,
    raw = inflateSync(Buffer.concat(idat)),
    px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)],
      row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
      o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0,
        b = y > 0 ? px[o - stride + x] : 0,
        c = x >= bpp && y > 0 ? px[o - stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c),
          pb = Math.abs(a - c),
          pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[o + x] = v & 255;
    }
  }
  return { width, height, bpp, px };
}
const countRoute = ({ px, bpp }) => {
  let n = 0;
  for (let i = 0; i < px.length; i += bpp)
    if (isRoute(px[i], px[i + 1], px[i + 2])) n++;
  return n;
};
async function canvasClip() {
  const box = await page.locator("canvas.maplibregl-canvas").first().boundingBox();
  return box;
}
/** Half-scale capture of the map canvas area; returns route-colour pixels. */
async function quickRoutePixels(clip) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 0.5 },
  });
  return countRoute(decodePng(Buffer.from(data, "base64")));
}
/** Full-resolution count, as in the original asserted proof. */
async function routePixels() {
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  return countRoute(decodePng(await canvas.screenshot()));
}
const PAINT_THRESHOLD = 20; // half-scale pixels
const DRAWN_THRESHOLD = 40; // full-resolution pixels (original proof)

const results = [];
async function journey(j) {
  const change = page.getByText("Change journey", { exact: true });
  if (await change.isVisible().catch(() => false)) await change.click();
  await page.getByLabel("Route preference").selectOption(j.profile);
  const box = page.getByLabel("Allow paths through other rooms");
  if ((await box.isChecked()) !== j.allowOtherRoomTransit)
    await box.setChecked(j.allowOtherRoomTransit);
  await page.getByLabel("From", { exact: true }).selectOption(j.from);
  await page.getByLabel("To", { exact: true }).selectOption(j.to);
  const button = page.getByRole("button", { name: "Get directions", exact: true });
  await button.waitFor();
  const enabledWait = Date.now();
  while (await button.isDisabled()) await page.waitForTimeout(100);
  const buttonDisabledSeconds = (Date.now() - enabledWait) / 1000;
  const before = await routePixels();
  const clip = await canvasClip();
  const quickBefore = await quickRoutePixels(clip);
  const sampleStart = await page.evaluate(() => window.__proof.samples.length);
  const loadAverageAtRequest = loadAverage();
  await button.click();
  mark(`${j.label}:requested`);
  // Route-paint poller, concurrent with the status and floor waits.
  const paint = {
    stop: false,
    captures: 0,
    firstAt: undefined,
    lowerBound: undefined,
    maxPixels: 0,
    captureSeconds: [],
  };
  let lastWithout = Date.now();
  const poller = (async () => {
    while (!paint.stop) {
      const began = Date.now();
      let n;
      try {
        n = await quickRoutePixels(clip);
      } catch {
        break;
      }
      const ended = Date.now();
      paint.captures++;
      paint.captureSeconds.push((ended - began) / 1000);
      paint.maxPixels = Math.max(paint.maxPixels, n);
      if (n >= PAINT_THRESHOLD && paint.firstAt === undefined) {
        paint.firstAt = ended;
        paint.lowerBound = lastWithout;
        if (j.expect === "route") break;
      } else if (n < PAINT_THRESHOLD) lastWithout = ended;
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  // Only a final status sampled after this request's click counts, so a
  // previous journey's status text cannot satisfy the wait.
  await page.waitForFunction(
    () => {
      const click = window.__proof.clicks.at(-1);
      return (
        click !== undefined &&
        window.__proof.samples.some(
          (s) =>
            s.t >= click &&
            (/^\s*\d+\s*m\s*$/.test(s.status) ||
              (/No |unavailable|not available/i.test(s.status) &&
                !/Loading|checking/i.test(s.status))),
        )
      );
    },
    null,
    { timeout: 1_800_000, polling: 250 },
  );
  // Floor ready: render state ready and no floor-loading notice for 3 s.
  let stableSince;
  for (const began = Date.now(); Date.now() - began < 1_800_000; ) {
    const s = await page.evaluate(() => window.__proof.samples.at(-1));
    if (s.render === "ready" && !s.loading) {
      if (stableSince === undefined) stableSince = Date.now();
      if (Date.now() - stableSince >= 3000) break;
    } else stableSince = undefined;
    await page.waitForTimeout(250);
  }
  // A route's line must have been drawn by now; give a late paint 10 s more.
  if (j.expect === "route")
    for (const began = Date.now(); paint.firstAt === undefined && Date.now() - began < 10_000; )
      await page.waitForTimeout(200);
  paint.stop = true;
  await poller;
  const { samples, click } = await page.evaluate((from) => {
    return {
      samples: window.__proof.samples.slice(from),
      click: window.__proof.clicks.at(-1),
    };
  }, Math.max(0, sampleStart - 1));
  const shown = samples.find((s) => s.t >= click && finalStatus(s.status));
  let floorReadyAt;
  for (const s of samples)
    if (shown && s.t >= shown.t)
      floorReadyAt =
        s.render === "ready" && !s.loading ? (floorReadyAt ?? s.t) : undefined;
  const statusText =
    (await page.getByTestId("route-status").textContent())?.trim() ?? "";
  const progress =
    (await page.getByTestId("route-step-progress").textContent().catch(() => "")) ?? "";
  const stepTotal = Number(/of\s+(\d+)/.exec(progress)?.[1] ?? 0);
  const firstInstruction = await page
    .getByTestId("current-instruction")
    .textContent()
    .catch(() => null);
  const after = await routePixels();
  const metres = /^(\d+)\s*m$/.exec(statusText)?.[1];
  const since = (t) =>
    t !== undefined && click !== undefined ? +((t - click) / 1000).toFixed(3) : null;
  const row = {
    label: j.label,
    from: j.from,
    to: j.to,
    options: {
      endpointMode: "inside",
      allowOtherRoomTransit: j.allowOtherRoomTransit,
      profile: j.profile,
    },
    expect: j.expect,
    expectedDistanceMetres: j.distanceMetres ?? null,
    toleranceMetres: j.expect === "route" ? (j.toleranceMetres ?? 1) : null,
    statusText,
    outcome: metres !== undefined ? "route" : "refused",
    shownMetres: metres === undefined ? null : Number(metres),
    stepTotal,
    firstInstruction,
    routeLinePixels: { before, after, quickBefore, quickMax: paint.maxPixels },
    buttonDisabledSeconds,
    loadAverageAtRequest,
    loadAverageAtEnd: loadAverage(),
    timing: {
      requestToStatusSeconds: since(shown?.t),
      requestToRoutePaintSeconds: since(paint.firstAt),
      routePaintNotBeforeSeconds: since(paint.lowerBound),
      requestToFloorReadySeconds: since(floorReadyAt),
      paintCaptures: paint.captures,
      medianCaptureSeconds: paint.captureSeconds.length
        ? [...paint.captureSeconds].sort((a, b) => a - b)[
            paint.captureSeconds.length >> 1
          ]
        : null,
      note: "Seconds from the Get directions click (epoch clock shared by page and collector). status = final route-status text (50 ms sampler); route paint = end of the first half-scale map capture showing >= 20 route-colour pixels (routePaintNotBefore = end of the previous capture without them); floor ready = render status ready with no floor-loading notice, first sample of a state held 3 s.",
    },
    statusTransitions: samples
      .filter((s) => click === undefined || s.t >= click)
      .map((s) => ({
        afterRequestSeconds: click === undefined ? null : +((s.t - click) / 1000).toFixed(3),
        status: s.status,
        render: s.render,
        loading: s.loading,
      })),
  };
  const problems = [];
  if (quickBefore >= PAINT_THRESHOLD || before > DRAWN_THRESHOLD)
    problems.push(`a route line was already drawn before the request (${before} pixels)`);
  if (j.expect === "route") {
    if (metres === undefined) problems.push(`expected a route, got "${statusText}"`);
    else if (
      j.distanceMetres !== undefined &&
      Math.abs(Number(metres) - j.distanceMetres) > (j.toleranceMetres ?? 1)
    )
      problems.push(
        `distance ${metres} m outside ${j.distanceMetres} ± ${j.toleranceMetres ?? 1} m`,
      );
    if (stepTotal < 1) problems.push("route has no instructions");
    if (after < DRAWN_THRESHOLD)
      problems.push(`no drawn route line (${after} route-colour pixels)`);
    if (paint.firstAt === undefined) problems.push("route paint never observed");
  } else {
    if (metres !== undefined) problems.push(`expected a refusal, got ${statusText}`);
    if (j.refusalText && statusText !== j.refusalText)
      problems.push(`refusal text "${statusText}" != "${j.refusalText}"`);
    if (after > DRAWN_THRESHOLD && after > before + DRAWN_THRESHOLD)
      problems.push(`a route line was drawn for a refusal (${after} pixels)`);
    if (paint.firstAt !== undefined)
      problems.push(`a route line appeared during a refusal (${paint.maxPixels} pixels)`);
  }
  if (!shown) problems.push("final route status not observed after the request");
  row.problems = problems;
  row.passed = problems.length === 0;
  for (const p of problems) fail(`${j.label}: ${p}`);
  results.push(row);
  mark(`${j.label}:shown`, {
    statusText,
    stepTotal,
    routeLinePixels: after,
    timing: row.timing,
    passed: row.passed,
  });
  if (j.screenshot !== false)
    await page.screenshot({ path: `${out}/${mode}-${runLabel}-${j.label}.png` });
}
try {
  for (const j of plan.journeys) await journey(j);
} catch (error) {
  fail(`exception: ${error?.stack ?? error}`);
}
// Carriers the page and its workers fetched.
const admittedPlans = new Set(identity.planReceipts.map((r) => r.url));
const routingFetched = dataRequests.filter((r) => r.path.includes("/data/unbc-routing/"));
const plansFetched = dataRequests.filter((r) => r.path.includes("/data/unbc-plans/"));
if (routingFetched.length === 0) fail("directions carrier request not observed");
for (const r of routingFetched)
  if (!r.path.endsWith(identity.directionsCarrier.url))
    fail(`unexpected directions carrier ${r.path}`);
for (const r of plansFetched)
  if (![...admittedPlans].some((url) => r.path.endsWith(url)))
    fail(`plan carrier ${r.path} is not an admitted plan receipt of this revision`);
for (const r of dataRequests)
  if (r.status !== 200) fail(`${r.path} returned ${r.status}`);
const passed = failures.length === 0;
writeFileSync(
  `${out}/${mode}-${runLabel}-proof.json`,
  JSON.stringify(
    {
      format: "final-visitor-browser-proof-v1",
      passed,
      run: runLabel,
      mode,
      emulation:
        mode === "mobile"
          ? "Playwright devices['iPhone 13'] in Chromium (viewport, DPR 3, touch, mobile UA); not a physical phone"
          : "Chromium 1440x900",
      appUrl,
      manifestUrl,
      browserVersion,
      userAgent,
      identity,
      loadAverageAtStart,
      loadAverageAtEnd: loadAverage(),
      failures,
      pageErrors,
      consoleErrors: consoleErrors.slice(0, 50),
      failedRequests: failedRequests.slice(0, 50),
      dataRequests,
      results,
      log,
    },
    null,
    2,
  ),
);
await browser.close();
process.exit(passed ? 0 : 1);
