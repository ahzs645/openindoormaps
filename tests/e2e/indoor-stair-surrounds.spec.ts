import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
for (const mobile of [false, true])
  test(`Native stair surrounds in 2D and 3D on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the finalized master ZIP");
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
    await expect(page.locator('input[type="file"]')).toBeAttached({
      timeout: 15_000,
    });
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
          (
            globalThis as unknown as { stairSurroundMap: Map }
          ).stairSurroundMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    for (const number of ["03-S303", "10-S104", "10-S301"]) {
      const room = data.records.find((r) => r.number === number)!;
      const floor = data.floors.find((f) => f.levelIds.includes(room.levelId))!;
      const search = page.getByRole("textbox", {
        name: "Search indoor map",
        exact: true,
      });
      await search.fill(number);
      await page
        .getByRole("button", { name: new RegExp(`^${number} ·`) })
        .click();
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toHaveAttribute("data-floor-id", floor.id);
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      for (const three of [false, true]) {
        await page
          .getByRole("button", {
            name: three ? "3D rooms" : "2D rooms",
            exact: true,
          })
          .click();
        const points = room.ringsFeet.flat();
        const center = geographicPoint(data, [
          (Math.min(...points.map((p) => p[0])) +
            Math.max(...points.map((p) => p[0]))) /
            2,
          (Math.min(...points.map((p) => p[1])) +
            Math.max(...points.map((p) => p[1]))) /
            2,
        ]);
        await page.evaluate(
          ({ center, mobile, three }) =>
            (
              globalThis as unknown as { stairSurroundMap: Map }
            ).stairSurroundMap.jumpTo({
              center,
              zoom: mobile ? 21.1 : 22,
              pitch: three ? 35 : 0,
              bearing: 0,
              padding: mobile
                ? { top: 130, right: 10, bottom: 380, left: 10 }
                : { top: 0, right: 0, bottom: 0, left: 390 },
            }),
          { center, mobile, three },
        );
        await expect
          .poll(() =>
            page.evaluate(() =>
              (
                globalThis as unknown as { stairSurroundMap: Map }
              ).stairSurroundMap.isMoving(),
            ),
          )
          .toBe(false);
        const sources = (await page.evaluate(async () => {
          const m = (globalThis as unknown as { stairSurroundMap: Map })
            .stairSurroundMap;
          return {
            ground: await (
              m.getSource("project-areas") as GeoJSONSource
            ).getData(),
            rooms: await (
              m.getSource("project-room-blocks") as GeoJSONSource
            ).getData(),
            selection: await (
              m.getSource("project-selection-areas") as GeoJSONSource
            ).getData(),
          };
        })) as {
          ground: FeatureCollection;
          rooms: FeatureCollection;
          selection: FeatureCollection;
        };
        const stairKeys = new Set(
          data.records
            .filter((r) => r.stair && floor.levelIds.includes(r.levelId))
            .map((r) => r.key),
        );
        expect(
          sources.rooms.features.filter((f) =>
            stairKeys.has(String(f.properties?.key)),
          ),
        ).toEqual([]);
        for (const f of sources.ground.features.filter((f) =>
          stairKeys.has(String(f.properties?.key)),
        ))
          expect(
            f.properties?.nativeCellId ||
              f.properties?.groundEvidence === "native-stair-surround",
          ).toBeTruthy();
        expect(
          sources.selection.features.some(
            (f) =>
              f.properties?.key === room.key ||
              f.properties?.roomKeys?.includes(room.key),
          ),
        ).toBe(true);
        await page.screenshot({
          path: `${process.env.STAIR_SURROUND_SCREENSHOT_DIR ?? "docs/screenshots"}/${number}-${three ? "3d" : "2d"}-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
    }
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
