import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { findProjectRoute } from "../../app/indoor-project/routing";
import {
  HALLWAY_COLOR,
  RESTRICTED_AREA_COLOR,
} from "../../app/indoor-project/display-passages";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`public vestibule thresholds and 07-704 restriction on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!data, "Set INDOOR_PROJECT_ZIP to regenerated UNBC master.");
    test.setTimeout(180_000);
    const route = findProjectRoute(
      data!,
      "rm-1487816-959fe1d830e0",
      "rm-1487816-1949cc41e164",
    )!;
    expect(route.distanceMetres).toBeLessThan(25);
    expect(
      [1_501_580, 1_501_582].every((id) =>
        route.edges.some(
          (edge) => edge.kind === "door" && edge.nativeElementId === id,
        ),
      ),
    ).toBe(true);
    expect(
      route.edges.some((edge) =>
        ["stairs", "elevator", "ramp"].includes(edge.kind),
      ),
    ).toBe(false);
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
      const { default: lib } = await import(path);
      const add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { vestibuleMap: Map }).vestibuleMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByLabel("Route start", { exact: true })
      .selectOption("rm-1487816-959fe1d830e0");
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption("rm-1487816-1949cc41e164");
    await expect(page.getByTestId("project-route-result")).not.toContainText(
      "No verified route",
    );
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    for (const view of ["2D rooms", "3D rooms"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect
        .poll(
          () =>
            page.evaluate(async (color) => {
              const map = (globalThis as unknown as { vestibuleMap: Map })
                .vestibuleMap;
              if (!map?.getSource("project-areas")) return false;
              const areas = (await (
                map.getSource("project-areas") as GeoJSONSource
              ).getData()) as FeatureCollection;
              return [1_501_580, 1_501_582].every((id) =>
                areas.features.some(
                  (f) =>
                    f.properties?.openingId === `door:1487816:${id}` &&
                    f.properties?.boundarySource === "prepared-native-door" &&
                    f.properties?.color === color,
                ),
              );
            }, HALLWAY_COLOR),
          { timeout: 30_000 },
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/vestibule-connected-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByLabel("Find project area", { exact: true }).fill("07-704");
    await page
      .getByRole("button", { name: "07-704 · Circulation · #311", exact: true })
      .click();
    await expect(page.getByLabel("Area access", { exact: true })).toHaveValue(
      "staff",
    );
    await expect(
      page.getByRole("button", { name: "Use as start", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await expect(
      page.getByText("Off limits · Staff only", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Directions", exact: true }),
    ).toBeDisabled();
    for (const view of ["2D rooms", "3D rooms"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(async (color) => {
            const map = (globalThis as unknown as { vestibuleMap: Map })
              .vestibuleMap;
            const areas = (await (
              map.getSource("project-areas") as GeoJSONSource
            ).getData()) as FeatureCollection;
            return areas.features.some(
              (f) =>
                f.properties?.key === "rm-311-cdb834d8a61f" &&
                f.properties?.color === color &&
                f.properties?.access === "staff",
            );
          }, RESTRICTED_AREA_COLOR),
        )
        .toBe(true);
    }
    await page.screenshot({
      path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/staff-07-704-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
