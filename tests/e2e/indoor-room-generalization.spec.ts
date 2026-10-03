import { test, expect } from "@playwright/test";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`generalized room remains selectable in 2D and 3D on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!data, "Set INDOOR_PROJECT_ZIP to UNBC.master.reviter.zip.");
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached({
      timeout: 30_000,
    });
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
          (
            globalThis as unknown as { generalizationMap: Map }
          ).generalizationMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    const record = data!.records.find((r) => r.number === "10-1034")!;
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByLabel("Find project area", { exact: true }).fill("10-1034");
    await page
      .getByRole("button", {
        name: `10-1034 · ${record.name} · #${record.levelId}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expect(
      page.getByLabel("Simplify map geometry", { exact: true }),
    ).not.toBeChecked();
    await page.getByLabel("Simplify map geometry", { exact: true }).check();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    const center = geographicPoint(data!, [80.6, 829.2]);
    for (const mode of ["2D rooms", "3D rooms", "3D relative heights"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await expect
        .poll(
          () =>
            page.evaluate(async (key) => {
              const map = (globalThis as unknown as { generalizationMap: Map })
                .generalizationMap;
              if (
                !map?.getSource("project-room-blocks") ||
                !map.getSource("project-selection-areas")
              )
                return false;
              const sources = await Promise.all(
                ["project-room-blocks", "project-selection-areas"].map(
                  async (id) =>
                    (await (
                      map.getSource(id) as GeoJSONSource
                    ).getData()) as FeatureCollection<MultiPolygon>,
                ),
              );
              return sources.every((s) => {
                const f = s.features.find((f) => f.properties?.key === key);
                return (
                  f?.properties?.cartographicShape === "rectangle" &&
                  f.geometry.coordinates[0][0].length === 5
                );
              });
            }, record.key),
          { timeout: 45_000 },
        )
        .toBe(true);
      await expect(page.getByTestId("floor-preparation")).toBeHidden({
        timeout: 45_000,
      });
      const connectedDoorIds = data!
        .doors!.filter((d) => d.roomKeys.includes(record.key))
        .map((d) => d.id);
      const markers = await page.evaluate(async (ids) => {
        const map = (globalThis as unknown as { generalizationMap: Map })
          .generalizationMap;
        const collection = (await (
          map.getSource("project-doors") as GeoJSONSource
        ).getData()) as FeatureCollection;
        return collection.features
          .filter((f) => ids.includes(String(f.properties?.id)))
          .map((f) => ({
            id: f.properties?.id,
            base: f.properties?.displayDoorBase,
            height: f.properties?.displayDoorHeight,
            coordinates: f.geometry,
          }));
      }, connectedDoorIds);
      expect(markers).toHaveLength(2);
      expect(markers.every((m) => m.base === 0.6 && m.height === 0.61)).toBe(
        true,
      );
      await page.evaluate(
        ({ center, mode, mobile }) => {
          const map = (globalThis as unknown as { generalizationMap: Map })
            .generalizationMap;
          map.jumpTo({
            center: center as [number, number],
            zoom: mobile ? 20.5 : 21,
            bearing: mode === "2D rooms" ? -32 : -12,
            pitch: mode === "2D rooms" ? 0 : 48,
            padding: mobile
              ? { top: 80, bottom: 300, left: 20, right: 20 }
              : { left: 400, right: 40, top: 40, bottom: 40 },
          });
        },
        { center, mode, mobile },
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { generalizationMap: Map })
              .generalizationMap;
            return map.loaded();
          }),
        )
        .toBe(true);
      const sources = await page.evaluate(async () => {
        const map = (globalThis as unknown as { generalizationMap: Map })
          .generalizationMap;
        return Object.fromEntries(
          await Promise.all(
            [
              "project-room-blocks",
              "project-exposed-walls",
              "project-areas",
            ].map(async (id) => [
              id,
              await (map.getSource(id) as GeoJSONSource).getData(),
            ]),
          ),
        );
      });
      writeFileSync(
        `work/room-generalization/browser-sources-${mode.replaceAll(" ", "-")}-${mobile ? "mobile" : "desktop"}.json`,
        JSON.stringify(sources),
      );
      await page.screenshot({
        path: `docs/screenshots/unbc-generalized-${mode.replaceAll(" ", "-").toLowerCase()}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    // Revert the illustration option: source detail is still available.
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByLabel("Simplify map geometry", { exact: true }).uncheck();
    await expect
      .poll(
        () =>
          page.evaluate(async (key) => {
            const map = (globalThis as unknown as { generalizationMap: Map })
              .generalizationMap;
            const s = (await (
              map.getSource("project-room-blocks") as GeoJSONSource
            ).getData()) as FeatureCollection<MultiPolygon>;
            const feature = s.features.find((f) => f.properties?.key === key);
            return (
              !!feature &&
              feature.properties?.cartographicShape !== "rectangle" &&
              feature.geometry.coordinates.flatMap((p) => p.flat()).length > 5
            );
          }, record.key),
        { timeout: 30_000 },
      )
      .toBe(true);
    await expect(page.getByTestId("floor-preparation")).toBeHidden({
      timeout: 45_000,
    });
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.evaluate(
      ({ center, mobile }) => {
        const map = (globalThis as unknown as { generalizationMap: Map })
          .generalizationMap;
        map.jumpTo({
          center: center as [number, number],
          zoom: mobile ? 20.5 : 21,
          bearing: -32,
          pitch: 0,
        });
      },
      { center, mobile },
    );
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { generalizationMap: Map }
          ).generalizationMap.loaded(),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/unbc-detailed-2d-rooms-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
  });
