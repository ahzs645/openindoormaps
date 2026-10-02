import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(
  !zip || !existsSync(zip),
  "Set INDOOR_PROJECT_ZIP to the repaired package.",
);
for (const mobile of [false, true])
  test(`stair markers, upper-floor context and elevator reviews on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
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
          (globalThis as unknown as { projectTestMap: Map }).projectTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { projectTestMap: Map })
              .projectTestMap;
            return (
              !!map?.getLayer("project-connector-markers") && !map.isMoving()
            );
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page
      .getByRole("textbox", { name: "Search indoor map" })
      .fill("04-S103");
    await page
      .getByRole("button", {
        name: "04-S103 · Stair Building 04 · Campus Floor 1",
        exact: true,
      })
      .click();
    const marker = page.getByRole("button", {
      name: "Stairs · 04-S103",
      exact: true,
    });
    await expect(marker).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Entrance needs review before directions are available."),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !(
              globalThis as unknown as { projectTestMap: Map }
            ).projectTestMap.isMoving(),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/unbc-stair-symbol-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect(marker).toBeVisible();
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByLabel("Project floor", { exact: true })
      .selectOption("storey:694");
    const sourceCount = await page.evaluate(async () => {
      const map = (globalThis as unknown as { projectTestMap: Map })
        .projectTestMap;
      const f = (await (
        map.getSource("project-exposed-walls") as GeoJSONSource
      ).getData()) as FeatureCollection;
      return f.features.reduce(
        (n, f) =>
          n +
          (f.geometry.type === "MultiPolygon"
            ? f.geometry.coordinates.length
            : 0),
        0,
      );
    });
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page.getByRole("button", { name: "Map preferences" }).click();
    const count = () =>
      page.evaluate(async () => {
        const map = (globalThis as unknown as { projectTestMap: Map })
          .projectTestMap;
        const f = (await (
          map.getSource("project-exposed-walls") as GeoJSONSource
        ).getData()) as FeatureCollection;
        return f.features.reduce(
          (n, f) =>
            n +
            (f.geometry.type === "MultiPolygon"
              ? f.geometry.coordinates.length
              : 0),
          0,
        );
      });
    await expect.poll(count).toBeLessThan(sourceCount);
    await page
      .getByRole("checkbox", { name: "Show unmapped structures", exact: true })
      .check();
    await expect.poll(count).toBe(sourceCount);
    await page
      .getByRole("checkbox", { name: "Show unmapped structures", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByText("Add elevator", { exact: true }).click();
    await page
      .getByRole("button", { name: "Save elevator review", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Enter an elevator name.",
    );
    await page
      .getByLabel("Elevator name", { exact: true })
      .fill("UI test lift");
    await page
      .getByLabel("Native elevator element ID", { exact: true })
      .fill("900");
    await page
      .getByLabel("Elevator evidence", { exact: true })
      .fill("Test-only review awaiting native model validation.");
    // Real room geometry with proposed source IDs is saved only as a review, never a route.
    await page
      .getByLabel("Elevator entrance 1 room", { exact: true })
      .selectOption({ label: "05 · Campus Floor 1 · 05-122 Studio" });
    await page
      .getByLabel("Elevator entrance 2 room", { exact: true })
      .selectOption({ label: "05 · Floor 2 · 05-223 Study Room" });
    await page
      .getByLabel("Elevator entrance 1 native ID", { exact: true })
      .fill("901");
    await page
      .getByLabel("Elevator entrance 2 native ID", { exact: true })
      .fill("902");
    await page
      .getByRole("button", { name: "Save elevator review", exact: true })
      .click();
    await expect(
      page.getByText("Awaiting model validation", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download connector review JSON" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove UI test lift", exact: true })
      .click();
    await expect(
      page.getByText("Awaiting model validation", { exact: false }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  });
