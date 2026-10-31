// Local browser proof on the new-engine progressive visitor (not committed).
//   node proof-link-route.local.mjs APP_URL MANIFEST_URL OUT_DIR desktop|mobile
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const [appUrl, manifestUrl, out, mode] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--js-flags=--max-old-space-size=6144"],
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
  const row = { mode, stage, seconds: (Date.now() - t0) / 1000, ...extra };
  log.push(row);
  console.log(JSON.stringify(row));
};
page.on("pageerror", (e) => log.push({ pageerror: String(e) }));
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

async function route(label, from, to, transit) {
  const change = page.getByText("Change journey", { exact: true });
  if (await change.isVisible().catch(() => false)) await change.click();
  const box = page.getByLabel("Allow paths through other rooms");
  if ((await box.isChecked()) !== transit) await box.setChecked(transit);
  await page.getByLabel("From", { exact: true }).selectOption(from);
  await page.getByLabel("To", { exact: true }).selectOption(to);
  await page.getByRole("button", { name: "Get directions", exact: true }).click();
  mark(`${label}:requested`);
  await page.getByTestId("route-status").waitFor({ timeout: 900_000 });
  await page.waitForFunction(
    () => {
      const s =
        document.querySelector('[data-testid="route-status"]')?.textContent ?? "";
      return (
        /\d+\s*m\b|No route|not available|unavailable|No hallway/i.test(s) &&
        !/preparing|checking|loading/i.test(s)
      );
    },
    null,
    { timeout: 1_800_000, polling: 2000 },
  );
  await ready();
  const statusText = (await page.getByTestId("route-status").textContent())?.trim();
  const steps = await page
    .locator('[data-testid="route-step-context"]')
    .allTextContents();
  mark(`${label}:shown`, { statusText, steps: steps.slice(0, 12), stepCount: steps.length });
  await page.screenshot({ path: `${out}/${mode}-${label}.png` });
}
// Default visitor setting: hallway-only, corridor to corridor across the link.
await route("corridor-default", "rm-694-2b971ef6dc47", "rm-694-43988ffdc334", false);
// Explicit opt-in through other rooms for the office-to-storage journey.
await route("office-transit", "rm-694-072a835d76b9", "rm-694-0179b206bb5d", true);
writeFileSync(
  `${out}/${mode}-proof.json`,
  JSON.stringify({ appUrl, manifestUrl, mode, log }, null, 2),
);
await browser.close();
