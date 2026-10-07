import { test, expect } from "@playwright/test";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
for (const mobile of [false, true])
  test(`mixed-floor stair end faces and ramp plan tint on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide a prepared mixed-elevation campus ZIP");
    test.setTimeout(180_000);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached();
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((resource) => resource.name)
        .find((name) => name.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path);
      const add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { stairDatumMap: Map }).stairDatumMap =
            this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    const center = geographicPoint(data, [56, 463]);
    const rampPoint = geographicPoint(data, [43, 461]);
    for (const mode of [
      "2D rooms",
      "3D rooms",
      "3D relative heights",
      "2D rooms",
    ]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(
              (
                globalThis as unknown as { stairDatumMap: Map }
              ).stairDatumMap.getSource("project-native-stairs"),
            ),
          ),
        )
        .toBe(true);
      await page.evaluate(
        ({ center, mode, mobile }) =>
          (
            globalThis as unknown as { stairDatumMap: Map }
          ).stairDatumMap.jumpTo({
            center,
            zoom: mobile ? 21.8 : 22.3,
            pitch: mode === "2D rooms" ? 0 : 40,
            bearing: 0,
            padding: mobile
              ? { top: 0, right: 0, bottom: 240, left: 0 }
              : { top: 0, right: 0, bottom: 0, left: 440 },
          }),
        { center, mode, mobile },
      );
      const features = await page.evaluate(
        async () =>
          (
            (await (
              (
                globalThis as unknown as { stairDatumMap: Map }
              ).stairDatumMap.getSource(
                "project-native-stairs",
              ) as GeoJSONSource
            ).getData()) as FeatureCollection
          ).features,
      );
      for (const id of [1_620_957, 1_949_419, 1_982_431]) {
        const treads = features.filter(
          (feature) => feature.properties?.stairElementId === id,
        );
        expect(treads.length).toBeGreaterThan(0);
        const caps = treads.flatMap(
          (feature) => feature.properties!.endpointRisers,
        );
        expect(caps.length).toBeGreaterThan(0);
        for (const cap of caps) expect(cap.top - cap.bottom).toBeLessThan(0.23);
      }
      const ground = await page.evaluate(
        async () =>
          (
            (await (
              (
                globalThis as unknown as { stairDatumMap: Map }
              ).stairDatumMap.getSource("project-areas") as GeoJSONSource
            ).getData()) as FeatureCollection
          ).features,
      );
      expect(
        ground.some(
          (feature) =>
            feature.properties?.nativeFloorId === 1_950_094 &&
            feature.properties?.groundEvidence === "native-stair-starting-slab",
        ),
      ).toBe(true);
      if (mode === "2D rooms") {
        await expect
          .poll(() =>
            page.evaluate(() =>
              (globalThis as unknown as { stairDatumMap: Map }).stairDatumMap
                .queryRenderedFeatures(undefined, {
                  layers: ["project-room-fill"],
                })
                .some(
                  (feature) =>
                    feature.properties?.nativeCellId ===
                    "native-cell:3.280840:43",
                ),
            ),
          )
          .toBe(true);
        await page.evaluate(
          ({ point }) =>
            (
              globalThis as unknown as { stairDatumMap: Map }
            ).stairDatumMap.jumpTo({
              center: point as [number, number],
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
            }),
          { point: rampPoint },
        );
        const pixel = await page.evaluate(
          async ({ point }) => {
            const map = (globalThis as unknown as { stairDatumMap: Map })
              .stairDatumMap;
            return await new Promise<number[]>((resolve) => {
              map.once("render", () => {
                const canvas = map.getCanvas();
                const gl = canvas.getContext("webgl2")!;
                const screen = map.project(point as [number, number]);
                const ratio = canvas.width / canvas.clientWidth;
                const rgba = new Uint8Array(4);
                gl.readPixels(
                  Math.round(screen.x * ratio),
                  Math.round(canvas.height - screen.y * ratio),
                  1,
                  1,
                  gl.RGBA,
                  gl.UNSIGNED_BYTE,
                  rgba,
                );
                resolve([...rgba]);
              });
              map.triggerRepaint();
            });
          },
          { point: rampPoint },
        );
        expect(pixel.slice(0, 3)).toEqual([215, 226, 229]);
      }
      await page.evaluate(
        ({ center, mobile }) =>
          (
            globalThis as unknown as { stairDatumMap: Map }
          ).stairDatumMap.jumpTo({
            center,
            zoom: mobile ? 20.8 : 21.6,
            padding: mobile
              ? { top: 0, right: 0, bottom: 240, left: 0 }
              : { top: 0, right: 0, bottom: 0, left: 440 },
          }),
        { center: geographicPoint(data, [64, 467]), mobile },
      );
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      await page.screenshot({
        path: `work/stair-display-current/${mode.replaceAll(" ", "-")}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    expect(errors).toEqual([]);
  });
