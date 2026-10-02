import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the UNBC prepared package.");
for (const mobile of [false, true])
  test(`select native wall and export AI evidence on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /Cannot (?:add|style)|project-review-wall/.test(message.text())
      )
        errors.push(message.text());
    });
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
          (globalThis as unknown as { wallMap: Map }).wallMap = this;
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
    await page.getByLabel("Native wall ID", { exact: true }).fill("948595");
    await page.getByRole("button", { name: "Find wall", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Selected wall area", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("wall-review-panel")).toContainText(
      "approximate bounds envelope",
    );
    await page
      .getByRole("button", { name: "Show wall on map", exact: true })
      .click();
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    const mapCanvas = page.locator(".maplibregl-canvas");
    await mapCanvas.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as unknown as { wallMap: Map }).wallMap;
          return map && !map.isMoving() && map.getPitch() === 0;
        }),
      )
      .toBe(true);
    // Click an actual source footprint under a room block, and check the selected source identity.
    const hit = await page.evaluate(async () => {
      const map = (globalThis as unknown as { wallMap: Map }).wallMap;
      const features = (await (
        map.getSource("project-review-walls") as GeoJSONSource
      ).getData()) as FeatureCollection<MultiPolygon>;
      const shape = features.features.find(
        (f) => f.properties?.nativeElementId === 948_595,
      )!;
      const points = shape.geometry.coordinates[0][0];
      const x =
        (Math.min(...points.map((p) => p[0])) +
          Math.max(...points.map((p) => p[0]))) /
        2;
      const y =
        (Math.min(...points.map((p) => p[1])) +
          Math.max(...points.map((p) => p[1]))) /
        2;
      const screen = map.project([x, y]);
      const hits = map.queryRenderedFeatures(
        [
          [screen.x - 3, screen.y - 3],
          [screen.x + 3, screen.y + 3],
        ],
        { layers: ["project-review-wall-fill"] },
      );
      hits.sort(
        (a, b) =>
          Number(a.properties?.areaFeet2) - Number(b.properties?.areaFeet2),
      );
      return {
        x: screen.x,
        y: screen.y,
        id: hits[0].properties!.nativeElementId,
      };
    });
    const box = (await mapCanvas.boundingBox())!;
    await page.mouse.click(box.x + hit.x, box.y + hit.y);
    await expect(page.getByTestId("wall-review-panel")).toContainText(
      `Wall #${hit.id}`,
    );
    // Find the uncertain source envelope again; image export must retain the exact native geometry.
    await page.getByLabel("Native wall ID", { exact: true }).fill("948595");
    await page.getByRole("button", { name: "Find wall", exact: true }).click();
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await page
      .getByRole("button", { name: "Show wall on map", exact: true })
      .click();
    await page
      .getByLabel("Wall review notes", { exact: true })
      .fill("Check this wall envelope and nearby room corners.");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page
      .getByRole("button", { name: "Copy AI context", exact: true })
      .click();
    await expect(page.getByTestId("wall-review-panel")).toContainText(
      "Copied wall source context.",
    );
    const copied = JSON.parse(
      await page.evaluate(() => navigator.clipboard.readText()),
    );
    expect(copied.selection.nativeElementId).toBe(948_595);
    expect(copied.reviewNotes).toContain("nearby room corners");
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download AI review", exact: true })
      .click();
    const download = await pending;
    const output = testInfo.outputPath("wall-review.zip");
    await download.saveAs(output);
    const files = unzipSync(readFileSync(output));
    const context = JSON.parse(strFromU8(files["review.json"]));
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    expect(context.selection.nativeElementId).toBe(948_595);
    expect(context.source.modelSha256).toBe(data.source.modelSha256);
    expect(context.selection.partsFeet).toEqual(
      data.walls
        .filter((w) => w.levelId === 311 && w.nativeElementId === 948_595)
        .map((w) => w.ringsFeet),
    );
    expect(context.reviewNotes).toContain("nearby room corners");
    expect(context.camera.pitch).toBeGreaterThan(0);
    expect(files["map.png"].slice(0, 8)).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect(files["map.png"].length).toBeGreaterThan(10_000);
    await expect(page.getByTestId("wall-review-panel")).toContainText(
      "Downloaded map image and source context",
    );
    await page.screenshot({
      path: `docs/screenshots/unbc-wall-review-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
