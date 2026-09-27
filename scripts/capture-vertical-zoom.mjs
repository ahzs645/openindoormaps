import { chromium } from "@playwright/test";

const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const TARGETS = [
  ["Central Escalator", "galleria-escalator-shape-zoomed"],
  ["West Staircase", "galleria-stairs-shape-zoomed"],
  ["East Elevator", "galleria-elevator-shape-zoomed"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5199/galleria");
await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
await page.waitForTimeout(4000);

for (const [name, file] of TARGETS) {
  await page.goto("http://localhost:5199/galleria");
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForTimeout(4000);

  const search = page.getByPlaceholder("Search indoor locations...");
  await search.click();
  await search.fill(name);
  await page.waitForTimeout(1000);
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}${file}.png` });
  console.log("captured", file);
}

await browser.close();
