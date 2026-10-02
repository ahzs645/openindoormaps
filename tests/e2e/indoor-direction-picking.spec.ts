import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

test.use({ hasTouch: true });

const projectPath = process.env.INDOOR_PROJECT_ZIP;
test.skip(
  !projectPath || !existsSync(projectPath),
  "Provide a prepared campus ZIP.",
);

async function clickRoom(page: Page, number: string, mobile: boolean) {
  await page.evaluate(
    async ({ number, mobile }) => {
      const map = (globalThis as unknown as { pickingTestMap: Map })
        .pickingTestMap;
      const areas = (await (
        map.getSource("project-areas") as GeoJSONSource
      ).getData()) as FeatureCollection<Polygon | MultiPolygon>;
      const area = areas.features.find((f) =>
        String(f.properties?.name).startsWith(`${number}\n`),
      )!;
      const ring =
        area.geometry.type === "MultiPolygon"
          ? area.geometry.coordinates[0][0]
          : area.geometry.coordinates[0];
      const xs = ring.map((p) => p[0]),
        ys = ring.map((p) => p[1]);
      const rect = map.getCanvas().getBoundingClientRect();
      const card = document
        .querySelector('[data-testid="project-navigation"]')!
        .getBoundingClientRect();
      map.fitBounds(
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ],
        {
          padding: mobile
            ? {
                left: 24,
                right: 24,
                top: 85,
                bottom: Math.max(100, rect.bottom - card.top + 24),
              }
            : { left: 410, right: 80, top: 100, bottom: 100 },
          maxZoom: 21,
          pitch: map.getPitch(),
          duration: 0,
        },
      );
      // fitBounds estimates a flat footprint. Pan the room into the exposed
      // portion of a tilted mobile map before exercising a real surface tap.
      const p = map.project([
        (Math.min(...xs) + Math.max(...xs)) / 2,
        (Math.min(...ys) + Math.max(...ys)) / 2,
      ]);
      const targetY = mobile
        ? (85 + card.top - rect.top - 24) / 2
        : rect.height / 2;
      const targetX = mobile ? rect.width / 2 : (410 + rect.width - 80) / 2;
      map.panBy([p.x - targetX, p.y - targetY], { duration: 0 });
    },
    { number, mobile },
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = (globalThis as unknown as { pickingTestMap: Map })
          .pickingTestMap;
        return map.loaded() && !map.isMoving();
      }),
    )
    .toBe(true);
  const point = await page
    .evaluate(
      async ({ number, mobile }) => {
        const map = (globalThis as unknown as { pickingTestMap: Map })
          .pickingTestMap;
        const areas = (await (
          map.getSource("project-areas") as GeoJSONSource
        ).getData()) as FeatureCollection<Polygon | MultiPolygon>;
        const area = areas.features.find((f) =>
          String(f.properties?.name).startsWith(`${number}\n`),
        )!;
        const ring =
          area.geometry.type === "MultiPolygon"
            ? area.geometry.coordinates[0][0]
            : area.geometry.coordinates[0];
        const xs = ring.map((p) => p[0]),
          ys = ring.map((p) => p[1]);
        const p = map.project([
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        ]);
        const rect = map.getCanvas().getBoundingClientRect();
        const layers = [
          "project-native-stair-fill",
          "project-native-stair-boxes",
          "project-portal-circle",
          "project-door-fill",
          "project-door-boxes",
          "project-room-boxes",
          "project-block-fill",
          "project-area-outline",
          "project-room-fill",
        ].filter((id) => map.getLayer(id));
        for (let d = 0; d <= 60; d += 10)
          for (const dx of [0, -d, d])
            for (const dy of [0, -d, d]) {
              const x = Math.round(p.x + dx),
                y = Math.round(p.y + dy);
              if (
                x < (mobile ? 12 : 410) ||
                x > rect.width - 20 ||
                y < 100 ||
                y > rect.height - 60 ||
                document.elementFromPoint(rect.left + x, rect.top + y) !==
                  map.getCanvas()
              )
                continue;
              const hits = map.queryRenderedFeatures([x, y], { layers });
              const top =
                hits.find((f) =>
                  f.layer.id.startsWith("project-native-stair-"),
                ) ?? hits[0];
              if (
                top?.properties?.key === area.properties?.key &&
                !top.properties.id
              )
                return {
                  x: Math.round(rect.left + x),
                  y: Math.round(rect.top + y),
                };
            }
        throw new Error(
          `No visible room surface for ${number}: ${JSON.stringify({ p, padding: map.getPadding(), rect: { height: rect.height, width: rect.width }, card: document.querySelector('[data-testid="project-navigation"]')?.getBoundingClientRect(), hits: map.queryRenderedFeatures(p, { layers }).map((f) => f.properties?.key) })}`,
        );
      },
      { number, mobile },
    )
    .catch(async (error) => {
      await page.screenshot({
        path: `/tmp/oim-picking-failure-${mobile ? "mobile" : "desktop"}-${number}.png`,
      });
      throw error;
    });
  await (mobile
    ? page.touchscreen.tap(point.x, point.y)
    : page.mouse.click(point.x, point.y));
}

