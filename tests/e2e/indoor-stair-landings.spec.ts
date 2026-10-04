import { test, expect } from "@playwright/test";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_LANDINGS_ZIP;
for (const mobile of [false, true])
  test(`turning platforms stay complete in desktop/mobile floor views: ${mobile}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the refreshed native-landing master ZIP");
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
      const { default: lib } = await import(path);
      const add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { landingMap: Map }).landingMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const floor = page.getByLabel("Project floor", { exact: true });
    const value = await floor
      .locator("option")
      .filter({ hasText: "Floor 2 · #694" })
      .getAttribute("value");
    await floor.selectOption(value!);
    await page
      .getByRole("button", { name: "Review pin 24", exact: true })
      .click();
    await page
      .getByTestId("review-pin-panel")
      .getByRole("button", { name: "Inspect staircase #2474568", exact: true })
      .click();
    const center = geographicPoint(data, [57, 769]);
    for (const view of [
      "2D rooms",
      "3D rooms",
      "3D relative heights",
      "Source model",
    ]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      await page.evaluate(
        ({ center, mobile, view }) =>
          (globalThis as unknown as { landingMap: Map }).landingMap.jumpTo({
            center,
            zoom: mobile ? 21.3 : 22,
            pitch: view === "2D rooms" ? 0 : 45,
            bearing: 0,
            padding: mobile
              ? { top: 0, right: 0, bottom: 220, left: 0 }
              : { top: 0, right: 0, bottom: 0, left: 440 },
          }),
        { center, mobile, view },
      );
      if (view !== "Source model") {
        await expect
          .poll(async () =>
            page.evaluate(async () => {
              const map = (globalThis as unknown as { landingMap: Map })
                .landingMap;
              const surfaces = (await (
                map.getSource("project-native-stairs") as GeoJSONSource
              ).getData()) as FeatureCollection;
              return surfaces.features.filter(
                (f) =>
                  f.properties?.surfaceKind === "landing" &&
                  [2_474_568, 1_500_191].includes(f.properties?.stairElementId),
              ).length;
            }),
          )
          .toBeGreaterThanOrEqual(2);
        const surfaces = (await page.evaluate(
          async () =>
            await (
              (
                globalThis as unknown as { landingMap: Map }
              ).landingMap.getSource("project-native-stairs") as GeoJSONSource
            ).getData(),
        )) as FeatureCollection;
        const upper = surfaces.features.find(
          (f) => f.properties?.nativeElementId === 1_500_197,
        )!;
        expect(upper.geometry.type).toBe("Polygon");
        if (upper.geometry.type === "Polygon")
          expect(upper.geometry.coordinates[0].length).toBe(7);
        expect(
          upper.properties!.topMetres - upper.properties!.baseMetres,
        ).toBeCloseTo(0.05, 8);
        if (view === "2D rooms") {
          await expect
            .poll(() =>
              page.evaluate(() =>
                (globalThis as unknown as { landingMap: Map }).landingMap
                  .queryRenderedFeatures(undefined, {
                    layers: ["project-native-stair-outline"],
                  })
                  .some((f) => f.properties?.nativeElementId === 1_500_197),
              ),
            )
            .toBe(true);
        }
      }
      await page.locator("canvas.maplibregl-canvas").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `work/stair-landings/browser/turn-${view.replaceAll(" ", "-")}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    expect(errors).toEqual([]);
  });
