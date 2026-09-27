import { chromium } from "@playwright/test";

const BASE = "http://localhost:5199";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;

const VENUES = [
  { id: "city-mall", search: "Zara Home", origin: "Primark" },
  {
    id: "harrods",
    search: "Fine Watch Room",
    origin: "Abercrombie & Kent",
  },
  { id: "mappedin-mall", search: "Swatch", origin: "Lululemon" },
];

async function waitForMap(page) {
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForTimeout(4000);
}

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

for (const venue of VENUES) {
  try {
    await page.goto(`${BASE}/${venue.id}`);
    await waitForMap(page);
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    await zoomIn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}${venue.id}-01-overview.png` });
    console.log("captured", `${venue.id}-01-overview`);

    const search = page.getByPlaceholder("Search indoor locations...");
    await search.click();
    await search.fill(venue.search);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}${venue.id}-02-search.png` });
    console.log("captured", `${venue.id}-02-search`);

    await page
      .getByRole("button", { name: venue.search })
      .first()
      .dispatchEvent("mousedown");
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}${venue.id}-03-store-detail.png` });
    console.log("captured", `${venue.id}-03-store-detail`);

    await page.getByRole("button", { name: "Directions" }).click();
    await page.waitForTimeout(600);
    const origin = page.getByPlaceholder("Choose starting point");
    await origin.click();
    await origin.fill(venue.origin);
    await page.waitForTimeout(1000);
    await page.getByText(venue.origin, { exact: true }).first().click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}${venue.id}-04-directions.png` });
    console.log("captured", `${venue.id}-04-directions`);
  } catch (error) {
    console.error(`FAILED ${venue.id}:`, error.message);
  }
}

await browser.close();
console.log("done");
