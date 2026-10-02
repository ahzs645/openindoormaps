import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the prepared UNBC package.");
for (const mobile of [false, true])
  test(`pass-through presentation and moving roof boundaries on ${mobile ? "mobile" : "desktop"}`, async ({
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
      const { default: lib } = await import(path);
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { passageMap: Map }).passageMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 30_000,
    });
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const vestibule = data.records.find((r) => r.number === "04-122")!,
      rotunda = data.records.find((r) => r.number === "04-124")!;
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              !!(
                globalThis as unknown as { passageMap: Map }
              ).passageMap?.getLayer("project-room-boxes"),
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    const geometry = await page.evaluate(
      async ({ vestibuleKey, rotundaKey }) => {
        const map = (globalThis as unknown as { passageMap: Map }).passageMap;
        const source = async (name: string) =>
          (await (
            map.getSource(name) as GeoJSONSource
          ).getData()) as FeatureCollection;
        return {
          roofKeys: (await source("project-room-blocks")).features.map(
            (f) => f.properties?.key,
          ),
          passage: (await source("project-areas")).features
            .filter((f) =>
              [vestibuleKey, rotundaKey].includes(String(f.properties?.key)),
            )
            .map((f) => f.properties?.circulation),
          wallHeight: map.getPaintProperty(
            "project-wall-boxes",
            "fill-extrusion-height",
          ),
          roomHeight: (await source("project-room-blocks")).features[0]
            .properties?.height,
        };
      },
      { vestibuleKey: vestibule.key, rotundaKey: rotunda.key },
    );
    expect(geometry.roofKeys).not.toContain(vestibule.key);
    expect(geometry.roofKeys).not.toContain(rotunda.key);
    expect(geometry.passage).toEqual([true, true]);
    expect(geometry.wallHeight).toBeGreaterThan(Number(geometry.roomHeight));
    await page.getByLabel("Search indoor map", { exact: true }).fill("04-122");
    await expect(
      page.getByRole("button", { name: /^04-122 · Vestibule/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByLabel("Show pass-through places", { exact: true }).check();
    await expect(
      page.getByRole("button", { name: /^04-122 · Vestibule/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^04-122 · Vestibule/ }).click();
    await expect(
      page.getByRole("heading", { name: "Vestibule", exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Show pass-through places", { exact: true })
      .uncheck();
    await expect(
      page.getByRole("heading", { name: "Vestibule", exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Show vestibule doors", { exact: true }).check();
    await page.getByLabel("Show vestibule doors", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByLabel("Search indoor map", { exact: true }).fill("07-165");
    await page
      .getByRole("button", { name: /^07-165 · Sprinkler Mech room/ })
      .click();
    for (const bearing of [0, 40, 100]) {
      await page.evaluate((bearing) => {
        const map = (globalThis as unknown as { passageMap: Map }).passageMap;
        map.jumpTo({ bearing, pitch: 55, zoom: 21 });
      }, bearing);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              !(
                globalThis as unknown as { passageMap: Map }
              ).passageMap.isMoving(),
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `docs/screenshots/unbc-pass-through-${mobile ? "mobile" : "desktop"}-${bearing}.png`,
      });
    }
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
