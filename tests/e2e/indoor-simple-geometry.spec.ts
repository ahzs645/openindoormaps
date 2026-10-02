import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the prepared UNBC project.");
for (const mobile of [false, true])
  test(`simplified Agora walls can be restored on ${mobile ? "mobile" : "desktop"}`, async ({
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
        (globalThis as unknown as { simpleMap: Map }).simpleMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("07-170");
    await page
      .getByRole("button", { name: /^07-170 · Multi Purpose Seminar/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !(
              globalThis as unknown as { simpleMap: Map }
            ).simpleMap?.isMoving(),
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      (globalThis as unknown as { simpleMap: Map }).simpleMap.jumpTo({
        zoom: 20.5,
        pitch: 55,
      }),
    );
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const wallPoint = geographicPoint(data, [0.9, 354.5]);
    const hasPost = async () => {
      const collection = (await page.evaluate(
        async () =>
          await (
            (globalThis as unknown as { simpleMap: Map }).simpleMap.getSource(
              "project-exposed-walls",
            ) as GeoJSONSource
          ).getData(),
      )) as FeatureCollection<MultiPolygon>;
      const { default: contains } = await import(
        "@turf/boolean-point-in-polygon"
      );
      return collection.features.some((f) => contains(wallPoint, f));
    };
    const waitForRender = () =>
      expect
        .poll(
          () =>
            page.evaluate(() => {
              const map = (globalThis as unknown as { simpleMap: Map })
                .simpleMap;
              return (
                !map.isMoving() &&
                map.isSourceLoaded("project-exposed-walls") &&
                map.isSourceLoaded("project-room-blocks")
              );
            }),
          { timeout: 30_000 },
        )
        .toBe(true);
    await expect.poll(hasPost).toBe(false);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    const checkbox = page.getByLabel("Simplify map geometry", { exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect.poll(hasPost, { timeout: 30_000 }).toBe(true);
    await waitForRender();
    await page.screenshot({
      path: `docs/screenshots/unbc-agora-detailed-${mobile ? "mobile" : "desktop"}.png`,
    });
    await checkbox.check();
    await expect.poll(hasPost, { timeout: 30_000 }).toBe(false);
    await waitForRender();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.screenshot({
      path: `docs/screenshots/unbc-agora-simple-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.evaluate(() =>
      (globalThis as unknown as { simpleMap: Map }).simpleMap.jumpTo({
        zoom: 20.5,
        pitch: 0,
      }),
    );
    await expect.poll(hasPost).toBe(false);
    await waitForRender();
    await page.screenshot({
      path: `docs/screenshots/unbc-agora-simple-2d-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
