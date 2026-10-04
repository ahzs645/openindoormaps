import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
type TestWindow = typeof globalThis & { building10Map: Map };
type RenderCollection = FeatureCollection<
  MultiPolygon,
  { key: string; roomKeys?: string[]; height: number; circulation: boolean }
>;
import type { IndoorDataset } from "../../app/indoor-project/contract";
const zip = process.env.INDOOR_PROJECT_ZIP;
for (const mobile of [false, true])
  test(`Building 10 open areas and reviewed native rooms on ${mobile ? "mobile" : "desktop"}`, async ({
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
          (globalThis as TestWindow).building10Map = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    for (const number of [
      "10-3072",
      "10-2520",
      "10-4302",
      "10-4306",
      "10-4504",
      "10-4068",
      "10-4070",
    ]) {
      const record = data.records.find((r) => r.number === number)!;
      if (record.circulation) {
        await page
          .getByRole("combobox", { name: "Route start", exact: true })
          .fill(number);
        await page
          .getByRole("option", { name: new RegExp(`^${number} ·`) })
          .click();
      } else {
        if (number === "10-4068")
          await page.getByRole("button", { name: "Back", exact: true }).click();
        await page
          .getByRole("textbox", { name: "Search indoor map", exact: true })
          .fill(number);
        await page
          .getByRole("button", { name: new RegExp(`^${number} ·`) })
          .click();
      }
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "3D rooms", exact: true }).click();
      const proof = await page.evaluate(
        async ({ key }) => {
          const map = (globalThis as TestWindow).building10Map;
          const areas = (await (
              map.getSource("project-areas") as GeoJSONSource
            ).getData()) as RenderCollection,
            blocks = (await (
              map.getSource("project-room-blocks") as GeoJSONSource
            ).getData()) as RenderCollection,
            selection = (await (
              map.getSource("project-selection-areas") as GeoJSONSource
            ).getData()) as RenderCollection;
          return {
            area: areas.features.find(
              (f) =>
                f.properties.key === key ||
                f.properties.roomKeys?.includes(key),
            ),
            blocks: blocks.features.filter((f) => f.properties.key === key),
            selection: selection.features.find((f) => f.properties.key === key),
            paint: map.getPaintProperty(
              "project-room-boxes",
              "fill-extrusion-color",
            ),
          };
        },
        { key: record.key },
      );
      if (record.circulation) {
        expect(proof.blocks).toHaveLength(0);
        expect(proof.area?.properties.circulation).toBe(true);
      } else {
        expect(proof.blocks.length).toBeGreaterThan(0);
        expect(proof.selection).toBeTruthy();
        expect(JSON.stringify(proof.paint)).toContain(record.key);
        expect(proof.blocks[0].properties.height).toBeGreaterThan(0);
      }
      if (["10-3072", "10-4504", "10-4070"].includes(number))
        await page.screenshot({
          path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/${number}-upper-review-${mobile ? "mobile" : "desktop"}.png`,
        });
    }
    expect(errors).toEqual([]);
  });
