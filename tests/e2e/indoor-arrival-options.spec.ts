import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import {
  findProjectRoute,
  geographicPoint,
} from "../../app/indoor-project/routing";
import { resolveRouteArrival } from "../../app/indoor-project/route-arrival";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(
  !zip || !existsSync(zip),
  "Provide a prepared native circulation ZIP.",
);
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`arrival positions and multi-floor following on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
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
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-route")
          (globalThis as unknown as { arrivalMap: Map }).arrivalMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("07-240");
    await page.getByRole("button", { name: /07-240 · Bookstore/ }).click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("06-260");
    await page.getByRole("option", { name: /06-260 · Pub Entrance/ }).click();
    const selector = page.getByRole("button", {
      name: "Stop directions",
      exact: true,
    });
    await expect(selector).toContainText("Inside room");
    await selector.click();
    await expect(
      page.getByRole("menuitemradio", { name: "Inside room", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/Preparing Floor/)).toBeHidden();
    await page.screenshot({
      path: `docs/screenshots/unbc-arrival-menu-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page
      .getByRole("menuitemradio", { name: "At doorway", exact: true })
      .click();
    const start = data!.records.find((r) => r.number === "06-260")!,
      end = data!.records.find((r) => r.number === "07-240")!;
    const base = findProjectRoute(data!, start.key, end.key)!;
    for (const mode of ["doorway", "hallway"] as const) {
      if (mode === "hallway") {
        await selector.click();
        await page
          .getByRole("menuitemradio", {
            name: "Hallway outside door",
            exact: true,
          })
          .click();
      }
      const expected = resolveRouteArrival(data!, base, end.key, mode).route!;
      await expect(page.getByTestId("project-route-result")).toContainText(
        expected.distanceMetres.toFixed(1),
      );
      const steps = projectNavigationSteps(
        data!,
        expected,
        "06-260 · Pub Entrance",
        "07-240 · Bookstore",
      );
      await page
        .getByRole("button", { name: "Preview directions", exact: true })
        .click();
      for (let i = 0; i < steps.length - 1; i++)
        await page
          .getByRole("button", { name: "Next step", exact: true })
          .click();
      await expect(
        mobile
          ? page.getByTestId("mobile-current-instruction")
          : page.getByTestId("hospital-step-list").getByRole("button", {
              name: steps.at(-1)!.message,
              exact: true,
            }),
      ).toContainText(steps.at(-1)!.message);
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toContainText("Campus Floor 1");
      const point = geographicPoint(data!, expected.arrival!.pointFeet);
      await expect
        .poll(() =>
          page.evaluate(async (p) => {
            const map = (globalThis as unknown as { arrivalMap: Map })
              .arrivalMap;
            const geo = (await (
              map.getSource("project-route") as GeoJSONSource
            ).getData()) as GeoJSON.FeatureCollection<GeoJSON.LineString>;
            return geo.features.some((f) => {
              const end = f.geometry.coordinates.at(-1)!;
              return Math.hypot(end[0] - p[0], end[1] - p[1]) < 1e-9;
            });
          }, point),
        )
        .toBe(true);
      await expect
        .poll(() =>
          page.evaluate(() =>
            (
              globalThis as unknown as { arrivalMap: Map }
            ).arrivalMap.isMoving(),
          ),
        )
        .toBe(false);
      await page.screenshot({
        path: `docs/screenshots/unbc-arrival-${mode}-${mobile ? "mobile" : "desktop"}.png`,
      });
      await page
        .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
        .filter({ visible: true })
        .click();
    }
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    await expect(selector).toContainText("Hallway outside door");
    await selector.click();
    await page
      .getByRole("menuitemradio", { name: "Inside room", exact: true })
      .click();
    // Radix restores focus after its exit animation; let that complete before typing.
    await expect(selector).toBeFocused();
    await page.getByLabel("Route start", { exact: true }).fill("06-260");
    await page.getByRole("option", { name: /06-260 · Pub Entrance/ }).click();
    await page.getByLabel("Route destination", { exact: true }).fill("06-204");
    await page.getByRole("option", { name: /06-204 · Service Pantry/ }).click();
    await selector.click();
    await expect(
      page.getByRole("menuitemradio", {
        name: "Hallway outside door",
        exact: true,
      }),
    ).toHaveAttribute("data-disabled", "");
    await expect(
      page.getByRole("menuitemradio", {
        name: "Hallway outside door",
        exact: true,
      }),
    ).toContainText("another room");
    await page
      .getByRole("menuitemradio", { name: "Inside room", exact: true })
      .click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "71.7",
    );
  });
