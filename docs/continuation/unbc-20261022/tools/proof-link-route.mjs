// Browser proof: 04-255 -> 08-272 on the new progressive visitor.
//   node proof-link-route.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [appUrl, manifestUrl, out, mode] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({
  executablePath,
  args: ["--js-flags=--max-old-space-size=8192"],
});
const context = await browser.newContext(
  mode === "mobile"
    ? (({ defaultBrowserType, ...d }) => d)(devices["iPhone 13"])
    : { viewport: { width: 1440, height: 900 } },
);
const page = await context.newPage();
const log = [];
const t0 = Date.now();
const mark = (stage, extra = {}) => {
  const row = { stage, seconds: (Date.now() - t0) / 1000, ...extra };
  log.push(row);
  console.log(JSON.stringify(row));
};
page.on("pageerror", (e) => log.push({ pageerror: String(e) }));
// Published floor-plan carriers are not admitted for this revision yet, so
// data-floor-plan stays false; the render status is the readiness signal.
const ready = async () => {
  await page.locator('[data-testid="visitor-render-status"][data-state="ready"]').waitFor({ timeout: 900_000 });
};
await page.goto(`${appUrl}#/projects/visitor?manifest=${encodeURIComponent(manifestUrl)}`);
await ready();
mark("floor-ready");
await page.screenshot({ path: `${out}/${mode}-1-opened.png` });
await page.getByText("Directions", { exact: true }).click();
await page.getByLabel("From", { exact: true }).selectOption("rm-694-072a835d76b9");
await page.getByLabel("To", { exact: true }).selectOption("rm-694-0179b206bb5d");
await page.getByRole("button", { name: "Get directions", exact: true }).click();
mark("route-requested");
const status = page.getByTestId("route-status");
await status.waitFor({ timeout: 900_000 });
await page.waitForFunction(
  () => {
    const s = document.querySelector('[data-testid="route-status"]')?.textContent ?? "";
    return /\d+\s*m\b|metre|minute|No route|not available|unavailable/i.test(s) && !/preparing|checking|loading/i.test(s);
  },
  null,
  { timeout: 1_800_000, polling: 2000 },
);
await ready();
const statusText = (await status.textContent())?.trim();
const steps = await page.locator('[data-testid="route-step-context"]').allTextContents();
const transit = await page.locator('[data-testid="route-transit-places"]').allTextContents().catch(() => []);
mark("route-shown", { statusText, steps, transit });
await page.screenshot({ path: `${out}/${mode}-2-route.png`, fullPage: false });
writeFileSync(`${out}/${mode}-proof.json`, JSON.stringify({ appUrl, manifestUrl, mode, log }, null, 2));
await browser.close();
