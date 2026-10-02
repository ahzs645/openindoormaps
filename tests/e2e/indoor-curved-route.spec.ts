import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  findProjectRoute,
  geographicPoint,
} from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
const zip = process.env.INDOOR_PROJECT_ZIP;
const pantry = process.env.INDOOR_CURVE_DESTINATION === "06-204";
const destination = pantry ? "06-204" : "07-240";
const destinationName = pantry ? "Service Pantry" : "Bookstore";
let screenshotPrefix = "unbc-curved-corridor";
if (process.env.SHARED_LANDING_EXPECTED)
  screenshotPrefix = "unbc-shared-landing";
if (process.env.NATIVE_CIRCULATION_EXPECTED)
  screenshotPrefix = "unbc-native-circulation";
screenshotPrefix =
  process.env.INDOOR_CURVE_SCREENSHOT_PREFIX ?? screenshotPrefix;
test.skip(
  !zip || !existsSync(zip),
  "Provide the reviewed campus ZIP with the Pub Entrance route.",
);
const files = zip && existsSync(zip) ? unzipSync(readFileSync(zip)) : undefined;
const data: IndoorDataset | undefined = files
  ? JSON.parse(strFromU8(files["viewer/indoor.json"]))
  : undefined;
const hasNativeModel = !!files?.["model/scene.glb"];
for (const mobile of [false, true]) {
  test(`curved Pub Entrance to ${destinationName} route and follow on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 },
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
      const { default: lib } = await import(path);
      const add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { curveMap: Map }).curveMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    if (!mobile)
      await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page
      .getByLabel("Search indoor map", { exact: true })
      .fill(destination);
    await page
      .getByRole("button", {
        name: new RegExp(`${destination} · ${destinationName}`),
      })
      .click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("06-260");
    await page.getByRole("option", { name: /06-260 · Pub Entrance/ }).click();
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toBeVisible();
    const a = data!.records.find((r) => r.number === "06-260")!,
      b = data!.records.find((r) => r.number === destination)!;
    const expected = findProjectRoute(data!, a.key, b.key)!;
    if (process.env.SHARED_LANDING_EXPECTED && !pantry) {
      const rooms = expected.edges
        .flatMap((e) => e.roomKeys)
        .map((key) => data!.records.find((r) => r.key === key)!.number);
      expect(rooms).toContain("06-S204");
      expect(rooms).toContain("06-210");
      expect(rooms).not.toContain("06-205");
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const map = (globalThis as unknown as { curveMap: Map }).curveMap;
              const source = map?.getSource("project-areas") as
                | GeoJSONSource
                | undefined;
              if (!source) return 0;
              const geo = (await source.getData()) as GeoJSON.FeatureCollection;
              return geo.features.filter((f) =>
                String(f.properties?.openingId).includes("rm-694-b17d7fe3d57c"),
              ).length;
            }),
          { timeout: 45_000 },
        )
        .toBe(2);
    }
    if (process.env.NATIVE_CIRCULATION_EXPECTED) {
      expect(expected.paths.some((p) => p.nativeCirculationUsed)).toBe(true);
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const map = (globalThis as unknown as { curveMap: Map }).curveMap;
              const geo = (await (
                map.getSource("project-areas") as GeoJSONSource
              ).getData()) as GeoJSON.FeatureCollection;
              return geo.features.some(
                (f) =>
                  f.properties?.boundarySource ===
                    "prepared-native-circulation" &&
                  Array.isArray(f.properties?.roomKeys) &&
                  f.properties.roomKeys.includes("rm-694-b17d7fe3d57c"),
              );
            }),
          { timeout: 45_000 },
        )
        .toBe(true);
    }
    const curve = expected.paths.find((p) => p.shape === "curved")!;
    expect(curve).toBeTruthy();
    const steps = projectNavigationSteps(data!, expected, a.number, b.number);
    const curveIndex = steps.findIndex(
      (s) => s.message === "Follow the curved corridor",
    );
    expect(curveIndex).toBeGreaterThan(0);
    if (pantry) {
      expect(
        steps.filter((s) => s.message === "Follow the curved corridor"),
      ).toHaveLength(1);
      expect(steps.filter((s) => s.type === "turn")).toHaveLength(1);
      expect(expected.distanceMetres).toBeLessThan(74);
      await page
        .getByRole("button", { name: "Fit route", exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            (globalThis as unknown as { curveMap: Map }).curveMap.isMoving(),
          ),
        )
        .toBe(false);
      await page.screenshot({
        path: `docs/screenshots/unbc-smooth-bend-overview-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    for (let i = 0; i < curveIndex; i++)
      await page
        .getByRole("button", { name: "Next step", exact: true })
        .click();
    await (mobile
      ? expect(page.getByTestId("mobile-current-instruction")).toHaveText(
          "Follow the curved corridor",
        )
      : expect(
          page.getByTestId("hospital-step-list").getByRole("button", {
            name: "Follow the curved corridor",
            exact: true,
          }),
        ).toBeVisible());
    await expect
      .poll(async () =>
        page.evaluate(
          async (expectedPoints) => {
            const map = (globalThis as unknown as { curveMap: Map }).curveMap;
            const source = map.getSource("project-route") as GeoJSONSource;
            const geo =
              (await source.getData()) as GeoJSON.FeatureCollection<GeoJSON.LineString>;
            return geo.features.some(
              (f) =>
                f.geometry.coordinates.length === expectedPoints.length &&
                f.geometry.coordinates.every(
                  (p, i) =>
                    Math.hypot(
                      p[0] - expectedPoints[i][0],
                      p[1] - expectedPoints[i][1],
                    ) < 1e-8,
                ),
            );
          },
          curve.pointsFeet.map((p) => geographicPoint(data!, p)),
        ),
      )
      .toBe(true);
    const camera = await page.evaluate(() => {
      const map = (globalThis as unknown as { curveMap: Map }).curveMap;
      return map.getCenter().toArray();
    });
    const begin = geographicPoint(data!, steps[curveIndex].pointsFeet[0]);
    expect(Math.hypot(camera[0] - begin[0], camera[1] - begin[1])).toBeLessThan(
      0.001,
    );
    await page.screenshot({
      path: `docs/screenshots/${screenshotPrefix}-${mobile ? "mobile" : "desktop"}.png`,
    });
    const progress = page.getByRole("progressbar", {
      name: "Route progress",
      exact: true,
    });
    for (let i = curveIndex; i < steps.length - 1; i++)
      await page
        .getByRole("button", { name: "Next step", exact: true })
        .click();
    await expect(progress).toHaveAttribute(
      "aria-valuenow",
      String(steps.length - 1),
    );
    await (mobile
      ? expect(page.getByTestId("mobile-current-instruction")).toContainText(
          destinationName,
        )
      : expect(
          page.getByTestId("hospital-step-list").getByRole("button", {
            name: new RegExp(`Arrive at .*${destinationName}`),
          }),
        ).toBeVisible());
    await expect(
      page.getByRole("button", { name: "Open level selector", exact: true }),
    ).toContainText(pantry ? "Floor 2" : "Campus Floor 1");
    if (
      process.env.NATIVE_CIRCULATION_EXPECTED &&
      hasNativeModel &&
      !mobile &&
      !pantry
    ) {
      await page
        .getByRole("button", { name: "Back", exact: true })
        .filter({ visible: true })
        .click();
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
      await page
        .getByLabel("Map floor", { exact: true })
        .selectOption({ label: "Floor 2" });
      await page
        .getByRole("button", { name: "Review pin 4", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Show pin on map", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Source model", exact: true })
        .click();
      await expect(page.getByTestId("review-pin-panel")).toContainText("#694");
      await expect(
        page.getByText(
          "Native 3D model · selected floor section · saved GIS alignment",
          { exact: true },
        ),
      ).toBeVisible({ timeout: 60_000 });
      await expect
        .poll(() =>
          page.evaluate(() =>
            (globalThis as unknown as { curveMap: Map }).curveMap.isMoving(),
          ),
        )
        .toBe(false);
      await page.screenshot({
        path: "docs/screenshots/unbc-native-circulation-pin-source.png",
      });
    }
  });
}
