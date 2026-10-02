import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the native-stairs UNBC package.");
for (const mobile of [false, true])
  test(`separate flights have markers and descending treads keep depth on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && m.text().includes("layers.project-"))
        errors.push(m.text());
    });
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
        original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { stairsMap: Map }).stairsMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              !!(
                globalThis as unknown as { stairsMap: Map }
              ).stairsMap?.getLayer("project-native-stair-boxes"),
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const center = geographicPoint(data, [72.9, 468]);
    for (const three of [false, true]) {
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await page.evaluate(
        ({ center, three, mobile }) =>
          (globalThis as unknown as { stairsMap: Map }).stairsMap.jumpTo({
            center,
            zoom: mobile ? 20.8 : 21.7,
            pitch: three ? 55 : 0,
            bearing: 0,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
          }),
        { center, three, mobile },
      );
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              !(
                globalThis as unknown as { stairsMap: Map }
              ).stairsMap.isMoving(),
          ),
        )
        .toBe(true);
      for (const id of [1_949_419, 1_982_431])
        await expect(
          page.locator(
            `.project-connector-marker[data-stair-element-id="${id}"]`,
          ),
        ).toBeVisible({ timeout: 30_000 });
      const state = await page.evaluate(async () => {
        const m = (globalThis as unknown as { stairsMap: Map }).stairsMap;
        const source = (await (
          m.getSource("project-native-stairs") as GeoJSONSource
        ).getData()) as FeatureCollection;
        return {
          down: source.features
            .filter((f) => f.properties?.stairElementId === 1_949_419)
            .map((f) => f.properties),
          depth: !!m.getLayer("project-descending-stairs"),
          filter: m.getFilter("project-native-stair-boxes"),
        };
      });
      expect(state.down).toHaveLength(5);
      expect(
        Math.min(...state.down.map((p) => Number(p?.topMetres))),
      ).toBeLessThan(-0.6);
      expect(state.depth).toBe(three);
      expect(state.filter).toEqual(["!=", ["get", "descending"], true]);
      await page.screenshot({
        path: `docs/screenshots/unbc-descending-stairs-${three ? "3d" : "2d"}-${mobile ? "mobile" : "desktop"}.png`,
      });
      if (three) {
        await page.evaluate(
          (center) =>
            (globalThis as unknown as { stairsMap: Map }).stairsMap.jumpTo({
              center,
              zoom: 23,
              pitch: 65,
              bearing: 180,
            }),
          geographicPoint(data, [79.28, 468.13]),
        );
        await page.screenshot({
          path: `docs/screenshots/unbc-descending-close-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
    }
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    for (const bearing of [45, 135, 225]) {
      await page.evaluate(
        ({ center, bearing, mobile }) =>
          (globalThis as unknown as { stairsMap: Map }).stairsMap.jumpTo({
            center,
            bearing,
            pitch: 60,
            zoom: mobile ? 21.7 : 22.3,
          }),
        { center: geographicPoint(data, [77, 467]), bearing, mobile },
      );
      const doorway = await page.evaluate(() => {
        const map = (globalThis as unknown as { stairsMap: Map }).stairsMap;
        return {
          height: map.getPaintProperty(
            "project-door-boxes",
            "fill-extrusion-height",
          ),
          base: map.getPaintProperty(
            "project-native-stair-boxes",
            "fill-extrusion-base",
          ),
          door: map.getLayoutProperty("project-door-boxes", "visibility"),
        };
      });
      expect(doorway.height).toBeLessThanOrEqual(0.02);
      expect(doorway.base).toEqual(["get", "displayBase"]);
      expect(doorway.door).toBe("visible");
      await page.screenshot({
        path: `docs/screenshots/unbc-stair-review-${bearing}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page
      .locator('.project-connector-marker[data-stair-element-id="1949419"]')
      .click();
    await expect(page.locator(".project-place-card")).toContainText("08-S101");
    expect(errors).toEqual([]);
  });
