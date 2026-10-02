import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the prepared UNBC project.");
for (const mobile of [false, true])
  test(`label presets and custom controls persist on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        /expression|text-field|text-opacity|text-padding/i.test(m.text())
      )
        errors.push(m.text());
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        original = lib.Map.prototype.fitBounds;
      lib.Map.prototype.fitBounds = function (
        this: Map,
        ...args: Parameters<Map["fitBounds"]>
      ) {
        (globalThis as unknown as { simpleMap: Map }).simpleMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-136");
    await page
      .getByRole("button", { name: /^05-136 · Library Services Desk/ })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !(
              globalThis as unknown as { simpleMap: Map }
            ).simpleMap?.isMoving(),
        ),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    const preset = page.getByLabel("Label preset", { exact: true });
    await expect(preset).toHaveValue("balanced");
    const ordinaryZoom = () =>
      page.evaluate(async () => {
        const map = (globalThis as unknown as { simpleMap: Map }).simpleMap;
        const data = await (
          map.getSource("project-labels") as GeoJSONSource
        ).getData();
        return data.features.find((f) => f.properties?.priority === 2)
          ?.properties?.minZoom;
      });
    await expect.poll(ordinaryZoom).toBe(21);
    await preset.selectOption("detailed");
    await expect.poll(ordinaryZoom).toBe(19);
    await preset.selectOption("minimal");
    await expect.poll(ordinaryZoom).toBe(22);
    await page.getByText("Adjust labels", { exact: true }).click();
    const numbers = page.getByLabel("Room label reveal zoom", { exact: true });
    await numbers.press("Home");
    await numbers.press("ArrowRight");
    await expect(numbers).toHaveValue("18.5");
    await expect(preset).toHaveValue("custom");
    await expect.poll(ordinaryZoom).toBe(18.5);
    const names = page.getByLabel("Full room name zoom", { exact: true });
    await names.press("End");
    await names.press("ArrowLeft");
    await expect(names).toHaveValue("23.5");
    const spacing = page.getByLabel("Label spacing", { exact: true });
    await spacing.press("End");
    await spacing.press("ArrowLeft");
    await expect(spacing).toHaveValue("27");
    await page.screenshot({
      path: `docs/screenshots/unbc-label-settings-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        original = lib.Map.prototype.fitBounds;
      lib.Map.prototype.fitBounds = function (
        this: Map,
        ...args: Parameters<Map["fitBounds"]>
      ) {
        (globalThis as unknown as { simpleMap: Map }).simpleMap = this;
        return original.apply(this, args);
      };
    });

    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await expect(page.getByLabel("Label preset", { exact: true })).toHaveValue(
      "custom",
    );
    await page.getByText("Adjust labels", { exact: true }).click();
    await expect(
      page.getByLabel("Room label reveal zoom", { exact: true }),
    ).toHaveValue("18.5");
    await expect(
      page.getByLabel("Full room name zoom", { exact: true }),
    ).toHaveValue("23.5");
    await expect(page.getByLabel("Label spacing", { exact: true })).toHaveValue(
      "27",
    );
    await page
      .getByLabel("Label preset", { exact: true })
      .selectOption("balanced");
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    // The restored map is a fresh instance, so capture it through a normal room selection.
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-136");
    await page
      .getByRole("button", { name: /^05-136 · Library Services Desk/ })
      .click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page
      .getByLabel("Label preset", { exact: true })
      .selectOption("detailed");
    await expect.poll(ordinaryZoom).toBe(19);
    const layout = await page.evaluate(() => {
      const map = (globalThis as unknown as { simpleMap: Map }).simpleMap;
      return {
        padding: map.getLayoutProperty("project-label", "text-padding"),
        text: map.getLayoutProperty("project-label", "text-field"),
      };
    });
    expect(layout.padding).toContain("interpolate");
    expect(layout.text).toContain("step");
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
