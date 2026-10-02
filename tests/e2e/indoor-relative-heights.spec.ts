import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_RAMP_ZIP;
test.skip(
  !zip || !existsSync(zip),
  "Provide the prepared native ramp archive.",
);
for (const mobile of [false, true])
  test(`relative floor heights and wheelchair ramp navigation on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor?view=relative");
    await expect(page.locator('input[type="file"]')).toBeAttached({
      timeout: 30_000,
    });
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { rampMap: Map }).rampMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await expect(
      page.getByRole("button", { name: "3D relative heights", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByLabel("Route start", { exact: true })
      .selectOption("rm-311-86e02816d8fe");
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption("landing:local:07:311:08:1487816:1620957:1");
    await page
      .getByLabel("Route profile", { exact: true })
      .selectOption("accessible");
    await expect(page.getByTestId("project-route-result")).toContainText(
      "0 step/stair transitions",
    );
    await expect(page.getByTestId("project-route-result")).toContainText(
      "0 edges with unconfirmed accessibility",
    );
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    await page.evaluate(
      ({ center }) =>
        (globalThis as unknown as { rampMap: Map }).rampMap.jumpTo({
          center,
          zoom: 22,
          pitch: 45,
          bearing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
      { center: geographicPoint(data, [43, 463]) },
    );
    const marker = page.locator(
      '.project-connector-marker[data-edge-id="ramp:1622190"]',
    );
    await expect(marker).toHaveCount(1);
    await expect(marker).toHaveAttribute(
      "aria-label",
      "Ramp up · local level change",
    );
    await marker.click();
    await expect(
      page.getByRole("heading", { name: "Ramp #1622190", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Connection accessibility", { exact: true }),
    ).toHaveValue("yes");
    await expect(
      page.getByText("9.5% · native geometry", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "3D relative heights", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(globalThis as unknown as { rampMap: Map }).rampMap.getLayer(
              "project-native-ramps",
            ),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "3D relative heights", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const heights = await page.evaluate(() => {
      const map = (globalThis as unknown as { rampMap: Map }).rampMap;
      const source = map.getStyle().sources["project-areas"];
      if (source.type !== "geojson" || typeof source.data === "string")
        throw new Error("Missing native floor features");
      const features = (source.data as import("geojson").FeatureCollection)
        .features;
      return {
        floors: map.getLayoutProperty("project-relative-floors", "visibility"),
        ground: map.getLayoutProperty("project-room-fill", "visibility"),
        base: map.getPaintProperty("project-room-boxes", "fill-extrusion-base"),
        lower: features.find(
          (f) => f.properties?.key === "landing:ramp:1622190:lower",
        )?.properties?.floorTop,
        upper: features.find(
          (f) =>
            f.properties?.key === "landing:local:07:311:08:1487816:1620957:1",
        )?.properties?.floorTop,
      };
    });
    expect(heights.floors).toBe("visible");
    expect(heights.ground).toBe("none");
    expect(heights.base).toEqual(["get", "base"]);
    expect(Number(heights.upper) - Number(heights.lower)).toBeCloseTo(1, 6);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (globalThis as unknown as { rampMap: Map }).rampMap.getPaintProperty(
            "project-room-boxes",
            "fill-extrusion-base",
          ),
        ),
      )
      .toBe(0);
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (globalThis as unknown as { rampMap: Map }).rampMap.getLayoutProperty(
            "project-relative-floors",
            "visibility",
          ),
        ),
      )
      .toBe("none");
    await page
      .getByRole("button", { name: "3D relative heights", exact: true })
      .click();
    await page.screenshot({
      path: `node_modules/.cache/indoor-editor-tests/relative-ramp-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: false,
    });
    await expect(
      page.getByRole("heading", { name: "Ramp #1622190", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(
        '.project-connector-marker[data-edge-id="local:local:07:311:08:1487816:1620957"]',
      ),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Route profile", exact: true }),
    ).toContainText("Confirmed step-free route");
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    const rampInstruction = "Take the ramp up within Campus Floor 1";
    await expect(
      page.getByRole("button", {
        name: /^Go to step \d+: Take the ramp up within Campus Floor 1$/,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /^Go to step \d+: Take the ramp up within Campus Floor 1$/,
        exact: true,
      })
      .click();
    await (mobile
      ? expect(page.getByTestId("mobile-current-instruction")).toHaveText(
          rampInstruction,
        )
      : expect(
          page
            .getByTestId("hospital-step-list")
            .getByRole("button", { name: rampInstruction, exact: true }),
        ).toHaveAttribute("aria-current", "step"));
    await expect(page.getByTestId("hospital-step-list")).not.toContainText(
      "Take stairs",
    );
    await expect(page.getByTestId("hospital-step-list")).not.toContainText(
      "Take the steps",
    );
    await page.screenshot({
      path: `node_modules/.cache/indoor-editor-tests/relative-ramp-navigation-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: false,
    });
    expect(errors).toEqual([]);
    await page.goto("about:blank");
  });
