import { chromium } from "@playwright/test";

const BASE = "http://localhost:5199";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;

const MODES = [
  { id: "mappedin", url: "/modes/native/mappedin?location=galleria" },
  { id: "pointr", url: "/modes/native/pointr?location=galleria" },
  { id: "situm", url: "/modes/native/situm?location=galleria" },
  { id: "base", url: "/galleria" },
];

const results = [];

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
  results.push(name);
  console.log("captured", name);
}

async function waitForMap(page) {
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForTimeout(4000);
}

async function exercise(page, mode) {
  await page.goto(`${BASE}${mode.url}`);
  await waitForMap(page);

  if (mode.id === "pointr") {
    await shot(page, `${mode.id}-01-welcome-modal`);
    await page.getByRole("button", { name: "Get started" }).click();
    await page.waitForTimeout(800);
  }

  await shot(page, `${mode.id}-02-discovery-categories`);

  const search = page.getByPlaceholder("Search indoor locations...");
  await search.click();
  await search.fill("Atlas");
  await page.waitForTimeout(1000);
  await shot(page, `${mode.id}-03-search-store`);

  await page.getByText("Atlas Books", { exact: true }).first().click();
  await page.waitForTimeout(1800);
  await shot(page, `${mode.id}-04-store-detail`);

  await page.getByRole("button", { name: "Directions" }).click();
  await page.waitForTimeout(600);

  const start = page.getByPlaceholder("Choose starting point");
  await start.click();
  await start.fill("Pixel Toys");
  await page.waitForTimeout(1000);
  await page.getByText("Pixel Toys", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, `${mode.id}-05-directions-steps`);

  const accessible = page.locator("button[aria-pressed]").first();
  await accessible.click();
  await page.waitForTimeout(2500);
  await shot(page, `${mode.id}-06-accessible-route`);

  await accessible.click();
  await page.waitForTimeout(2000);

  const floorButton = page.getByRole("button", { name: "L1", exact: true });
  if ((await floorButton.count()) > 0) {
    await floorButton.first().click();
  } else {
    const floorSelect = page.locator("select").first();
    if ((await floorSelect.count()) > 0) {
      await floorSelect.selectOption({ index: 0 });
    }
  }
  await page.waitForTimeout(1500);
  await shot(page, `${mode.id}-07-floor-filtered-route`);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

await page.goto(`${BASE}/modes`);
await page.waitForTimeout(1500);
await shot(page, "00-modes-index");

for (const mode of MODES) {
  try {
    await exercise(page, mode);
  } catch (error) {
    console.error(`FAILED ${mode.id}:`, error.message);
    await shot(page, `${mode.id}-FAILED`);
  }
}

await browser.close();
console.log(`done: ${results.length} screenshots`);
