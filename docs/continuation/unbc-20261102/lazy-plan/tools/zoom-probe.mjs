// zoom-probe.mjs BASE LABEL OUT: cold open, then zoom in with the map control
// until past the room-detail threshold; time the opening and the zoomed plan.
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
const [base, label, out] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
  ],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const t0 = Date.now();
const s = () => (Date.now() - t0) / 1000;
const plans = [];
p.on("request", (r) => {
  if (r.url().includes("/data/unbc-plans/"))
    plans.push([s(), r.url().split("/").pop().slice(0, 8)]);
});
let errors = 0;
p.on("pageerror", () => errors++);
await p.goto(
  `${base}/openindoormaps/#/projects/visitor?manifest=${encodeURIComponent(base + "/data/unbc/manifest.json")}`,
);
const ready = () =>
  p
    .locator("[data-testid=visitor-render-status][data-state=ready]")
    .waitFor({ timeout: 300000 });
await ready();
const opening = s();
const map = p.locator(".visitor-map");
const openingPlan = await map.getAttribute("data-floor-plan");
const zoomStart = s();
for (
  let i = 0;
  i < 6 && Number(await map.getAttribute("data-zoom")) <= 17.5;
  i++
) {
  const z = await map.getAttribute("data-zoom");
  await p.getByRole("button", { name: "Zoom in", exact: true }).click();
  await p.waitForFunction(
    (z) => document.querySelector(".visitor-map").dataset.zoom !== z,
    z,
    { timeout: 120000, polling: 50 },
  );
}
const crossed = s();
await p.waitForFunction(
  () => document.querySelector(".visitor-map")?.dataset.floorPlan === "true",
  null,
  { timeout: 300000, polling: 50 },
);
await p.waitForTimeout(250);
await ready();
const zoomedReady = s();
const result = {
  label,
  base,
  opening,
  openingPlan,
  zoomStart,
  crossed,
  zoomedReady,
  zoomToReady: +(zoomedReady - zoomStart).toFixed(2),
  zoom: await map.getAttribute("data-zoom"),
  plans,
  errors,
  loadAverage: readFileSync("/proc/loadavg", "utf8").trim(),
};
writeFileSync(`${out}/${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await b.close();
