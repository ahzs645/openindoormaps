import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import polygonClipping from "polygon-clipping";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { createRequire } from "node:module";
import path from "node:path";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
const require = createRequire(import.meta.url);
const { PNG } = require(
  path.join(
    path.dirname(require.resolve("playwright-core")),
    "lib/utilsBundle.js",
  ),
);
const zip = process.env.INDOOR_PROJECT_ZIP;
type AuditWindow = typeof globalThis & { auditMap: Map };
test.skip(!zip || !existsSync(zip), "Provide the reviewed UNBC master ZIP.");
const baselineZip = process.env.INDOOR_SELECTION_BASELINE_ZIP;
const readDataset = (filename: string): IndoorDataset => {
  const files = unzipSync(readFileSync(filename), {
    filter: (entry) => entry.name === "viewer/indoor.json",
  });
  return JSON.parse(new TextDecoder().decode(files["viewer/indoor.json"]));
};
function addedSwingProbes(key: string) {
  if (!baselineZip || !zip) return [];
  const before = readDataset(baselineZip),
    after = readDataset(zip);
  const previous = before.presentation!.rooms.find((r) => r.roomKey === key)!;
  const current = after.presentation!.rooms.find((r) => r.roomKey === key)!;
  const added = polygonClipping.difference(
    current.interiorRingsFeet,
    previous.interiorRingsFeet,
  );
  const inside = (p: number[], ring: number[][]) => {
    let value = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        value = !value;
    }
    return value;
  };
  const distance = (p: number[], a: number[], b: number[]) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      t = Math.max(
        0,
        Math.min(
          1,
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  return added.flatMap((rings) => {
    const ring = rings[0],
      area = Math.abs(
        ring.reduce(
          (s, p, i) =>
            s +
            p[0] * ring[(i + 1) % ring.length][1] -
            ring[(i + 1) % ring.length][0] * p[1],
          0,
        ) / 2,
      );
    if (area < 0.5) return [];
    const xs = ring.map((p) => p[0]),
      ys = ring.map((p) => p[1]);
    let best: { point: [number, number]; clearance: number } | undefined;
    for (let i = 1; i < 60; i++)
      for (let j = 1; j < 60; j++) {
        const point: [number, number] = [
          Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 60,
          Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 60,
        ];
        if (
          !inside(point, ring) ||
          rings.slice(1).some((h) => inside(point, h))
        )
          continue;
        const clearance = Math.min(
          ...rings.flatMap((r) =>
            r.map((a, k) => distance(point, a, r[(k + 1) % r.length])),
          ),
        );
        if (!best || clearance > best.clearance) best = { point, clearance };
      }
    if (!best || best.clearance < 0.1) return [];
    return [
      {
        pointFeet: best.point,
        geographic: geographicPoint(after, best.point),
        clearanceFeet: best.clearance,
        addedAreaSquareFeet: area,
      },
    ];
  });
}
async function loadedMap(page: Page) {
  await page.goto("/projects/indoor");
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some((r) => r.name.includes("/deps/maplibre-gl.js?")),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const modulePath = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
    const { default: lib } = await import(modulePath);
    const original = lib.Map.prototype.fitBounds;
    lib.Map.prototype.fitBounds = function (
      this: Map,
      ...args: Parameters<Map["fitBounds"]>
    ) {
      (globalThis as AuditWindow).auditMap = this;
      return original.apply(this, args);
    };
  });
  await page.locator('input[type="file"]').setInputFiles(zip!);
  await expect(page.getByRole("status")).toContainText("Loaded", {
    timeout: 60_000,
  });
}
for (const mobile of [false, true])
  for (const room of [
    { number: "08-129", name: "Lab", key: "rm-1487816-3e3471f41201" },
    { number: "05-170", name: "Counsellor PT", key: "rm-311-4146ef4a7e83" },
  ])
    test(`registered ${room.number} fills immediately on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 },
      );
      await loadedMap(page);
      await page.getByRole("button", { name: "2D rooms", exact: true }).click();
      await page
        .getByLabel("Search indoor map", { exact: true })
        .fill(room.number);
      await page
        .getByRole("button", {
          name: new RegExp(`${room.number} · ${room.name}`),
        })
        .click();
      await expect
        .poll(
          () =>
            page.evaluate(async (key) => {
              const src = (globalThis as AuditWindow).auditMap?.getSource(
                "project-room-blocks",
              ) as GeoJSONSource | undefined;
              if (!src) return false;
              const data = (await src.getData()) as FeatureCollection;
              return data.features.some((f) => f.properties?.key === key);
            }, room.key),
          { timeout: 30_000 },
        )
        .toBe(true);
      const pixel = await page.evaluate(
        async ({ key, mobile }) => {
          const map = (globalThis as AuditWindow).auditMap;
          const data = (await (
            map.getSource("project-room-blocks") as GeoJSONSource
          ).getData()) as FeatureCollection<MultiPolygon>;
          const feature = data.features.find((f) => f.properties?.key === key)!;
          if (!feature)
            throw new Error(
              "No prepared room block for selected registered room",
            );
          const ring = feature.geometry.coordinates[0][0];
          const xs = ring.map((p) => p[0]),
            ys = ring.map((p) => p[1]);
          const center: [number, number] = [
            (Math.min(...xs) + Math.max(...xs)) / 2,
            (Math.min(...ys) + Math.max(...ys)) / 2,
          ];
          const rect = map.getCanvas().getBoundingClientRect(),
            target = mobile ? [rect.width / 2, 230] : [900, rect.height / 2];
          map.jumpTo({
            center,
            zoom: 22,
            pitch: 0,
            padding: { left: 0, right: 0, top: 0, bottom: 0 },
          });
          const projected = map.project(center);
          map.panBy([projected.x - target[0], projected.y - target[1]], {
            duration: 0,
          });
          return {
            x: Math.round(rect.left + target[0] - 20),
            y: Math.round(rect.top + target[1] - 20),
            properties: feature.properties,
          };
        },
        { key: room.key, mobile },
      );
      expect(pixel.properties?.boundarySource).toBe(
        "prepared-registered-source-walls",
      );
      await page
        .getByRole("button", { name: "All places", exact: true })
        .click();
      await page.mouse.click(pixel.x, pixel.y);
      for (const update of [false, true]) {
        if (update)
          await page
            .getByRole("button", { name: "Map preferences", exact: true })
            .click();
        await expect
          .poll(
            async () => {
              const image = PNG.sync.read(await page.screenshot());
              const rgb = [
                ...image.data.subarray(
                  (pixel.y * image.width + pixel.x) * 4,
                  (pixel.y * image.width + pixel.x) * 4 + 3,
                ),
              ];
              return rgb[0] > 240 && rgb[1] > 190 && rgb[2] < 190;
            },
            { timeout: 20_000 },
          )
          .toBe(true);
        if (update)
          await page
            .getByRole("button", { name: "Map preferences", exact: true })
            .click();
      }
      await page.screenshot({
        path: testInfo.outputPath("registered-room-2d.png"),
      });
      const wedgeProbes = addedSwingProbes(room.key);
      if (baselineZip) expect(wedgeProbes.length).toBeGreaterThan(0);
      for (const [index, probe] of wedgeProbes.entries()) {
        const target = await page.evaluate(
          ({ center, mobile }) => {
            const map = (globalThis as AuditWindow).auditMap,
              rect = map.getCanvas().getBoundingClientRect();
            map.jumpTo({
              center,
              zoom: 22.5,
              pitch: 0,
              padding: { left: 0, right: 0, top: 0, bottom: 0 },
            });
            const screen = mobile
                ? [rect.width / 2, 230]
                : [900, rect.height / 2],
              p = map.project(center);
            map.panBy([p.x - screen[0], p.y - screen[1]], { duration: 0 });
            return {
              x: Math.round(rect.left + screen[0]),
              y: Math.round(rect.top + screen[1]),
            };
          },
          { center: probe.geographic, mobile },
        );
        await expect
          .poll(
            async () => {
              const image = PNG.sync.read(await page.screenshot()),
                rgb = [
                  ...image.data.subarray(
                    (target.y * image.width + target.x) * 4,
                    (target.y * image.width + target.x) * 4 + 3,
                  ),
                ];
              return rgb[0] > 240 && rgb[1] > 190 && rgb[2] < 190;
            },
            { timeout: 20_000 },
          )
          .toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`closed-door-wedge-${index}.png`),
        });
      }
      if (wedgeProbes.length > 0)
        await testInfo.attach("closed-door-wedge-proof", {
          body: JSON.stringify(wedgeProbes, null, 2),
          contentType: "application/json",
        });
      await page.getByRole("button", { name: "3D rooms", exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            JSON.stringify(
              (globalThis as AuditWindow).auditMap.getPaintProperty(
                "project-room-boxes",
                "fill-extrusion-color",
              ),
            ),
          ),
        )
        .toContain('"#ffe09d"');
      await expect
        .poll(() =>
          page.evaluate(() => (globalThis as AuditWindow).auditMap.isMoving()),
        )
        .toBe(false);
      await page.screenshot({
        path: testInfo.outputPath("registered-room-3d.png"),
      });
      await page.getByRole("button", { name: "2D rooms", exact: true }).click();
      expect(errors).toEqual([]);
    });
