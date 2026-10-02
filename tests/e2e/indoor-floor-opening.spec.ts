import { expect, test } from "@playwright/test";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { generateFloorOpeningFixture } from "../fixtures/indoor-floor-opening";
import { geographicPoint } from "../../app/indoor-project/routing";

for (const mobile of [false, true])
  test(`synthetic lower floor aperture renders real pixels in 2D and 3D on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const fixture = await generateFloorOpeningFixture(
      testInfo.outputPath("synthetic-floor-opening.reviter.zip"),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const resource = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(resource);
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { apertureTestMap: Map }).apertureTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(fixture.path);
    await expect(page.getByRole("status")).toContainText("Loaded 4", {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Open level selector" }).click();
    await page
      .getByRole("menuitemradio", { name: "Level 2", exact: true })
      .click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              !!(
                globalThis as unknown as { apertureTestMap: Map }
              ).apertureTestMap?.getLayer("project-lower-depth"),
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.evaluate(
      ({ mobile, center }) => {
        const map = (globalThis as unknown as { apertureTestMap: Map })
          .apertureTestMap;
        // Cancel the initial fit and use the fixture centre, independent of
        // asynchronous level-fit effects and the mobile browse panel.
        map.stop();
        map.setPadding(
          mobile
            ? { left: 20, right: 20, top: 100, bottom: 300 }
            : { left: 380, right: 50, top: 90, bottom: 80 },
        );
        map.jumpTo({
          center,
          zoom: mobile ? 19.5 : 20.5,
          pitch: 55,
          bearing: 0,
        });
      },
      { mobile, center: geographicPoint(fixture.data, [40, 30, 12]) },
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !(
              globalThis as unknown as { apertureTestMap: Map }
            ).apertureTestMap.isMoving(),
        ),
      )
      .toBe(true);
    const initial = await page.evaluate(async () => {
      const map = (globalThis as unknown as { apertureTestMap: Map })
        .apertureTestMap;
      const lower = (await (
        map.getSource("project-lower-rooms") as GeoJSONSource
      ).getData()) as FeatureCollection;
      return {
        lowerKeys: lower.features.map((f) => f.properties?.key),
        depth: lower.features[0].properties?.baseMetres,
        type: map.getLayer("project-lower-depth")?.type,
      };
    });
    expect(initial).toEqual({
      lowerKeys: ["lower-main"],
      depth: -12 * 0.3048,
      type: "custom",
    });
    const countPink = async () => {
      const png = await page.locator("canvas.maplibregl-canvas").screenshot();
      return page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let pink = 0;
        for (let i = 0; i < rgba.length; i += 4)
          if (rgba[i] > 150 && rgba[i + 1] < 80 && rgba[i + 2] > 60) pink++;
        return pink;
      }, png.toString("base64"));
    };
    await expect.poll(countPink, { timeout: 15_000 }).toBeGreaterThan(50);
    await expect(
      page.locator(
        '[data-testid="project-3d-labels"] [data-room-key="upper-room"]',
      ),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(
        `synthetic-openings-${mobile ? "mobile" : "desktop"}-3d.png`,
      ),
    });
    // Removing the actual framebuffer layer removes the distinctive pixels: a
    // populated GeoJSON source alone cannot satisfy this rendering regression.
    await page.evaluate(() => {
      const map = (globalThis as unknown as { apertureTestMap: Map })
        .apertureTestMap;
      map.removeLayer("project-lower-depth");
      map.triggerRepaint();
    });
    await expect.poll(countPink).toBe(0);
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { apertureTestMap: Map }
          ).apertureTestMap.getPitch(),
        ),
      )
      .toBe(0);
    await expect.poll(countPink).toBeGreaterThan(50);
    await expect(page.getByTestId("project-3d-labels")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `synthetic-openings-${mobile ? "mobile" : "desktop"}-2d.png`,
      ),
    });
    expect(errors).toEqual([]);
  });
