import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { RESTRICTED_AREA_COLOR } from "../../app/indoor-project/display-passages";

const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
const numbers = ["07-702", "07-704", "07-750", "07-751", "07-752", "05-117"];
for (const mobile of [false, true]) {
  test(`restricted areas render flat with access colour and clear status on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!data, "Set INDOOR_PROJECT_ZIP to the reviewed UNBC ZIP.");
    test.setTimeout(180_000);
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
          (globalThis as unknown as { restrictedMap: Map }).restrictedMap =
            this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    for (const number of numbers) {
      const record = data!.records.find((r) => r.number === number)!;
      expect(record.access).toBe("staff");
      expect(record.arrivalNodeId).toBeUndefined();
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
      await page.getByLabel("Find project area", { exact: true }).fill(number);
      await page
        .locator(".project-search-item")
        .filter({ hasText: `${number} · ${record.name} · #311` })
        .click();
      await page
        .getByRole("button", { name: "Explore map", exact: true })
        .click();
      await expect(
        page.getByText("Off limits · Staff only", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Entrance needs review before directions are available.",
          { exact: true },
        ),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "From here", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Directions", exact: true }),
      ).toBeDisabled();
      for (const view of ["2D rooms", "3D rooms"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        await expect
          .poll(
            () =>
              page.evaluate(
                async ({ key, color }) => {
                  const map = (globalThis as unknown as { restrictedMap: Map })
                    .restrictedMap;
                  if (
                    !map?.getSource("project-areas") ||
                    !map.getSource("project-room-blocks")
                  )
                    return false;
                  const surfaces = await Promise.all(
                    ["project-areas", "project-room-blocks"].map(
                      async (id) =>
                        (await (
                          map.getSource(id) as GeoJSONSource
                        ).getData()) as FeatureCollection,
                    ),
                  );
                  return (
                    surfaces[0].features.some(
                      (f) =>
                        f.properties?.key === key &&
                        f.properties?.access === "staff" &&
                        f.properties?.color === color &&
                        f.properties?.circulation === true,
                    ) &&
                    !surfaces[1].features.some((f) => f.properties?.key === key)
                  );
                },
                { key: record.key, color: RESTRICTED_AREA_COLOR },
              ),
            { timeout: 30_000 },
          )
          .toBe(true);
      }
      if (number === "07-752")
        await page.screenshot({
          path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/restricted-colors-${mobile ? "mobile" : "desktop"}.png`,
        });
    }
    // A disconnected public destination needs entrance review, not an access label.
    const disconnected = data!.records.find((r) => r.number === "07-249")!;
    expect(disconnected.access).not.toBe("staff");
    expect(disconnected.arrivalNodeId).toBeUndefined();
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByLabel("Find project area", { exact: true })
      .fill(disconnected.number!);
    await page
      .locator(".project-search-item")
      .filter({
        hasText: `${disconnected.number} · ${disconnected.name} · #311`,
      })
      .click();
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await expect(
      page.getByText("Entrance needs review before directions are available.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Off limits · Staff only", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
