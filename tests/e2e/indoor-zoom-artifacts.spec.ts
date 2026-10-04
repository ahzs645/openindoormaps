import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { Map, GeoJSONSource, LngLatLike } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
type TestWindow = typeof globalThis & { artifactMap: Map };
type RenderCollection = FeatureCollection<
  MultiPolygon,
  { key: string; roomKeys?: string[]; height: number; circulation: boolean }
>;
// Use Playwright's own screenshot decoder, avoiding another runtime dependency.
const require = createRequire(import.meta.url);
const { PNG } = require(
  path.join(
    path.dirname(require.resolve("playwright-core")),
    "lib/utilsBundle.js",
  ),
);
const zip = process.env.INDOOR_PROJECT_ZIP;
for (const mobile of [false, true])
  test(`Building 10 has stable walls across zoom levels on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the reviewed master ZIP");
    test.setTimeout(180_000);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached();
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as TestWindow).artifactMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    for (const number of ["10-1014", "10-3054"]) {
      const room = data.records.find((r) => r.number === number)!,
        pts = room.ringsFeet.flat();
      const center = geographicPoint(data, [
        (Math.min(...pts.map((p) => p[0])) +
          Math.max(...pts.map((p) => p[0]))) /
          2,
        (Math.min(...pts.map((p) => p[1])) +
          Math.max(...pts.map((p) => p[1]))) /
          2,
      ]);
      await page
        .getByRole("textbox", { name: "Search indoor map", exact: true })
        .fill(number);
      await page
        .getByRole("button", { name: new RegExp(`^${number} ·`) })
        .click();
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "3D rooms", exact: true }).click();
      await page
        .getByRole("button", { name: "All places", exact: true })
        .click();
      for (const zoom of mobile ? [20.5, 21] : [20.5, 21, 22]) {
        await page.evaluate(
          ({ center, zoom, mobile }) =>
            (globalThis as TestWindow).artifactMap.jumpTo({
              center,
              zoom,
              pitch: 40,
              bearing: 15,
              padding: mobile
                ? { left: 0, right: 0, top: 100, bottom: 380 }
                : { left: 390, right: 0, top: 0, bottom: 0 },
            }),
          { center, zoom, mobile },
        );
        await expect
          .poll(() =>
            page.evaluate(() =>
              (globalThis as TestWindow).artifactMap.areTilesLoaded(),
            ),
          )
          .toBe(true);
        const proof = await page.evaluate(
          async ({ key }) => {
            const map = (globalThis as TestWindow).artifactMap;
            const walls = (await (
              map.getSource("project-exposed-walls") as GeoJSONSource
            ).getData()) as RenderCollection;
            const blocks = (await (
              map.getSource("project-room-blocks") as GeoJSONSource
            ).getData()) as RenderCollection;
            return {
              precision: !!map.getLayer("project-precision-walls"),
              oldWalls: map.getLayoutProperty(
                "project-wall-boxes",
                "visibility",
              ),
              oneShell: walls.features.every(
                (f) => f.geometry.coordinates.length === 1,
              ),
              room: blocks.features.find((f) => f.properties.key === key),
            };
          },
          { key: room.key },
        );
        expect(proof.precision).toBe(true);
        expect(proof.oldWalls).toBe("none");
        expect(proof.oneShell).toBe(true);
        const shot = await page.screenshot({
          path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/${number}-${zoom}-${mobile ? "mobile" : "desktop"}.png`,
        });
        if (number === "10-1014" && !mobile) {
          // A malformed wall tile previously painted a large grey triangle across
          // this white room. Check real screenshot pixels inside all four quarters.
          const points = proof.room!.geometry.coordinates.flat(2) as number[][];
          const box = [
            Math.min(...points.map((p) => p[0])),
            Math.min(...points.map((p) => p[1])),
            Math.max(...points.map((p) => p[0])),
            Math.max(...points.map((p) => p[1])),
          ];
          const probes = [0.25, 0.75]
            .flatMap((x) =>
              [0.25, 0.75].map((y) => [
                box[0] + x * (box[2] - box[0]),
                box[1] + y * (box[3] - box[1]),
              ]),
            )
            .filter((p) =>
              booleanPointInPolygon(
                { type: "Point", coordinates: p },
                proof.room!.geometry,
              ),
            );
          const pixels = await page.evaluate(
            (probes) =>
              probes.map((p) => {
                const q = (globalThis as TestWindow).artifactMap.project(
                  p as LngLatLike,
                );
                return [Math.round(q.x), Math.round(q.y)];
              }),
            probes,
          );
          const png = PNG.sync.read(shot);
          let count = 0;
          for (const [x, y] of pixels) {
            if (
              x < 400 ||
              x >= png.width - 20 ||
              y < 100 ||
              y >= png.height - 80
            )
              continue;
            const index = (y * png.width + x) * 4;
            expect(
              Math.min(...png.data.subarray(index, index + 3)),
              `White room roof at zoom ${zoom}, ${x},${y}`,
            ).toBeGreaterThan(240);
            count++;
          }
          expect(count).toBeGreaterThan(0);
        }
      }
    }
    expect(errors).toEqual([]);
  });
