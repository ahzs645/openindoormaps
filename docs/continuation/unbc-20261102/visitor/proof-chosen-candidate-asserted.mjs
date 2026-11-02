// Asserted browser proof on the chosen-candidate progressive visitor.
//   node proof-chosen-candidate-asserted.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile JOURNEYS.json
//
// JOURNEYS.json: { expectedRevisionSha256, journeys: [{ label, from, to,
//   profile: "public"|"accessible", allowOtherRoomTransit: boolean,
//   expect: "route"|"refused", distanceMetres?, toleranceMetres?,
//   refusalText? }] }
// The visitor always requests inside arrival; transit through other rooms
// follows the checkbox. Exits non-zero on any page error, wrong manifest
// revision, unexpected route/refusal, distance outside tolerance, refusal text
// mismatch, a route without instructions or without a drawn route line.
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [appUrl, manifestUrl, out, mode, journeysPath] = process.argv.slice(2);
if (!appUrl || !manifestUrl || !out || !["desktop", "mobile"].includes(mode) || !journeysPath)
  throw new Error("Usage: APP_URL MANIFEST_URL OUT_DIR desktop|mobile JOURNEYS.json");
const plan = JSON.parse(readFileSync(journeysPath, "utf8"));
if (!/^[a-f0-9]{64}$/.test(plan.expectedRevisionSha256 ?? ""))
  throw new Error("JOURNEYS.json needs expectedRevisionSha256");
mkdirSync(out, { recursive: true });
const failures = [];
const fail = (message) => {
  failures.push(message);
  console.log(JSON.stringify({ FAIL: message }));
};
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--js-flags=--max-old-space-size=6144"],
});
const context = await browser.newContext(
  mode === "mobile"
    ? (({ defaultBrowserType: _, ...d }) => d)(devices["iPhone 13"])
    : { viewport: { width: 1440, height: 900 } },
);
const page = await context.newPage();
const log = [],
  pageErrors = [],
  consoleErrors = [],
  failedRequests = [],
  manifestResponses = [];
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
page.on("response", async (r) => {
  if (r.url().split("?")[0] !== manifestUrl) return;
  try {
    const body = await r.body();
    const value = JSON.parse(body.toString());
    manifestResponses.push({
      status: r.status(),
      sha256: createHash("sha256").update(body).digest("hex"),
      revisionSha256: value.revisionSha256,
    });
  } catch (error) {
    manifestResponses.push({ status: r.status(), error: String(error) });
  }
});
// One cheap in-page sampler: route status text, render state and the floor
// loading notice, timestamped on the page clock.
await page.addInitScript(() => {
  const samples = [];
  let last = "";
  window.__proof = { samples, clicks: [] };
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button")?.textContent?.trim() === "Get directions"
      )
        window.__proof.clicks.push(performance.now());
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
      samples.push({ t: performance.now(), status, render, loading });
    }
  }, 50);
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
// The manifest the app actually received, and an independent fetch.
const fetched = await page.evaluate(async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  return (await r.json()).revisionSha256;
}, manifestUrl);
if (fetched !== plan.expectedRevisionSha256)
  fail(`manifest revision ${fetched} != ${plan.expectedRevisionSha256}`);
if (manifestResponses.length === 0) fail("app manifest response not observed");
for (const r of manifestResponses)
  if (r.revisionSha256 !== plan.expectedRevisionSha256)
    fail(`app received manifest revision ${r.revisionSha256}`);
mark("manifest", { fetchedRevisionSha256: fetched, manifestResponses });
await page.getByText("Directions", { exact: true }).click();

const finalStatus = (s) =>
  /^\d+\s*m$/.test(s.trim()) ||
  (/No |unavailable|not available/i.test(s) && !/Loading|checking/i.test(s));
