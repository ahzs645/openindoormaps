import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_ALL_RAMPS_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the all-native-ramps archive.");
for (const mobile of [false, true])
  test(`all native ramp locations and physical walls on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor?view=relative");
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
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByText("12 ramps · 11 entrance reviews", { exact: true })
      .click();
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    for (const ramp of data.rampDisplay!.ramps) {
      await page
        .getByRole("button", {
          name: `Show native ramp #${ramp.nativeElementId}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", { name: "3D relative heights", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const points = ramp.trianglesFeet.flat();
      const center = geographicPoint(data, [
        (Math.min(...points.map((p) => p[0])) +
          Math.max(...points.map((p) => p[0]))) /
          2,
        (Math.min(...points.map((p) => p[1])) +
          Math.max(...points.map((p) => p[1]))) /
          2,
      ]);
      await expect
        .poll(() =>
          page.evaluate(
            ({ center }) => {
              const m = (globalThis as unknown as { rampMap: Map }).rampMap,
                c = m.getCenter();
              return Math.abs(c.lng - center[0]) + Math.abs(c.lat - center[1]);
            },
            { center },
          ),
        )
        .toBeLessThan(1e-7);
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(
              (globalThis as unknown as { rampMap: Map }).rampMap.getLayer(
                "project-native-ramps",
              ),
            ),
          ),
        )
        .toBe(true);
      if (
        [1_586_431, 1_587_605, 1_643_796, 2_081_718].includes(
          ramp.nativeElementId,
        )
      ) {
        await page.locator("canvas.maplibregl-canvas").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `node_modules/.cache/indoor-editor-tests/all-ramp-${ramp.nativeElementId}-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
    }
    await expect(
      page.getByRole("button", { name: "Review pin 2", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.goto("about:blank");
  });
