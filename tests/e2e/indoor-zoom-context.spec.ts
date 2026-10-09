import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";

const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the prepared UNBC package.");

for (const mobile of [false, true]) {
  test(`building overview replaces corridor clutter on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
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
      const original = lib.Map.prototype.fitBounds;
      lib.Map.prototype.fitBounds = function (
        this: Map,
        ...args: Parameters<Map["fitBounds"]>
      ) {
        (globalThis as unknown as { zoomTestMap: Map }).zoomTestMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-136");
    await page
      .getByRole("button", { name: /^05-136 · Library Services Desk/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(
              globalThis as unknown as { zoomTestMap: Map }
            ).zoomTestMap?.getLayer("project-roof-labels"),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !(
              globalThis as unknown as { zoomTestMap: Map }
            ).zoomTestMap.isMoving(),
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      (globalThis as unknown as { zoomTestMap: Map }).zoomTestMap.jumpTo({
        zoom: 21,
        pitch: 55,
        bearing: 0,
      }),
    );
    const room = page
      .locator('[data-testid="project-3d-labels"] > div')
      .filter({ hasText: "Library Services Desk" });
    await expect(room).toBeVisible();
    for (const passage of await page
      .locator('[data-testid="project-3d-labels"] > div')
      .filter({ hasText: /Library corridor|Agora corridor|Open Area/ })
      .all())
      await expect(passage).toBeHidden();
    await expect(page.locator('[data-room-key="building:05"]')).toBeHidden();
    await page.screenshot({
      path: `docs/screenshots/unbc-quiet-rooms-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.evaluate(() =>
      (globalThis as unknown as { zoomTestMap: Map }).zoomTestMap.jumpTo({
        zoom: 17.3,
        pitch: 0,
        bearing: 0,
      }),
    );
    await expect(page.locator('[data-room-key="building:05"]')).toBeVisible();
    await expect(room).toBeHidden();
    await page.screenshot({
      path: `docs/screenshots/unbc-building-overview-${mobile ? "mobile" : "desktop"}.png`,
    });
    // Intermediate zoom has partially visible room and building labels in both directions.
    for (const zoom of [17.8, 18, 18.2, 18, 17.8]) {
      await page.evaluate(
        (z) =>
          (globalThis as unknown as { zoomTestMap: Map }).zoomTestMap.jumpTo({
            zoom: z,
            pitch: 55,
          }),
        zoom,
      );
      await expect
        .poll(() =>
          room.evaluate((e) => Number((e as HTMLElement).style.opacity)),
        )
        .toBeCloseTo(zoom - 17.5, 1);
      const alpha = await room.evaluate((e) =>
        Number((e as HTMLElement).style.opacity),
      );
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      await expect
        .poll(() =>
          page
            .locator('[data-room-key="building:05"]')
            .evaluate((e) => Number((e as HTMLElement).style.opacity)),
        )
        .toBeCloseTo(Math.min(1, 19.5 - zoom), 1);
      if (zoom === 18)
        await page.screenshot({
          path: `docs/screenshots/unbc-zoom-gradient-${mobile ? "mobile" : "desktop"}.png`,
        });
    }
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    const style = await page.evaluate(async () => {
      const map = (globalThis as unknown as { zoomTestMap: Map }).zoomTestMap;
      const overview = await (
        map.getSource("project-overview") as GeoJSONSource
      ).getData();
      if (overview.type !== "FeatureCollection")
        throw new Error("Expected overview FeatureCollection");
      return {
        outline: map.getFilter("project-area-outline"),
        labelOpacity: map.getPaintProperty("project-label", "text-opacity"),
        roomColor: map.getPaintProperty("project-room-fill", "fill-color"),
        detailMinZoom: map.getLayer("project-room-fill")?.minzoom,
        overviewFeatures: overview.features.length,
      };
    });
    expect(style.outline).toEqual(["==", ["get", "key"], "__review_only"]);
    expect(style.labelOpacity).toContain("interpolate");
    expect(style.roomColor).toContain("interpolate");
    expect(style.detailMinZoom).toBe(17.5);
    expect(style.overviewFeatures).toBeGreaterThan(4);
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("05-120");
    await page
      .getByRole("option", { name: /^05-120 · Library corridor/ })
      .click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "44.4",
    );
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
