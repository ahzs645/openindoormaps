import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";

const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
const key = "rm-311-b7fa83011b32";
for (const mobile of [false, true])
  test(`native curved stair selection on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(
      !data?.stairDisplay,
      "Set INDOOR_PROJECT_ZIP to native-stairs package.",
    );
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && m.text().includes("layers.project-"))
        errors.push(m.text());
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path);
      const add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { stairTestMap: Map }).stairTestMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const m = (globalThis as unknown as { stairTestMap: Map })
              .stairTestMap;
            return !!m?.getLayer("project-native-stair-boxes") && !m.isMoving();
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Find project area", exact: true })
      .fill("04-S103");
    await page
      .getByRole("button", { name: "04-S103 · Stair · #311", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { stairTestMap: Map }
          ).stairTestMap.getZoom(),
        ),
      )
      .toBeGreaterThan(18.5);
    // Native flight begins beyond y=346; the old source stair ends at y=339.75.
    const tread = data!.stairDisplay!.flights.find((f) => f.roomKey === key)!
      .treads[2];
    expect(tread.ringFeet.every((p) => p[1] > 339.75)).toBe(true);
    const centre = tread.ringFeet.reduce(
      (s, p) => [
        s[0] + p[0] / tread.ringFeet.length,
        s[1] + p[1] / tread.ringFeet.length,
      ],
      [0, 0],
    );
    const geo = geographicPoint(data!, centre);
    for (const three of [false, true]) {
      // Start with the competing source area selected, so an ignored click or
      // wrong overlap priority cannot pass by retaining the previous stair.
      await page
        .getByRole("textbox", { name: "Find project area", exact: true })
        .fill("04-124");
      await page
        .getByRole("button", { name: "04-124 · Rotunda · #311", exact: true })
        .click();
      await expect(page.locator(".project-inspector h3")).toHaveText(
        "04-124 · Rotunda",
      );
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              globalThis as unknown as { stairTestMap: Map }
            ).stairTestMap.isMoving(),
          ),
        )
        .toBe(false);
      await page.evaluate((center) => {
        const m = (globalThis as unknown as { stairTestMap: Map }).stairTestMap;
        m.jumpTo({
          center,
          zoom: 21.8,
          pitch: m.getPitch(),
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
        });
      }, geo);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              !(
                globalThis as unknown as { stairTestMap: Map }
              ).stairTestMap.isMoving(),
          ),
        )
        .toBe(true);
      const count = await page.evaluate(async () => {
        const m = (globalThis as unknown as { stairTestMap: Map }).stairTestMap;
        const d = (await (
          m.getSource("project-native-stairs") as GeoJSONSource
        ).getData()) as FeatureCollection<Polygon>;
        const flight = d.features.filter(
          (f) => f.properties?.key === "rm-311-b7fa83011b32",
        );
        const heights = flight.map((f) => Number(f.properties?.height));
        const bases = flight.map((f) => Number(f.properties?.base));
        if (
          Math.max(...heights) < 3.3 ||
          Math.max(...bases) < 3.25 ||
          flight.some(
            (f) =>
              Math.abs(
                Number(f.properties?.height) -
                  Number(f.properties?.base) -
                  0.05,
              ) > 1e-6,
          )
        )
          throw new Error(
            "Native flight must rise above the floor with 50 mm suspended treads.",
          );
        if (
          m.getPaintProperty(
            "project-native-stair-boxes",
            "fill-extrusion-base",
          ) == null
        )
          throw new Error(
            "Suspended stair base is missing from the actual map style.",
          );
        return flight.length;
      });
      expect(count).toBe(31);
      // Find the rendered native tread near its projection (3D roof has altitude).
      const locatePoint = () =>
        page.evaluate(
          ({ geo, three, key }) => {
            const m = (globalThis as unknown as { stairTestMap: Map })
              .stairTestMap;
            const p = m.project(geo as [number, number]);
            for (let dy = 0; dy >= -80; dy -= 2)
              for (const dx of [0, -2, 2]) {
                const f = m.queryRenderedFeatures([p.x + dx, p.y + dy], {
                  layers: [
                    three
                      ? "project-native-stair-boxes"
                      : "project-native-stair-fill",
                  ],
                });
                if (f.some((f) => f.properties?.key === key))
                  return { x: p.x + dx, y: p.y + dy };
              }
            return null;
          },
          { geo, three, key },
        );
      await expect.poll(locatePoint, { timeout: 30_000 }).not.toBeNull();
      const point = await locatePoint();
      const canvas = page.locator(".project-map canvas.maplibregl-canvas");
      await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(box.x + point!.x, box.y + point!.y);
      await expect(page.locator(".project-inspector h3")).toHaveText(
        "04-S103 · Stair",
      );
      await expect(
        page.getByText("Native treads · measured rise", { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Use as start", exact: true }),
      ).toBeDisabled();
      if (!three) {
        const overhead = data!.stairDisplay!.flights.find(
          (f) => f.roomKey === key,
        )!.treads[29];
        const upperCentre = overhead.ringFeet.reduce(
          (sum, p) => [
            sum[0] + p[0] / overhead.ringFeet.length,
            sum[1] + p[1] / overhead.ringFeet.length,
          ],
          [0, 0],
        );
        const upperGeo = geographicPoint(data!, upperCentre);
        await page.evaluate((center) => {
          const m = (globalThis as unknown as { stairTestMap: Map })
            .stairTestMap;
          m.jumpTo({ center, zoom: 21.8 });
        }, upperGeo);
        await expect
          .poll(() =>
            page.evaluate((geo) => {
              const m = (globalThis as unknown as { stairTestMap: Map })
                .stairTestMap;
              const pt = m.project(geo as [number, number]);
              return m
                .queryRenderedFeatures(pt, { layers: ["project-room-fill"] })
                .some((f) => f.properties?.key === "rm-311-2054e6ddb852");
            }, upperGeo),
          )
          .toBe(true);
        const upperPoint = await page.evaluate((geo) => {
          const m = (globalThis as unknown as { stairTestMap: Map })
            .stairTestMap;
          const pt = m.project(geo as [number, number]);
          return { x: pt.x, y: pt.y };
        }, upperGeo);
        await page.mouse.click(box.x + upperPoint.x, box.y + upperPoint.y);
        await expect(page.locator(".project-inspector h3")).toHaveText(
          "04-124 · Rotunda",
        );
        // Restore the flight overview after proving that its overhead projection
        // does not steal selection from the floor beneath it.
        await page
          .getByRole("textbox", { name: "Find project area", exact: true })
          .fill("04-S103");
        await page
          .getByRole("button", { name: "04-S103 · Stair · #311", exact: true })
          .click();
      }
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `docs/screenshots/unbc-native-curved-stair-${mobile ? "mobile" : "desktop"}-${three ? "3d" : "2d"}.png`,
      });
    }
    expect(errors).toEqual([]);
  });
