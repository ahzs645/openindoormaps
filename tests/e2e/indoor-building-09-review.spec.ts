import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { unzipSync } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
import { HALLWAY_COLOR } from "../../app/indoor-project/display-passages";
const require = createRequire(import.meta.url);
const { PNG } = require(
  path.join(
    path.dirname(require.resolve("playwright-core")),
    "lib/utilsBundle.js",
  ),
);
const zip = process.env.INDOOR_PROJECT_ZIP;
const files =
  zip && existsSync(zip)
    ? unzipSync(readFileSync(zip), {
        filter: (e) =>
          ["viewer/indoor.json", "floors/rooms.json"].includes(e.name),
      })
    : undefined;
const data: IndoorDataset | undefined = files
  ? JSON.parse(new TextDecoder().decode(files["viewer/indoor.json"]))
  : undefined;
const source = files
  ? JSON.parse(new TextDecoder().decode(files["floors/rooms.json"]))
  : undefined;
type ReviewWindow = typeof globalThis & { reviewMap: Map };
test.skip(!data, "Provide the Building09-reviewed candidate ZIP.");
for (const mobile of [false, true])
  test(`Building09 reviewed room and hallways on ${mobile ? "mobile" : "desktop"}`, async ({
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
      const url = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(url);
      const add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as ReviewWindow).reviewMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByLabel("Show pass-through places", { exact: true }).check();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    const mergeKey = "rm-1450417-ed6bced924bd",
      retiredKey = "rm-1450417-ed64bad924b7";
    expect(
      data!.records.filter((r) => r.building === "09" && r.number === "09-292"),
    ).toHaveLength(1);
    expect(data!.records.some((r) => r.key === retiredKey)).toBe(false);
    for (const target of [
      {
        number: "09-292",
        name: "Multipurpose Lab / Demo Area",
        key: mergeKey,
        flat: false,
      },
      {
        number: "09-261",
        name: "Reception",
        key: "rm-1450417-dba13529f060",
        flat: true,
      },
      {
        number: "09-315",
        name: "Chance Meeting",
        key: "rm-694-e4248d414287",
        flat: true,
      },
    ]) {
      const record = data!.records.find((r) => r.key === target.key)!,
        floor = data!.floors.find((f) => f.levelIds.includes(record.levelId))!;
      await page
        .getByLabel("Search indoor map", { exact: true })
        .fill(target.number);
      const option = page.getByRole("button", {
        name: new RegExp(`${target.number} · ${target.name}`),
      });
      await expect(option).toHaveCount(1);
      await option.click();
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toContainText(floor.name);
      await expect
        .poll(
          () =>
            page.evaluate(
              async ({ key, flat }) => {
                const map = (globalThis as ReviewWindow).reviewMap;
                const src = map?.getSource(
                  flat ? "project-areas" : "project-room-blocks",
                ) as GeoJSONSource | undefined;
                if (!src) return false;
                const collection = (await src.getData()) as FeatureCollection;
                return collection.features.some(
                  (f) =>
                    f.properties?.key === key ||
                    (f.properties?.roomKeys as string[] | undefined)?.includes(
                      key,
                    ),
                );
              },
              { key: target.key, flat: target.flat },
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
      const seed = source.annotations.find(
        (a) => a.key === target.key,
      ).labelPointFeet;
      const center = geographicPoint(data!, seed);
      const pixel = await page.evaluate(
        ({ center, mobile }) => {
          const map = (globalThis as ReviewWindow).reviewMap,
            rect = map.getCanvas().getBoundingClientRect(),
            screen = mobile ? [rect.width / 2, 230] : [900, rect.height / 2];
          map.jumpTo({
            center,
            zoom: 21.5,
            pitch: 0,
            padding: { left: 0, right: 0, top: 0, bottom: 0 },
          });
          const p = map.project(center);
          map.panBy([p.x - screen[0], p.y - screen[1]], { duration: 0 });
          return {
            x: Math.round(rect.left + screen[0]),
            y: Math.round(rect.top + screen[1] - 20),
          };
        },
        { center, mobile },
      );
      if (!target.flat) {
        await page
          .getByRole("button", { name: "All places", exact: true })
          .click();
        await page.mouse.click(pixel.x, pixel.y);
      }
      const geometry = await page.evaluate(async (key) => {
        const map = (globalThis as ReviewWindow).reviewMap,
          areas = (await (
            map.getSource("project-areas") as GeoJSONSource
          ).getData()) as FeatureCollection,
          blocks = (await (
            map.getSource("project-room-blocks") as GeoJSONSource
          ).getData()) as FeatureCollection;
        return {
          areas: areas.features
            .filter(
              (f) =>
                f.properties?.key === key ||
                (f.properties?.roomKeys as string[] | undefined)?.includes(key),
            )
            .map((f) => f.properties),
          blocks: blocks.features
            .filter((f) => f.properties?.key === key)
            .map((f) => f.properties),
        };
      }, target.key);
      if (target.flat) {
        expect(geometry.blocks).toHaveLength(0);
        expect(
          geometry.areas.some(
            (a) =>
              a?.nativeCellId &&
              a.circulation === true &&
              a.color === HALLWAY_COLOR,
          ),
        ).toBe(true);
        await page.mouse.click(pixel.x, pixel.y);
      } else {
        expect(geometry.blocks).toHaveLength(1);
        expect(geometry.blocks[0]?.height).toBeGreaterThan(0.5);
      }
      await expect(page.locator(".project-place-card")).toContainText(
        target.name,
      );
      await expect
        .poll(
          async () => {
            const image = PNG.sync.read(await page.screenshot()),
              rgb = [
                ...image.data.subarray(
                  (pixel.y * image.width + pixel.x) * 4,
                  (pixel.y * image.width + pixel.x) * 4 + 3,
                ),
              ];
            return target.flat
              ? rgb[0] > 180 &&
                  rgb[0] < 240 &&
                  rgb[1] >= rgb[0] &&
                  rgb[2] >= rgb[1]
              : rgb[0] > 240 && rgb[1] > 190 && rgb[2] < 190;
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      const frameCenter = target.flat
        ? center
        : (() => {
            const ring = data!.presentation!.rooms.find(
              (r) => r.roomKey === target.key,
            )!.interiorRingsFeet[0];
            return geographicPoint(data!, [
              (Math.min(...ring.map((p) => p[0])) +
                Math.max(...ring.map((p) => p[0]))) /
                2,
              (Math.min(...ring.map((p) => p[1])) +
                Math.max(...ring.map((p) => p[1]))) /
                2,
            ]);
          })();
      await page.evaluate(
        ({ center, mobile, flat }) => {
          const map = (globalThis as ReviewWindow).reviewMap,
            rect = map.getCanvas().getBoundingClientRect(),
            screen = mobile ? [rect.width / 2, 270] : [900, rect.height / 2];
          map.jumpTo({
            center,
            zoom: flat ? 20.5 : mobile ? 19.7 : 20.3,
            pitch: 0,
            padding: { left: 0, right: 0, top: 0, bottom: 0 },
          });
          const point = map.project(center);
          map.panBy([point.x - screen[0], point.y - screen[1]], {
            duration: 0,
          });
        },
        { center: frameCenter, mobile, flat: target.flat },
      );
      await page.screenshot({
        path: testInfo.outputPath(`${target.number}-2d.png`),
      });
      await page.getByRole("button", { name: "3D rooms", exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (globalThis as ReviewWindow).reviewMap.isMoving(),
          ),
        )
        .toBe(false);
      await page.screenshot({
        path: testInfo.outputPath(`${target.number}-3d.png`),
      });
      await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    }
    await page.getByRole("button", { name: "From here", exact: true }).click();
    await page.getByLabel("Route destination", { exact: true }).fill("09-292");
    await page
      .getByRole("option", { name: /09-292 · Multipurpose Lab \/ Demo Area/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await page.screenshot({
      path: testInfo.outputPath("chance-meeting-to-lab-route.png"),
    });
    expect(errors).toEqual([]);
  });
