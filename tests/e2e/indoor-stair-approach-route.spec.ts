import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";

const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
const start = "rm-311-8e1b19ddd9ef";
const end = "rm-1487816-1942e041e15e";
const approachEdge =
  "native-cell:3.280840:43:walk:door:1487816:1630256:1|door:1487816:2018182:1";

test.skip(!data, "Provide the consolidated UNBC master ZIP.");
for (const mobile of [false, true]) {
  test(`Agora to Building 10 keeps the native stair flight and straight landing approach on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .some((resource) =>
              resource.name.includes("/deps/maplibre-gl.js?"),
            ),
        ),
      )
      .toBe(true);
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((resource) => resource.name)
        .find((name) => name.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path);
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { stairRouteMap: Map }).stairRouteMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByLabel("Route start", { exact: true }).selectOption(start);
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption(end);
    await expect(page.getByTestId("project-route-result")).toContainText(
      "206.3 m",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    const edge = data!.edges.find((edge) => edge.id === approachEdge)!;
    const endpoints = [edge.pointsFeet[0], edge.pointsFeet.at(-1)!].map(
      (point) => geographicPoint(data!, point),
    );
    await expect
      .poll(
        () =>
          page.evaluate(async (endpoints) => {
            const map = (globalThis as unknown as { stairRouteMap: Map })
              .stairRouteMap;
            const source = map?.getSource("project-route") as
              | GeoJSONSource
              | undefined;
            if (!source) return false;
            const features = (
              (await source.getData()) as FeatureCollection<LineString>
            ).features;
            const near = (a: number[], b: number[]) =>
              Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-10;
            return features.some((feature) => {
              const coordinates = feature.geometry.coordinates;
              return (
                coordinates.length === 2 &&
                near(coordinates[0], endpoints[0]) &&
                near(coordinates[1], endpoints[1])
              );
            });
          }, endpoints),
        { timeout: 60_000 },
      )
      .toBe(true);
    const flight = data!.edges.find(
      (edge) =>
        edge.nativeElementId === 1_620_957 && edge.kind === "local-steps",
    )!;
    const flightCoordinates = flight.pointsFeet.map((point) =>
      geographicPoint(data!, point),
    );
    await expect
      .poll(
        () =>
          page.evaluate(async (expected) => {
            const map = (globalThis as unknown as { stairRouteMap: Map })
              .stairRouteMap;
            const features = (
              (await (
                map.getSource("project-route") as GeoJSONSource
              ).getData()) as FeatureCollection<LineString>
            ).features;
            return features.some(
              (feature) =>
                JSON.stringify(feature.geometry.coordinates) ===
                JSON.stringify(expected),
            );
          }, flightCoordinates),
        { timeout: 60_000 },
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    for (const three of [false, true]) {
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await expect(page.getByTestId("floor-preparation")).toBeHidden({
        timeout: 60_000,
      });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const map = (globalThis as unknown as { stairRouteMap: Map })
                .stairRouteMap;
              return (
                map?.getContainer().isConnected &&
                map.isStyleLoaded() &&
                !!map.getLayer("project-route-line")
              );
            }),
          { timeout: 60_000 },
        )
        .toBe(true);
      await page.locator(".maplibregl-map").scrollIntoViewIfNeeded();
      await page.evaluate(
        ({ center, three, mobile }) => {
          const map = (globalThis as unknown as { stairRouteMap: Map })
            .stairRouteMap;
          map.jumpTo({
            center,
            zoom: mobile ? 20.9 : 22,
            pitch: three ? 55 : 0,
            bearing: 0,
          });
        },
        { center: geographicPoint(data!, [65, 461]), three, mobile },
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { stairRouteMap: Map })
              .stairRouteMap;
            return !map.isMoving() && map.areTilesLoaded();
          }),
        )
        .toBe(true);
      await page.locator(".maplibregl-map").screenshot({
        path: test
          .info()
          .outputPath(
            `stair-approach-${three ? "3d" : "2d"}-${mobile ? "mobile" : "desktop"}.png`,
          ),
      });
    }
    expect(errors).toEqual([]);
  });
}