async function routePixels() {
  const canvas = page.locator("canvas.maplibregl-canvas").first();
  const png = (await canvas.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = c.getContext("2d");
    g.drawImage(bitmap, 0, 0);
    const px = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let n = 0;
    // Route line colour #38b5eb (56,181,235).
    for (let i = 0; i < px.length; i += 4)
      if (
        Math.abs(px[i] - 56) <= 14 &&
        Math.abs(px[i + 1] - 181) <= 14 &&
        Math.abs(px[i + 2] - 235) <= 14
      )
        n++;
    return n;
  }, png);
}

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
  const before = await routePixels();
  const sampleStart = await page.evaluate(() => window.__proof.samples.length);
  await page.getByRole("button", { name: "Get directions", exact: true }).click();
  mark(`${j.label}:requested`);
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
      floorReadyAt = s.render === "ready" && !s.loading ? (floorReadyAt ?? s.t) : undefined;
  const statusText = (await page.getByTestId("route-status").textContent())?.trim() ?? "";
  const progress = (await page.getByTestId("route-step-progress").textContent().catch(() => "")) ?? "";
  const stepTotal = Number(/of\s+(\d+)/.exec(progress)?.[1] ?? 0);
  const firstInstruction = await page
    .getByTestId("current-instruction")
    .textContent()
    .catch(() => null);
  const after = await routePixels();
  const metres = /^(\d+)\s*m$/.exec(statusText)?.[1];
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
    statusText,
    shownMetres: metres === undefined ? null : Number(metres),
    stepTotal,
    firstInstruction,
    routeLinePixels: { before, after },
    timing: {
      requestToStatusSeconds:
        shown && click !== undefined ? (shown.t - click) / 1000 : null,
      requestToFloorReadySeconds:
        floorReadyAt !== undefined && click !== undefined
          ? (floorReadyAt - click) / 1000
          : null,
      note: "Page clock: request = Get directions click; status = final route-status text; floor ready = render status ready with no floor-loading notice (held 3 s).",
    },
    statusTransitions: samples
      .filter((s) => click === undefined || s.t >= click)
      .map((s) => ({
        afterRequestSeconds: click === undefined ? null : (s.t - click) / 1000,
        status: s.status,
        render: s.render,
        loading: s.loading,
      })),
  };
  const problems = [];
  if (j.expect === "route") {
    if (metres === undefined) problems.push(`expected a route, got "${statusText}"`);
    else if (
      j.distanceMetres !== undefined &&
      Math.abs(Number(metres) - j.distanceMetres) > (j.toleranceMetres ?? 1)
    )
      problems.push(`distance ${metres} m outside ${j.distanceMetres} ± ${j.toleranceMetres ?? 1} m`);
    if (stepTotal < 1) problems.push("route has no instructions");
    if (after < 40) problems.push(`no drawn route line (${after} route-colour pixels)`);
  } else {
    if (metres !== undefined) problems.push(`expected a refusal, got ${statusText}`);
    if (j.refusalText && statusText !== j.refusalText)
      problems.push(`refusal text "${statusText}" != "${j.refusalText}"`);
    if (after > 40 && after > before + 40)
      problems.push(`a route line was drawn for a refusal (${after} pixels)`);
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
    await page.screenshot({ path: `${out}/${mode}-${j.label}.png` });
}
try {
  for (const j of plan.journeys) await journey(j);
} catch (error) {
  fail(`exception: ${error?.stack ?? error}`);
}
const passed = failures.length === 0;
writeFileSync(
  `${out}/${mode}-proof.json`,
  JSON.stringify(
    {
      format: "asserted-visitor-browser-proof-v1",
      passed,
      appUrl,
      manifestUrl,
      mode,
      expectedRevisionSha256: plan.expectedRevisionSha256,
      failures,
      pageErrors,
      consoleErrors: consoleErrors.slice(0, 50),
      failedRequests: failedRequests.slice(0, 50),
      results,
      log,
    },
    null,
    2,
  ),
);
await browser.close();
process.exit(passed ? 0 : 1);
