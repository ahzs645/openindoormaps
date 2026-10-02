/* eslint-disable @typescript-eslint/no-explicit-any -- Browser-injected bridge uses dynamically imported MapLibre instances. */
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`native Agora boundaries and fixture preview on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!data, "Provide the rebuilt native-boundary master ZIP.");
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1640, height: 1100 },
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
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (...args: any[]) {
        if (args[0] === "project-areas") (globalThis as any).boundaryMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByLabel("Map floor", { exact: true })
      .selectOption({ label: "Campus Floor 1" });
    await page
      .getByRole("button", { name: "Review pin 5", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Show pin on map", exact: true })
      .click();
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    const probes = [
      geographicPoint(data!, [0, 180]),
      geographicPoint(data!, [27.528_838_919_878_776, 192.895_512_897_397_57]),
    ];
    await expect
      .poll(
        () =>
          page.evaluate(async (probes) => {
            const map = (globalThis as any).boundaryMap;
            if (!map) return [];
            const geo = await map.getSource("project-areas").getData();
            const inside = (p: number[], r: number[][]) => {
              let v = false;
              for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
                const a = r[j],
                  b = r[i];
                if (
                  a[1] > p[1] !== b[1] > p[1] &&
                  p[0] < a[0] + ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1])
                )
                  v = !v;
              }
              return v;
            };
            return probes.map((p) =>
              geo.features
                .filter(
                  (f: any) =>
                    f.properties.circulation &&
                    f.properties.boundarySource ===
                      "prepared-native-circulation",
                )
                .some((f: any) =>
                  f.geometry.coordinates.some(
                    (poly: number[][][]) =>
                      inside(p, poly[0]) &&
                      !poly.slice(1).some((h) => inside(p, h)),
                  ),
                ),
            );
          }, probes),
        { timeout: 60_000 },
      )
      .toEqual([true, false]);
    await page
      .getByRole("button", { name: "Show pin on map", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).boundaryMap.getZoom()),
      )
      .toBeGreaterThan(20);
    await expect
      .poll(() =>
        page.evaluate(() => !(globalThis as any).boundaryMap.isMoving()),
      )
      .toBe(true);
    if (mobile) await page.locator(".maplibregl-map").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/unbc-agora-wall-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page
      .getByRole("button", { name: "Review pin 5", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Show pin on map", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const geo = await (globalThis as any).boundaryMap
            .getSource("project-areas")
            .getData();
          return geo.features.filter(
            (f: any) =>
              f.properties.boundarySource === "prepared-native-fixture" &&
              f.properties.nativeElementId === 2_484_309,
          ).length;
        }),
      )
      .toBe(3);
    await page
      .getByRole("button", { name: "Show pin on map", exact: true })
      .click();
    if (mobile) await page.locator(".maplibregl-map").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/unbc-agora-fixture-2d-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const geo = await (globalThis as any).boundaryMap
            .getSource("project-room-blocks")
            .getData();
          return geo.features.filter(
            (f: any) =>
              f.properties.boundarySource === "prepared-native-fixture" &&
              f.properties.nativeElementId === 2_484_309,
          ).length;
        }),
      )
      .toBe(3);
    await page
      .getByRole("button", { name: "Show pin on map", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).boundaryMap.getZoom()),
      )
      .toBeGreaterThan(20);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as any).boundaryMap;
          return (
            !map.isMoving() &&
            map
              .queryRenderedFeatures({ layers: ["project-room-boxes"] })
              .some((f: any) => f.properties.nativeElementId === 2_484_309)
          );
        }),
      )
      .toBe(true);
    if (mobile) await page.locator(".maplibregl-map").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/unbc-agora-fixture-${mobile ? "mobile" : "desktop"}.png`,
    });
    if (!mobile) {
      await page
        .getByRole("button", { name: "Source model", exact: true })
        .click();
      await expect(
        page.getByText(
          "Native 3D model · selected floor section · saved GIS alignment",
          { exact: true },
        ),
      ).toBeVisible({ timeout: 60_000 });
      await page.screenshot({
        path: "docs/screenshots/unbc-agora-fixture-source.png",
      });
    }
    expect(errors).toEqual([]);
  });
