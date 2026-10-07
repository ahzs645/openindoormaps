import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
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
type SelectionWindow = typeof globalThis & { selectionMap: Map };
test.skip(!zip || !existsSync(zip), "Provide the reviewed UNBC master ZIP.");

async function expectSelectedFill(page: Page, three: boolean) {
  await expect
    .poll(
      () =>
        page.evaluate((three) => {
          const map = (globalThis as SelectionWindow).selectionMap;
          const id = three ? "project-room-boxes" : "project-block-fill";
          return map?.getLayer(id)
            ? JSON.stringify(
                map.getPaintProperty(
                  id,
                  three ? "fill-extrusion-color" : "fill-color",
                ),
              )
            : "pending";
        }, three),
      { timeout: 30_000 },
    )
    .toContain('"#ffe09d"');
  await page.evaluate(() => {
    const map = (globalThis as SelectionWindow).selectionMap;
    map.triggerRepaint();
    return new Promise<void>((resolve) =>
      map.once("render", () =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
    );
  });
}

for (const mobile of [false, true]) {
  test(`selected Building 10 room stays filled during directions and UI updates on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 },
    );
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
        (globalThis as SelectionWindow).selectionMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.getByLabel("Search indoor map", { exact: true }).fill("10-1007");
    await page.getByRole("button", { name: /10-1007 · OT MPL 2/ }).click();
    await expectSelectedFill(page, false);
    // Opening preferences used to refresh base paints without refreshing the
    // selected paint, leaving an orange outline around an uncoloured room.
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expectSelectedFill(page, false);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("07-240");
    await page.getByRole("option", { name: /07-240 · Bookstore/ }).click();
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await page.getByLabel("Route destination", { exact: true }).fill("10-1007");
    await page.getByRole("option", { name: /10-1007 · OT MPL 2/ }).click();
    await expectSelectedFill(page, false);

    // Verify actual interior pixels, independently of paint expressions.
    const pixel = await page.evaluate(
      async ({ mobile }) => {
        const map = (globalThis as SelectionWindow).selectionMap;
        const data = (await (
          map.getSource("project-room-blocks") as GeoJSONSource
        ).getData()) as FeatureCollection<MultiPolygon>;
        const room = data.features.find(
          (f) => f.properties?.key === "rm-1487816-1942e041e15e",
        )!;
        const ring =
          room.geometry.type === "MultiPolygon"
            ? room.geometry.coordinates[0][0]
            : room.geometry.coordinates[0];
        const x = ring.map((p) => p[0]),
          y = ring.map((p) => p[1]);
        const center: [number, number] = [
          (Math.min(...x) + Math.max(...x)) / 2,
          (Math.min(...y) + Math.max(...y)) / 2,
        ];
        const rect = map.getCanvas().getBoundingClientRect();
        map.jumpTo({
          center,
          zoom: 20.5,
          pitch: 0,
          padding: { left: 0, right: 0, top: 0, bottom: 0 },
        });
        const target = mobile ? [rect.width / 2, 190] : [900, rect.height / 2];
        const projected = map.project(center);
        map.panBy([projected.x - target[0], projected.y - target[1]], {
          duration: 0,
        });
        // Probe away from the label and arrival path at the centre.
        return {
          x: Math.round(rect.left + target[0] - 30),
          y: Math.round(rect.top + target[1] - 25),
        };
      },
      { mobile },
    );
    await page.mouse.click(pixel.x, pixel.y);
    await expectSelectedFill(page, false);
    const screenshot = await page.screenshot({
      path: testInfo.outputPath("selected-room-2d.png"),
    });
    const png = PNG.sync.read(screenshot);
    const rgb = [
      ...png.data.subarray(
        (pixel.y * png.width + pixel.x) * 4,
        (pixel.y * png.width + pixel.x) * 4 + 3,
      ),
    ];
    expect(rgb[0]).toBeGreaterThan(240);
    expect(rgb[1]).toBeGreaterThan(190);
    expect(rgb[2]).toBeLessThan(190);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expectSelectedFill(page, true);
    await page
      .getByRole("button", { name: "Stop directions", exact: true })
      .click();
    await expectSelectedFill(page, true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expectSelectedFill(page, false);
    expect(errors).toEqual([]);
  });
  test(`classroom 08-161 follows the native enclosure in 2D and 3D on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 },
    );
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
        (globalThis as SelectionWindow).selectionMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.getByLabel("Search indoor map", { exact: true }).fill("08-161");
    await page.getByRole("button", { name: /08-161 · Classroom/ }).click();
    for (const three of [false, true]) {
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await expectSelectedFill(page, three);
      const enclosure = await page.evaluate(async () => {
        const map = (globalThis as SelectionWindow).selectionMap;
        const blocks = (await (
          map.getSource("project-room-blocks") as GeoJSONSource
        ).getData()) as FeatureCollection<MultiPolygon>;
        return blocks.features.find(
          (f) => f.properties?.key === "rm-1487816-46309af41655",
        )?.properties;
      });
      expect(enclosure?.boundarySource).toBe("assumed-native-wall-enclosure");
      expect(enclosure?.displayOnly).toBe(true);
      expect(enclosure?.displayCornerContinuation.maximumFeet).toBe(0.3);
      await expect
        .poll(() =>
          page.evaluate(
            () => !(globalThis as SelectionWindow).selectionMap.isMoving(),
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(
          `classroom-native-${three ? "3d" : "2d"}.png`,
        ),
      });
    }
  });
}
