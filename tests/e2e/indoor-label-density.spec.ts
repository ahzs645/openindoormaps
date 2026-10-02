import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the prepared UNBC project.");
for (const mobile of [false, true])
  test(`room labels reveal progressively on ${mobile ? "mobile" : "desktop"}`, async ({
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
    await page.evaluate(async (mobile) => {
      const map = (globalThis as unknown as { simpleMap: Map }).simpleMap;
      const labels = await (
        map.getSource("project-labels") as GeoJSONSource
      ).getData();
      const destination = labels.features.find((f) => f.properties?.selected);
      map.jumpTo({
        padding: {
          top: 0,
          bottom: mobile ? 360 : 0,
          left: mobile ? 0 : 400,
          right: 0,
        },
        center:
          destination?.geometry.type === "Point"
            ? (destination.geometry.coordinates as [number, number])
            : map.getCenter(),
        zoom: 19.8,
        pitch: 55,
      });
    }, mobile);
    const settle = async () => {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { simpleMap: Map }).simpleMap;
            return !map.isMoving() && map.isSourceLoaded("project-labels");
          }),
        )
        .toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    };
    await settle();
    const visibleLabels = () =>
      page
        .locator('[data-testid="project-3d-labels"] > div')
        .evaluateAll((elements) =>
          elements
            .filter(
              (e) =>
                (e as HTMLElement).style.display !== "none" &&
                Number((e as HTMLElement).style.opacity) > 0.1,
            )
            .map((e) => e.textContent || ""),
        );
    await expect
      .poll(async () =>
        (await visibleLabels()).some((s) =>
          s.includes("Library Services Desk"),
        ),
      )
      .toBe(true);
    const overview = await visibleLabels();
    expect(
      overview.some((s) => /\bOffice\b|\bStorage\b|\bMech\b/.test(s)),
    ).toBe(false);
    expect(overview.length).toBeLessThan(mobile ? 25 : 66);
    await page.screenshot({
      path: `docs/screenshots/unbc-sparse-labels-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.evaluate(async () => {
      const map = (globalThis as unknown as { simpleMap: Map }).simpleMap;
      const labels = await (
        map.getSource("project-labels") as GeoJSONSource
      ).getData();
      const center = map.getCenter();
      const ordinary = labels.features
        .filter(
          (f) => f.properties?.minZoom === 21 && f.geometry.type === "Point",
        )
        .sort((a, b) => {
          const distance = (f: typeof a) =>
            f.geometry.type === "Point"
              ? Math.hypot(
                  f.geometry.coordinates[0] - center.lng,
                  f.geometry.coordinates[1] - center.lat,
                )
              : Infinity;
          return distance(a) - distance(b);
        })[0];
      map.jumpTo({
        zoom: 21.5,
        center:
          ordinary.geometry.type === "Point"
            ? (ordinary.geometry.coordinates as [number, number])
            : center,
      });
    });
    await expect
      .poll(async () =>
        (await visibleLabels()).some((s) => /^05-\d+[A-Z]?$/.test(s)),
      )
      .toBe(true);
    await settle();
    const detail = await visibleLabels();
    expect(detail.some((s) => /\bOffice\b|\bStorage\b|\bMech\b/.test(s))).toBe(
      false,
    );
    await page.screenshot({
      path: `docs/screenshots/unbc-room-number-labels-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.evaluate(() =>
      (globalThis as unknown as { simpleMap: Map }).simpleMap.jumpTo({
        zoom: 19.8,
        pitch: 0,
      }),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(
              globalThis as unknown as { simpleMap: Map }
            ).simpleMap.getLayoutProperty("project-label", "text-padding"),
        ),
      )
      .toBe(true);
    const symbols = await page.evaluate(() => {
      const map = (globalThis as unknown as { simpleMap: Map }).simpleMap;
      return {
        text: map.getLayoutProperty("project-label", "text-field"),
        opacity: map.getPaintProperty("project-label", "text-opacity"),
        padding: map.getLayoutProperty("project-label", "text-padding"),
      };
    });
    expect(symbols.text).toContain("step");
    expect(symbols.opacity).toContain("interpolate");
    expect(symbols.padding).toContain("interpolate");
    await settle();
    await page.screenshot({
      path: `docs/screenshots/unbc-sparse-labels-2d-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
