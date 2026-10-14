// usage: node pw-floors.mjs <zip> <out-dir> [mobile]   -> <out-dir>/floor-<name>.png + floors.json
import { chromium } from "/Users/ahmadjalil/github/openindoormaps/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const [zip, dir, mobile] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const t0 = Date.now(), s = () => Math.round((Date.now() - t0) / 1000);
const browser = await chromium.launch({ executablePath: "/Users/ahmadjalil/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--js-flags=--max-old-space-size=8192"] });
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
await page.addInitScript(() => { Error.stackTraceLimit = 60; });
const errors = [];
page.on("pageerror", (e) => { errors.push(e.stack ?? e.message); console.log(s(), "pageerror", (e.stack ?? e.message).slice(0, 8000)); });
page.on("crash", () => console.log(s(), "PAGE CRASHED"));
page.on("console", (m) => { if (["error", "warning", "info"].includes(m.type())) console.log(s(), "console", m.type(), m.text().slice(0, 600)); });
page.on("load", () => console.log(s(), "page load event"));
await page.goto("http://127.0.0.1:42431/openindoormaps/#/projects/indoor");
await page.locator('input[type=file][accept=".zip"]').setInputFiles(zip);
let stall, probed = false;
for (;;) {
  const t = await page.evaluate(() => document.body.innerText);
  if (/Could not import/.test(t)) { console.log("IMPORT FAILED", t.slice(0, 400)); process.exit(1); }
  if (/Loaded \d/.test(t) || /Loaded map/.test(t) && !/elapsed/.test(t)) break;
  if (/Validating .* and loading floor maps/.test(t)) {
    stall ??= s();
    if (s() - stall > 90 && !probed) {
      probed = true;
      const info = await page.evaluate(async () => {
        const m = await import("/openindoormaps/app/indoor-project/native-exact-geos-overlay.ts");
        return { engine: m.nativeExactGeosOverlayInitialized(), canvases: document.querySelectorAll("canvas").length, buttons: [...document.querySelectorAll("button")].map((b) => b.textContent).filter(Boolean).slice(0, 25) };
      });
      console.log(s(), "PROBE", JSON.stringify(info));
      await page.screenshot({ path: dir + "/stall.png" });
    }
  }
  if (s() % 60 < 3) console.log(s(), "status", JSON.stringify(t.replace(/\s+/g, " ").slice(0, 1500)));
  await page.waitForTimeout(3000);
}
console.log(s(), "loaded");
const trigger = page.getByRole("button", { name: "Open level selector" });
await trigger.click();
const names = await page.getByRole("menuitemradio").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
await page.keyboard.press("Escape");
console.log(s(), "floors", names);
const out = [];
for (const name of names) {
  const f0 = Date.now();
  await trigger.click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await page.waitForTimeout(2000);
  let status = "", ok = false;
  for (let k = 0; k < 300; k++) {
    const t = await page.evaluate(() => document.body.innerText);
    status = t.match(/Native floor map[^\n]*/)?.[0] ?? "";
    if (!/Loading native floor map|Preparing /.test(t) && /areas/.test(status)) { ok = true; break; }
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(4000);
  const file = `${dir}/floor-${name.replace(/[^A-Za-z0-9.]+/g, "_")}.png`;
  await page.screenshot({ path: file });
  const r = { name, ok, status, seconds: Math.round((Date.now() - f0) / 1000), screenshot: file, floorId: await trigger.getAttribute("data-floor-id") };
  out.push(r); console.log(s(), JSON.stringify(r));
  writeFileSync(dir + "/floors.json", JSON.stringify({ zip, mobile: !!mobile, floors: out, errors }, null, 1));
}
await browser.close();
