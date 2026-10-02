import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
import { HALLWAY_COLOR } from "../../app/indoor-project/display-passages";

const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the prepared UNBC project.");
for (const mobile of [false, true]) {
  test(`corridors are tinted and cannot open visitor room cards on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        original = lib.Map.prototype.fitBounds;
      lib.Map.prototype.fitBounds = function (
        this: Map,
        ...args: Parameters<Map["fitBounds"]>
      ) {
        (globalThis as unknown as { hallwayMap: Map }).hallwayMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const corridor = data.records.find((r) => r.number === "07-113A")!;
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              !!(
                globalThis as unknown as { hallwayMap: Map }
              ).hallwayMap?.getLayer("project-room-fill"),
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    const center = geographicPoint(data, [60, 300]);
    for (const three of [false, true]) {
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await page.evaluate(
        ({ center, three }) =>
          (globalThis as unknown as { hallwayMap: Map }).hallwayMap.jumpTo({
            center,
            zoom: 20.5,
            pitch: three ? 55 : 0,
            bearing: 0,
          }),
        { center, three },
      );
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const map = (globalThis as unknown as { hallwayMap: Map })
                .hallwayMap;
              return (
                !map.isMoving() &&
                map.isSourceLoaded("project-areas") &&
                map.isSourceLoaded("project-room-blocks")
              );
            }),
          { timeout: 30_000 },
        )
        .toBe(true);
      const state = await page.evaluate(async (key) => {
        const map = (globalThis as unknown as { hallwayMap: Map }).hallwayMap;
        const areas = (await (
          map.getSource("project-areas") as GeoJSONSource
        ).getData()) as FeatureCollection;
        const blocks = (await (
          map.getSource("project-room-blocks") as GeoJSONSource
        ).getData()) as FeatureCollection;
        return {
          area: areas.features.find((f) => f.properties?.key === key)
            ?.properties,
          block: blocks.features.some((f) => f.properties?.key === key),
          color: map.getPaintProperty("project-room-fill", "fill-color"),
        };
      }, corridor.key);
      expect(state.area?.circulation).toBe(true);
      expect(state.block).toBe(false);
      expect(JSON.stringify(state.color)).toContain(HALLWAY_COLOR);
      const point = await page.evaluate((center) => {
        const p = (
          globalThis as unknown as { hallwayMap: Map }
        ).hallwayMap.project(center);
        return { x: p.x, y: p.y };
      }, center);
      const box = (await page
        .locator("canvas.maplibregl-canvas")
        .boundingBox())!;
      await page.mouse.click(box.x + point.x, box.y + point.y);
      await expect(page.locator(".project-place-card")).toHaveCount(0);
      await page.screenshot({
        path: `docs/screenshots/unbc-hallways-${three ? "3d" : "2d"}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (globalThis as unknown as { hallwayMap: Map }).hallwayMap.getPitch(),
        ),
      )
      .toBe(0);
    await page.evaluate(
      (center) =>
        (globalThis as unknown as { hallwayMap: Map }).hallwayMap.jumpTo({
          center,
          zoom: 20.5,
          pitch: 0,
        }),
      center,
    );
    const box = (await page.locator("canvas.maplibregl-canvas").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole("heading", { name: /07-113A/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
