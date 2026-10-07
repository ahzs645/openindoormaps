import { test, expect } from "@playwright/test";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { readFileSync, mkdirSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const zip = process.env.INDOOR_PROJECT_ZIP;
const output = "work/building-floor-review-20261003/rendering/browser";
for (const mobile of [false, true])
  test(`native room enclosure and Sim Room hallway on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the regenerated native-geometry ZIP.");
    test.setTimeout(240_000);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
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
      const modulePath = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((r) => r.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(modulePath);
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (
            globalThis as unknown as { volumeCoverageMap: Map }
          ).volumeCoverageMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    const rooms = ["10-1590", "08-128"].map((number) => {
      const room = data.records.find((r) => r.number === number)!;
      expect(data.presentation?.rooms.some((r) => r.roomKey === room.key)).toBe(
        true,
      );
      return { key: room.key, number };
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("10-1590");
    await page.getByRole("button", { name: /10-1590 · Sim Room/ }).click();
    for (const mode of ["2D rooms", "3D rooms", "3D relative heights"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 60_000,
      });
      await expect
        .poll(
          () =>
            page.evaluate(async (rooms) => {
              const map = (globalThis as unknown as { volumeCoverageMap: Map })
                .volumeCoverageMap;
              const source = map?.getSource("project-room-blocks") as
                | GeoJSONSource
                | undefined;
              if (!source) return false;
              const data =
                (await source.getData()) as FeatureCollection<MultiPolygon>;
              return rooms.every((r) =>
                data.features.some(
                  (f) =>
                    f.properties?.key === r.key &&
                    f.geometry.coordinates.some(
                      (polygon) => (polygon[0]?.length ?? 0) >= 3,
                    ) &&
                    Math.abs(
                      Number(f.properties?.height) -
                        Number(f.properties?.base ?? 0) -
                        0.6,
                    ) < 0.001,
                ),
              );
            }, rooms),
          { timeout: 30_000 },
        )
        .toBe(true);
      const gap = geographicPoint(data, [233, 767]);
      const blue = await page.evaluate(async (gap) => {
        const map = (globalThis as unknown as { volumeCoverageMap: Map })
          .volumeCoverageMap;
        const source = (await (
          map.getSource("project-areas") as GeoJSONSource
        ).getData()) as FeatureCollection<MultiPolygon>;
        const contains = (ring: number[][]) => {
          let inside = false;
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const a = ring[i],
              b = ring[j];
            if (
              a[1] > gap[1] !== b[1] > gap[1] &&
              gap[0] < ((b[0] - a[0]) * (gap[1] - a[1])) / (b[1] - a[1]) + a[0]
            )
              inside = !inside;
          }
          return inside;
        };
        return source.features.some(
          (f) =>
            f.properties?.circulation === true &&
            f.geometry.coordinates.some(
              (rings) => contains(rings[0]) && !rings.slice(1).some(contains),
            ),
        );
      }, gap);
      expect(
        blue,
        "native slab beside Sim Room is shown as circulation, without a phantom host extension",
      ).toBe(true);
      await page.evaluate(
        ({ center, mode, mobile }) => {
          const map = (globalThis as unknown as { volumeCoverageMap: Map })
            .volumeCoverageMap;
          map.jumpTo({
            center,
            zoom: mobile ? 21 : 21.8,
            pitch: mode === "2D rooms" ? 0 : 40,
            bearing: 0,
            padding: mobile
              ? { top: 0, right: 0, bottom: 420, left: 0 }
              : { top: 0, right: 0, bottom: 0, left: 400 },
          });
          map.triggerRepaint();
          return new Promise<void>((resolve) =>
            map.once("render", () =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
          );
        },
        {
          center: geographicPoint(data, mobile ? [240, 773] : [237, 772]),
          mode,
          mobile,
        },
      );
      mkdirSync(output, { recursive: true });
      await page.screenshot({
        path: `${output}/sim-${mode.replaceAll(" ", "-")}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    expect(errors).toEqual([]);
  });
