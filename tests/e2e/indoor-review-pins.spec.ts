import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the UNBC prepared package.");
for (const mobile of [false, true])
  test(`drop, move, export and restore review dot on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
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
          (globalThis as unknown as { pinMap: Map }).pinMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 30_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByLabel("Select source walls", { exact: true }).check();
    await page.getByLabel("Native wall ID", { exact: true }).fill("948472");
    await page.getByRole("button", { name: "Find wall", exact: true }).click();
    await page
      .getByRole("button", { name: "Show wall on map", exact: true })
      .click();
    await page
      .getByLabel("Pin native level", { exact: true })
      .selectOption("311");
    await page.getByRole("button", { name: "Drop pin", exact: true }).click();
    const canvas = page.locator(".maplibregl-canvas");
    await canvas.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as unknown as { pinMap: Map }).pinMap;
          return !map.isMoving() && map.getPitch() === 0;
        }),
      )
      .toBe(true);
    const point = await page.evaluate(async () => {
      const map = (globalThis as unknown as { pinMap: Map }).pinMap;
      const walls = (await (
        map.getSource("project-review-walls") as GeoJSONSource
      ).getData()) as FeatureCollection<MultiPolygon>;
      const ring = walls.features.find(
        (f) => f.properties?.nativeElementId === 948_472,
      )!.geometry.coordinates[0][0];
      const center: [number, number] = [
        (Math.min(...ring.map((p) => p[0])) +
          Math.max(...ring.map((p) => p[0]))) /
          2,
        (Math.min(...ring.map((p) => p[1])) +
          Math.max(...ring.map((p) => p[1]))) /
          2,
      ];
      const p = map.project(center);
      return { x: p.x, y: p.y };
    });
    let box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + point.x, box.y + point.y);
    await expect(
      page.getByRole("heading", {
        name: "Selected reference pin",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("review-pin-panel")).toContainText(
      "proximity hint",
    );
    await page
      .getByLabel("Review pin label", { exact: true })
      .fill("Wall gap review");
    await page
      .getByLabel("Review pin notes", { exact: true })
      .fill("Check whether these two walls should join.");
    await page
      .getByRole("button", { name: "Save pin notes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Wall gap review", exact: true }),
    ).toBeVisible();
    const originalPin = await page.evaluate(async () => {
      const map = (globalThis as unknown as { pinMap: Map }).pinMap;
      return (
        (await (
          map.getSource("project-review-pins") as GeoJSONSource
        ).getData()) as FeatureCollection<Point>
      ).features[0];
    });
    await page.getByRole("button", { name: "Move pin", exact: true }).click();
    await canvas.scrollIntoViewIfNeeded();
    box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + point.x + 35, box.y + point.y + 25);
    await expect(page.getByTestId("review-pin-panel")).toContainText(
      "Wall gap review",
    );
    const moved = await page.evaluate(async () => {
      const map = (globalThis as unknown as { pinMap: Map }).pinMap;
      return (
        (await (
          map.getSource("project-review-pins") as GeoJSONSource
        ).getData()) as FeatureCollection<Point>
      ).features;
    });
    expect(moved).toHaveLength(1);
    expect(moved[0].properties?.id).toBe(originalPin.properties?.id);
    expect(moved[0].geometry.coordinates).not.toEqual(
      originalPin.geometry.coordinates,
    );
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => !(globalThis as unknown as { pinMap: Map }).pinMap.isMoving(),
        ),
      )
      .toBe(true);
    let pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download pin review", exact: true })
      .click();
    let download = await pending;
    const bundle = testInfo.outputPath("pin-review.zip");
    await download.saveAs(bundle);
    const files = unzipSync(readFileSync(bundle)),
      context = JSON.parse(strFromU8(files["review.json"]));
    expect(context.pin.id).toBe(originalPin.properties?.id);
    expect(context.pin.notes).toContain("walls should join");
    expect(context.pin.levelId).toBe(311);
    expect(files["map.png"].length).toBeGreaterThan(10_000);
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const link = page.getByRole("link", {
      name: "Download reviewed ZIP",
      exact: true,
    });
    await expect(link).toBeVisible({ timeout: 30_000 });
    pending = page.waitForEvent("download");
    await link.click();
    download = await pending;
    const saved = testInfo.outputPath("project-with-pin.zip");
    await download.saveAs(saved);
    const exported = unzipSync(readFileSync(saved));
    const roomReviews = JSON.parse(strFromU8(exported["floors/rooms.json"]));
    expect(roomReviews.reviewPins.pins).toHaveLength(1);
    expect(roomReviews.reviewPins.pins[0]).toEqual(context.pin);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const nextData = JSON.parse(strFromU8(exported["viewer/indoor.json"]));
    expect(nextData.nodes).toEqual(data.nodes);
    expect(nextData.edges).toEqual(data.edges);
    await page.locator('input[type="file"]').setInputFiles(saved);
    await expect(
      page.getByRole("button", {
        name: "Export reviewed project",
        exact: true,
      }),
    ).toBeEnabled({ timeout: 30_000 });
    await expect(
      page.getByRole("button", { name: "Wall gap review", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: "Wall gap review", exact: true })
      .click();
    await expect(
      page.getByLabel("Review pin notes", { exact: true }),
    ).toHaveValue("Check whether these two walls should join.");
    await page
      .getByRole("button", { name: "Show pin on map", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () => !(globalThis as unknown as { pinMap: Map }).pinMap.isMoving(),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/unbc-review-pin-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Remove pin", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Wall gap review", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
