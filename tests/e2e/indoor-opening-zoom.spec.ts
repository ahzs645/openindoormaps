import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map } from "maplibre-gl";

const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide a prepared indoor project ZIP.");

for (const mobile of [false, true]) {
  test(`entrance details disappear at campus zoom on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    );
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached();
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path);
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-doors")
          (globalThis as unknown as { openingZoomMap: Map }).openingZoomMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-136");
    await page
      .getByRole("button", { name: /^05-136 · Library Services Desk/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as unknown as { openingZoomMap: Map })
            .openingZoomMap;
          return !!map?.getLayer("project-door-boxes") && !map.isMoving();
        }),
      )
      .toBe(true);

    const renderedDoors = () =>
      page.evaluate(
        () =>
          (
            globalThis as unknown as { openingZoomMap: Map }
          ).openingZoomMap.queryRenderedFeatures({
            layers: ["project-door-fill", "project-door-boxes"],
          }).length,
      );
    const zoomTo = async (zoom: number, three: boolean) => {
      await page.evaluate(
        ({ zoom, three }) =>
          (
            globalThis as unknown as { openingZoomMap: Map }
          ).openingZoomMap.jumpTo({ zoom, pitch: three ? 45 : 0, bearing: 0 }),
        { zoom, three },
      );
    };
    for (const three of [true, false]) {
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await zoomTo(21, three);
      await expect.poll(renderedDoors).toBeGreaterThan(0);
      await zoomTo(17, three);
      await expect.poll(renderedDoors).toBe(0);
      await page.screenshot({
        path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/unbc-opening-overview-${three ? "3d" : "2d"}-${mobile ? "mobile" : "desktop"}.png`,
      });
      // Returning to detail restores the source entrances in either projection.
      await zoomTo(21, three);
      await expect.poll(renderedDoors).toBeGreaterThan(0);
    }
    const sourceDoors = await page.evaluate(async () => {
      const source = (
        globalThis as unknown as { openingZoomMap: Map }
      ).openingZoomMap.getSource("project-doors") as GeoJSONSource;
      return ((await source.getData()) as FeatureCollection).features.length;
    });
    expect(sourceDoors).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