for (const mobile of [false, true])
  test(`directions support typed and map-picked endpoints on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
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
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { pickingTestMap: Map }).pickingTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(projectPath!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              !!(
                globalThis as unknown as { pickingTestMap?: Map }
              ).pickingTestMap?.getLayer("project-room-boxes"),
          ),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-109");
    await page.getByRole("button", { name: /05-109/ }).click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    const from = page.getByLabel("Route start", { exact: true }),
      to = page.getByLabel("Route destination", { exact: true });
    await expect(to).toHaveValue(/05-109/);
    await expect(from).toHaveValue("");
    await expect(
      page.getByText("Type a departure or click a place on the map.", {
        exact: true,
      }),
    ).toBeVisible();
    await clickRoom(page, "05-107", mobile);
    await expect(from).toHaveValue(/05-107/);
    await expect(to).toHaveValue(/05-109/);
    await expect(page.getByTestId("project-route-result")).toContainText(
      /\b\d+\.\d m\b|The recorded entrances.*05-117.*staff-only/,
    );
    await to.fill("05-108");
    await to.press("Enter");
    await expect(to).toHaveValue(/05-108/);
    await expect(from).toHaveValue(/05-107/);
    await from.click();
    await clickRoom(page, "05-109", mobile);
    await expect(from).toHaveValue(/05-109/);
    await expect(to).toHaveValue(/05-108/);
    await page
      .getByRole("button", { name: "Swap start and destination", exact: true })
      .click();
    await expect(from).toHaveValue(/05-108/);
    await expect(to).toHaveValue(/05-109/);
    const backBox = await page
      .getByRole("button", { name: "Back", exact: true })
      .boundingBox();
    const swapBox = await page
      .getByRole("button", { name: "Swap start and destination", exact: true })
      .boundingBox();
    expect(
      Math.abs(
        backBox!.y + backBox!.height / 2 - swapBox!.y - swapBox!.height / 2,
      ),
    ).toBeLessThan(3);
    expect(swapBox!.x).toBeGreaterThan(backBox!.x + backBox!.width);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { pickingTestMap: Map }
          ).pickingTestMap.getPitch(),
        ),
      )
      .toBeGreaterThan(50);
    await to.click();
    await clickRoom(page, "05-107", mobile);
    await expect(to).toHaveValue(/05-107/);
    await page
      .getByRole("button", { name: "Clear route start", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Clear route destination", exact: true })
      .click();
    await from.click();
    await clickRoom(page, "05-108", mobile);
    await expect(from).toHaveValue(/05-108/);
    await expect(to).toHaveValue("");
    await expect(
      page.getByText("Type a destination or click a place on the map.", {
        exact: true,
      }),
    ).toBeVisible();
    await clickRoom(page, "05-107", mobile);
    await expect(to).toHaveValue(/05-107/);
    await expect(from).toHaveValue(/05-108/);
    await expect(page.getByTestId("project-route-result")).toContainText(
      /\b\d+\.\d m\b|The recorded entrances.*05-117.*staff-only/,
    );
    await page.screenshot({
      path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/unbc-direction-picking-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await clickRoom(page, "05-109", mobile);
    await expect(
      page.getByRole("heading", { name: "Kitchen", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "From here", exact: true }).click();
    await expect(from).toHaveValue(/05-109/);
    await expect(to).toHaveValue(/05-107/);
    await expect(
      page.getByText(
        "Choose another destination or click a place on the map.",
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    await clickRoom(page, "05-107", mobile);
    await expect(to).toHaveValue(/05-107/);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
