/* eslint-env node */
import { chromium } from "@playwright/test";

// Run `npm run dev -- --port 5199` first. POI ids come from
// app/data/campus/pois.geojson (scripts/generate-campus-fixture.py).
const BASE = process.env.OIM_BASE_URL ?? "http://localhost:5199";
const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;

const SHOTS = [
  { name: "campus-01-overview", path: "/campus" },
  { name: "campus-02-level-2-skybridge", path: "/campus?floor=1" },
  // Student Union Food Court -> Library Cafe: outdoor walkway leg.
  { name: "campus-03-outdoor-route", path: "/campus?from=29&to=17" },
  // Chemistry Lab (Ground) -> Reading Room (Library Level 2): skybridge.
  { name: "campus-04-skybridge-route", path: "/campus?from=2&to=18" },
  // Fitness Centre (Union L2) -> Observatory (Science L4), elevators only.
  {
    name: "campus-05-accessible-cross-campus",
    path: "/campus?from=32&to=11&accessible=1",
  },
  // Real two-building site (Pointr capture): store -> Harrods Car Park.
  { name: "harrods-05-car-park-route", path: "/harrods?from=678&to=880" },
  // Fifth floor -> Harrods (Stop KB) bus stop.
  { name: "harrods-06-bus-stop-route", path: "/harrods?from=37&to=70" },
  // Real campus from Mappedin's MVF bundle (scripts/port-mappedin-mvf.py).
  { name: "bowie-01-overview", path: "/bowie-state" },
  // Student Center Book Store -> Computer Science room CS-316 (Floor 3).
  { name: "bowie-02-cross-campus-route", path: "/bowie-state?from=714&to=300" },
  // Hillside door straight onto Charlotte Robinson Hall's second floor.
  { name: "bowie-03-hillside-door", path: "/bowie-state?from=714&to=1118" },
  // CF Toronto Eaton Centre (same Mappedin MVF importer).
  { name: "eaton-01-overview", path: "/eaton-centre" },
  { name: "eaton-02-escalator-route", path: "/eaton-centre?from=82&to=40" },
  { name: "eaton-03-apple-card", path: "/eaton-centre?poi=81" },
];

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const shot of SHOTS) {
  try {
    await page.goto(`${BASE}${shot.path}`);
    await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
    // MapLibre's load event waits for basemap tiles, which is slow under
    // software WebGL; the indoor layers only appear after it.
    await page
      .getByText("Loading map")
      .waitFor({ state: "hidden", timeout: 120000 });
    // Routes also fly the camera to the route bounds (speed 0.5).
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}${shot.name}.png` });
    console.log("captured", shot.name);
  } catch (error) {
    console.error(`FAILED ${shot.name}:`, error.message);
  }
}

await browser.close();
