import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import type { Map } from "maplibre-gl";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the UNBC project.");
for (const mobile of [false, true]) {
  test(`basemap building visibility and exclusion areas work on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /filter|expression/i.test(m.text()))
        errors.push(m.text());
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(url),
        original = lib.Map.prototype.fitBounds;
      lib.Map.prototype.fitBounds = function (
        this: Map,
        ...args: Parameters<Map["fitBounds"]>
      ) {
        (globalThis as unknown as { basemapTestMap: Map }).basemapTestMap =
          this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { basemapTestMap: Map })
              .basemapTestMap;
            return !!map && map.loaded() && !map.isMoving();
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    const snapshots = () =>
      page.evaluate(() => {
        const map = (globalThis as unknown as { basemapTestMap: Map })
          .basemapTestMap;
        const layers = map.getStyle().layers;
        return {
          buildings: layers
            .filter(
              (l) => "source-layer" in l && l["source-layer"] === "building",
            )
            .map((l) => map.getFilter(l.id) ?? null),
          roads: layers
            .filter(
              (l) =>
                "source-layer" in l && l["source-layer"] === "transportation",
            )
            .map((l) => map.getFilter(l.id) ?? null),
        };
      });
    const original = await snapshots();
    expect(original.buildings.length).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    const mode = page.getByLabel("Basemap buildings", { exact: true });
    await mode.selectOption("hide");
    await expect
      .poll(async () =>
        (await snapshots()).buildings.every((f) =>
          JSON.stringify(f).includes('["literal",1]'),
        ),
      )
      .toBe(true);
    expect((await snapshots()).roads).toEqual(original.roads);
    await mode.selectOption("campus");
    await expect
      .poll(async () =>
        (await snapshots()).buildings.every((f) =>
          JSON.stringify(f).includes('"in"'),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/unbc-basemap-campus-${mobile ? "mobile" : "desktop"}.png`,
    });
    await mode.selectOption("show");
    await expect
      .poll(async () => (await snapshots()).buildings)
      .toEqual(original.buildings);
    await mode.selectOption("areas");
    await page
      .getByRole("button", { name: "Draw rectangle", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Choose the first corner" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByText("Choose the first corner of the area.", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove Area 1", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Draw rectangle", exact: true })
      .click();
    const point = await page.evaluate((mobile) => {
      const map = (globalThis as unknown as { basemapTestMap: Map })
        .basemapTestMap;
      const features = map.querySourceFeatures("openmaptiles", {
        sourceLayer: "building",
      });
      const feature = features.find(
        (f) => f.geometry.type === "Polygon" && f.id !== undefined,
      )!;
      const coordinate = (feature.geometry as GeoJSON.Polygon)
        .coordinates[0][0] as [number, number];
      map.jumpTo({
        center: coordinate,
        zoom: 19,
        pitch: 0,
        padding: {
          left: mobile ? 0 : 380,
          right: 0,
          top: 0,
          bottom: mobile ? 350 : 0,
        },
      });
      const p = map.project(coordinate);
      return { x: p.x, y: p.y, coordinate };
    }, mobile);
    const canvas = page.locator(".maplibregl-canvas");
    await canvas.click({ position: { x: point.x - 55, y: point.y - 55 } });
    await expect(
      page.getByText("Choose the opposite corner.", { exact: true }),
    ).toBeVisible();
    await canvas.click({ position: { x: point.x + 55, y: point.y + 55 } });
    await expect(
      page.getByText("Choose the opposite corner.", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove Area 1", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (await snapshots()).buildings.every((f) =>
          JSON.stringify(f).includes('"in"'),
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open level selector", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Campus Floor 3", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open level selector", exact: true }),
    ).toContainText("Campus Floor 3");
    await expect
      .poll(async () =>
        (await snapshots()).buildings.every((f) =>
          JSON.stringify(f).includes('"in"'),
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove Area 1", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshots()).buildings)
      .toEqual(original.buildings);
    await page
      .getByRole("button", { name: "Draw polygon", exact: true })
      .click();
    await page.evaluate(
      ({ mobile, coordinate }) => {
        const map = (globalThis as unknown as { basemapTestMap: Map })
          .basemapTestMap;
        map.jumpTo({
          center: coordinate,
          zoom: 19,
          pitch: 0,
          padding: {
            left: mobile ? 0 : 380,
            right: 0,
            top: 0,
            bottom: mobile ? 350 : 0,
          },
        });
      },
      { mobile, coordinate: point.coordinate },
    );
    const finish = page.getByRole("button", {
      name: "Finish polygon",
      exact: true,
    });
    await expect(finish).toBeDisabled();
    for (const [x, y] of [
      [-55, -55],
      [55, 55],
      [-55, 55],
      [55, -55],
    ])
      await canvas.click({ position: { x: point.x + x, y: point.y + y } });
    await finish.click();
    await expect(page.getByRole("alert")).toContainText(
      "Polygon edges cannot cross",
    );
    await page.getByRole("button", { name: "Undo point", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove Area 1", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Draw polygon", exact: true })
      .click();
    const offsets = [
      [-55, -55],
      [-15, -55],
      [-15, -15],
      [55, -15],
      [55, 55],
      [-55, 55],
    ];
    for (const [i, [x, y]] of offsets.entries()) {
      await canvas.click({ position: { x: point.x + x, y: point.y + y } });
      if (i === 1) await expect(finish).toBeDisabled();
    }
    await canvas.click({ position: { x: point.x - 55, y: point.y } });
    await page.getByRole("button", { name: "Undo point", exact: true }).click();
    await expect(
      page.getByText("Choose polygon corners · 6 added.", { exact: true }),
    ).toBeVisible();
    const draft = await page.evaluate(async () => {
      const map = (globalThis as unknown as { basemapTestMap: Map })
        .basemapTestMap;
      return await (
        map.getSource(
          "project-basemap-area-draft",
        ) as import("maplibre-gl").GeoJSONSource
      ).getData();
    });
    expect(
      draft.features.filter((f) => f.geometry.type === "Point"),
    ).toHaveLength(6);
    expect(
      draft.features.find((f) => f.geometry.type === "Polygon")?.geometry
        .coordinates[0],
    ).toHaveLength(7);
    await page.screenshot({
      path: `docs/screenshots/unbc-basemap-polygon-${mobile ? "mobile" : "desktop"}.png`,
    });
    await finish.click();
    await expect(finish).toHaveCount(0);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove Area 1", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        (await snapshots()).buildings.every((f) =>
          JSON.stringify(f).includes('"in"'),
        ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
}
