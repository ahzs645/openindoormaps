import { chromium } from "@playwright/test";

const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:5199/galleria");
await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
await page.waitForTimeout(5000);

const search = page.getByPlaceholder("Search indoor locations...");
await search.click();
await search.fill("Central Escalator");
await page.waitForTimeout(1000);
await page.getByText("Central Escalator", { exact: true }).first().click();
await page.waitForTimeout(3000);

await page.screenshot({ path: `${OUT}galleria-3d-escalator.png` });
console.log("captured galleria-3d-escalator");

await browser.close();
