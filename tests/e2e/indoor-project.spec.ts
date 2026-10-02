import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
const zipPath = process.env.INDOOR_PROJECT_ZIP;
const fixtureDataset: IndoorDataset | undefined =
  zipPath && existsSync(zipPath)
    ? JSON.parse(
        strFromU8(unzipSync(readFileSync(zipPath))["viewer/indoor.json"]),
      )
    : undefined;
// Preparation may repair a previously missing entrance. Exercise a real
// remaining source gap without asserting that a corrected room stays broken.
const missingOfficeNumber = fixtureDataset?.records.find(
  (r) => r.building === "09" && r.name === "Office" && !r.arrivalNodeId,
)?.number;
test.skip(
  !zipPath || !existsSync(zipPath),
  "Set INDOOR_PROJECT_ZIP to a prepared UNBC ZIP with native door geometry.",
);

for (const mobile of [false, true]) {
  test(`prepared hospital-style rooms and doors work on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
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
          (globalThis as unknown as { projectTestMap: Map }).projectTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zipPath!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 30_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { projectTestMap: Map })
              .projectTestMap;
            return (
              !!map?.getLayer("project-door-boxes") &&
              map.getPitch() > 50 &&
              !map.isMoving()
            );
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    await page
      .getByLabel("Project building", { exact: true })
      .selectOption("05");
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const map = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          const areas = (await (
            map.getSource("project-areas") as GeoJSONSource
          ).getData()) as FeatureCollection;
          return areas.features.every((f) => f.properties?.building === "05");
        }),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Whole floor", exact: true })
      .click();
    const state = await page.evaluate(async () => {
      const map = (globalThis as unknown as { projectTestMap: Map })
        .projectTestMap;
      const areas = (await (
        map.getSource("project-areas") as GeoJSONSource
      ).getData()) as FeatureCollection;
      const doors = (await (
        map.getSource("project-doors") as GeoJSONSource
      ).getData()) as FeatureCollection;
      const blocks = (await (
        map.getSource("project-room-blocks") as GeoJSONSource
      ).getData()) as FeatureCollection;
      return {
        blockType: map.getLayer("project-room-boxes")?.type,
        blockSource: map.getLayer("project-room-boxes")?.source,
        wallDefinedRooms: blocks.features.filter((f) =>
          ["native-walls", "prepared-native-walls"].includes(
            String(f.properties?.boundarySource),
          ),
        ).length,
        previouslyInsetRoomsResolved: ["05-107", "05-108", "05-109"].every(
          (number) => {
            const area = areas.features.find((f) =>
              String(f.properties?.name).startsWith(`${number}\n`),
            );
            return blocks.features.some(
              (f) =>
                f.properties?.key === area?.properties?.key &&
                ["native-walls", "prepared-native-walls"].includes(
                  String(f.properties?.boundarySource),
                ),
            );
          },
        ),
        studioHasPreparedNativeBoundary: blocks.features.some(
          (f) =>
            f.properties?.key === "rm-311-433cf6296f39" &&
            f.properties?.boundarySource === "prepared-native-walls",
        ),
        hallwaysStayOpen: blocks.features.every((block) =>
          areas.features.some(
            (area) =>
              area.properties?.key === block.properties?.key &&
              !area.properties?.circulation,
          ),
        ),
        roomFillType: map.getLayer("project-room-fill")?.type,
        wallVisibility: map.getLayoutProperty(
          "project-wall-boxes",
          "visibility",
        ),
        rooms: areas.features.filter(
          (f) => f.properties?.walkable && !f.properties.circulation,
        ).length,
        corridors: areas.features.filter(
          (f) => f.properties?.circulation && f.properties.color === "#ffffff",
        ).length,
        doors: doors.features.length,
      };
    });
    expect(state.blockType).toBe("fill-extrusion");
    expect(state.blockSource).toBe("project-room-blocks");
    expect(state.wallDefinedRooms).toBeGreaterThan(0);
    expect(state.previouslyInsetRoomsResolved).toBe(true);
    expect(state.studioHasPreparedNativeBoundary).toBe(true);
    expect(state.hallwaysStayOpen).toBe(true);
    expect(state.roomFillType).toBe("fill");
    expect(state.wallVisibility).toBe("visible");
    expect(state.rooms).toBeGreaterThan(10);
    expect(state.corridors).toBeGreaterThan(0);
    expect(state.doors).toBeGreaterThan(20);
    const pillars = page.getByRole("checkbox", {
      name: "Show pillars",
      exact: true,
    });
    await expect(pillars).not.toBeChecked();
    const columnCount = () =>
      page.evaluate(async () => {
        const map = (globalThis as unknown as { projectTestMap: Map })
          .projectTestMap;
        const walls = (await (
          map.getSource("project-walls") as GeoJSONSource
        ).getData()) as FeatureCollection;
        return walls.features.filter((f) => f.properties?.kind === "column")
          .length;
      });
    await expect.poll(columnCount).toBe(0);
    await pillars.check();
    await expect.poll(columnCount).toBeGreaterThan(0);
    await pillars.uncheck();
    await expect.poll(columnCount).toBe(0);
    const raised = page.getByRole("button", { name: "3D rooms", exact: true }),
      flat = page.getByRole("button", { name: "2D rooms", exact: true });
    await flat.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { projectTestMap: Map }
          ).projectTestMap.getPitch(),
        ),
      )
      .toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          return map
            .queryRenderedFeatures({ layers: ["project-portal-circle"] })
            .filter((f) => f.properties?.review).length;
        }),
      )
      .toBeGreaterThan(0);
    const entrance = await page.evaluate(() => {
      const map = (globalThis as unknown as { projectTestMap: Map })
        .projectTestMap;
      const f = map
        .queryRenderedFeatures({ layers: ["project-portal-circle"] })
        .find((f) => f.properties?.review)!;
      if (f.geometry.type !== "Point")
        throw new Error("Entrance marker must be a point");
      const p = map.project([
        f.geometry.coordinates[0],
        f.geometry.coordinates[1],
      ]);
      return { x: p.x, y: p.y, id: f.properties!.nativeElementId };
    });
    await page
      .locator(".maplibregl-canvas")
      .click({ position: { x: entrance.x, y: entrance.y } });
    await expect(
      page.getByRole("heading", { name: "Entrance review", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Door #${entrance.id}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply review", exact: true }),
    ).toHaveCount(0);
    await raised.click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { projectTestMap: Map }
          ).projectTestMap.getPitch(),
        ),
      )
      .toBeCloseTo(55, 5);
    await page
      .getByLabel("Project building", { exact: true })
      .selectOption("all");
    await page
      .getByLabel("Route start", { exact: true })
      .selectOption({ label: "05-120 · Corridor · 05 / #311" });
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption({ label: "07-101 · Corridor · 07 / #311" });
    await expect(page.getByTestId("project-route-result")).toContainText(
      "15.8 m",
    );
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const m = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          const routes = (await (
            m.getSource("project-route") as GeoJSONSource
          ).getData()) as FeatureCollection;
          return (
            routes.features.length === 1 &&
            routes.features[0].properties?.centered &&
            routes.features[0].geometry.type === "LineString" &&
            routes.features[0].geometry.coordinates.length === 3
          );
        }),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Fit route", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const m = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          return (
            !m.isMoving() &&
            m.queryRenderedFeatures({ layers: ["project-route-line"] }).length >
              0
          );
        }),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator('[data-testid="project-3d-labels"] [data-room-key]')
          .filter({ visible: true })
          .count(),
      )
      .toBeGreaterThan(0);
    await page
      .getByLabel("Route start", { exact: true })
      .selectOption({ label: "05-S101 · Stair · 05 / #311" });
    await page
      .getByLabel("Route destination", { exact: true })
      .selectOption({ label: "05-S201 · Stair · 05 / #694" });
    await expect(page.getByTestId("project-route-result")).toContainText(
      "1 step/stair transitions",
    );
    await page
      .getByLabel("Map floor", { exact: true })
      .selectOption({ label: "Floor 2" });
    await expect(page.getByLabel("Project floor", { exact: true })).toHaveValue(
      "storey:694",
    );
    await page.getByRole("button", { name: "Fit route", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as { projectTestMap: Map }
            ).projectTestMap.queryRenderedFeatures({
              layers: ["project-route-line"],
            }).length,
        ),
      )
      .toBeGreaterThan(0);
    await page
      .getByLabel("Route profile", { exact: true })
      .selectOption("accessible");
    await expect(page.getByTestId("project-route-result")).toContainText(
      "No verified route",
    );
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const m = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          return (
            m.getLayoutProperty("project-block-fill", "visibility") ===
              "visible" &&
            m.getLayer("project-block-fill")?.source ===
              m.getLayer("project-room-boxes")?.source &&
            m.getLayoutProperty("project-door-fill", "visibility") === "none" &&
            m.getLayoutProperty("project-door-boxes", "visibility") === "none"
          );
        }),
      )
      .toBe(true);
    if (mobile)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-122");
    await page.getByRole("button", { name: /^05-122 · Studio/ }).click();
    await expect(
      page.getByRole("heading", { name: "Studio", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          return !map.isMoving() && Math.abs(map.getPitch() - 55) < 0.01;
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/unbc-joint-repaired-studio-${mobile ? "mobile" : "desktop"}.png`,
    });
  });
}

for (const mobile of [false, true]) {
  test(`hospital-style project navigation follows multi-turn and multi-floor routes on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/projects/indoor");
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
          (globalThis as unknown as { projectTestMap: Map }).projectTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zipPath!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("project-navigation")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Washroom", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page.getByLabel("Show pass-through places", { exact: true }).check();
    await page
      .getByRole("button", { name: "Navigation preference", exact: true })
      .press("Enter");
    await expect(
      page.getByRole("menuitemradio", { name: "Public review", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await page
      .getByRole("menuitemradio", {
        name: "Confirmed step-free route",
        exact: true,
      })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: "Navigation preference", exact: true }),
    ).toContainText("Confirmed step-free route");
    await page
      .getByRole("button", { name: "Navigation preference", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Public review", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Open level selector", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Change the currently selected building" })
      .click();
    await page.getByRole("textbox", { name: "Search buildings" }).fill("03");
    await page
      .getByRole("menuitem", { name: "Building 03", exact: true })
      .click();
    await expect(
      page.getByRole("menuitemradio", { name: "Campus Floor 1", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("menuitemradio", { name: "Floor 2", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open level selector", exact: true }),
    ).toContainText("Building 03");
    await expect
      .poll(async () => {
        const areas = await page.evaluate(async () => {
          const map = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          return (await (
            map.getSource("project-areas") as GeoJSONSource
          ).getData()) as FeatureCollection;
        });
        return (
          areas.features.length > 0 &&
          areas.features.every((area) => area.properties?.building === "03")
        );
      })
      .toBe(true);
    await page
      .getByRole("button", { name: "Open level selector", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Campus Floor 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    expect(missingOfficeNumber).toBeTruthy();
    await page
      .getByLabel("Route start", { exact: true })
      .fill(missingOfficeNumber!);
    await expect(
      page.getByRole("option", {
        name: new RegExp(`^${missingOfficeNumber} · Office`),
      }),
    ).toContainText("Entrance needs review");
    await page
      .getByRole("option", {
        name: new RegExp(`^${missingOfficeNumber} · Office`),
      })
      .click();
    await page.getByLabel("Route destination", { exact: true }).fill("05-154");
    await page.getByRole("option", { name: /^05-154 · Classroom/ }).click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "no prepared entrance connection",
    );
    await page.getByLabel("Route start", { exact: true }).fill("03-015");
    await page.getByLabel("Route start", { exact: true }).press("Enter");
    await page.getByLabel("Route destination", { exact: true }).fill("05-154");
    await page.getByRole("option", { name: /^05-154 · Classroom/ }).click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      /missing a connection between Building 03 and (Library|Building 05)/,
    );
    await expect(
      page.getByRole("button", { name: "Review connection", exact: true }),
    ).toBeVisible();
    if (mobile) {
      const review = await page
        .getByRole("button", { name: "Review connection", exact: true })
        .boundingBox();
      const card = await page.getByTestId("project-navigation").boundingBox();
      expect(review!.y + review!.height).toBeLessThanOrEqual(
        card!.y + card!.height,
      );
    }
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Swap start and destination", exact: true })
      .click();
    await expect(page.getByLabel("Route start", { exact: true })).toHaveValue(
      "05-154 · Classroom",
    );
    await expect(
      page.getByLabel("Route destination", { exact: true }),
    ).toHaveValue("03-015 · Meeting");
    await page.getByLabel("Route start", { exact: true }).fill("no-such-room");
    await expect(
      page.getByText("No matching locations", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("project-route-result")).toHaveCount(0);
    await page.getByLabel("Route start", { exact: true }).press("Escape");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-165");
    await page.getByRole("button", { name: /05-165 · Vestibule/ }).click();
    await expect(
      page.getByRole("heading", { name: "Vestibule", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("05-120");
    await page
      .getByRole("option", { name: /^05-120 · (Corridor|Library corridor)/ })
      .click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "68.6 m",
    );
    await expect(page.getByTestId("project-route-result")).toContainText(
      "1 turn",
    );
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const map = (globalThis as unknown as { projectTestMap: Map })
            .projectTestMap;
          if (!map?.getSource("project-route")) return false;
          const lines = (await (
            map.getSource("project-route") as GeoJSONSource
          ).getData()) as FeatureCollection;
          return (
            lines.features.length === 1 &&
            lines.features[0].properties?.centered &&
            lines.features[0].geometry.type === "LineString" &&
            lines.features[0].geometry.coordinates.length === 4
          );
        }),
      )
      .toBe(true);
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    await expect(
      page.getByRole("progressbar", { name: "Route progress" }),
    ).toHaveAttribute("aria-valuenow", "0");
    const camera = () =>
      page.evaluate(() => {
        const map = (globalThis as unknown as { projectTestMap: Map })
          .projectTestMap;
        return {
          moving: map.isMoving(),
          lng: map.getCenter().lng,
          lat: map.getCenter().lat,
        };
      });
    await expect
      .poll(async () => {
        const state = await camera();
        return !state.moving;
      })
      .toBe(true);
    await page.getByRole("button", { name: "Fit route", exact: true }).click();
    await expect
      .poll(async () => {
        const state = await camera();
        return !state.moving;
      })
      .toBe(true);
    const visibleRoute = await page.evaluate(async () => {
      const map = (globalThis as unknown as { projectTestMap: Map })
        .projectTestMap;
      const lines = (await (
        map.getSource("project-route") as GeoJSONSource
      ).getData()) as FeatureCollection;
      const rect = map.getContainer().getBoundingClientRect();
      const mobile = rect.width < 768;
      const desktop = document
        .querySelector('[data-testid="hospital-desktop-preview"]')!
        .getBoundingClientRect();
      const top = mobile
        ? map
            .getContainer()
            .querySelector('[aria-label="Current direction"]')!
            .getBoundingClientRect().bottom - rect.top
        : 60;
      const bottom = mobile
        ? map
            .getContainer()
            .querySelector('[data-testid="mobile-route-floor"]')!
            .getBoundingClientRect().top - rect.top
        : rect.height - 40;
      const left = mobile ? 20 : desktop.right - rect.left + 20;
      return lines.features.every(
        (f) =>
          f.geometry.type === "LineString" &&
          f.geometry.coordinates.every((p) => {
            const point = map.project([p[0], p[1]]);
            return (
              point.x >= left &&
              point.x <= rect.width - 20 &&
              point.y >= top &&
              point.y <= bottom
            );
          }),
      );
    });
    expect(visibleRoute).toBe(true);
    const wholeRouteCamera = await camera();
    // Selecting the active step again resumes following after whole-route fit.
    await page.getByRole("button", { name: /^Go to step 1:/ }).click();
    await expect
      .poll(async () => {
        const current = await camera();
        return (
          !current.moving &&
          Math.hypot(
            current.lng - wholeRouteCamera.lng,
            current.lat - wholeRouteCamera.lat,
          ) > 0.000_01
        );
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const state = await camera();
        return !state.moving;
      })
      .toBe(true);
    const first = await camera();
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(
      page.getByRole("progressbar", { name: "Route progress" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await expect
      .poll(async () => {
        const state = await camera();
        return !state.moving;
      })
      .toBe(true);
    const next = await camera();
    expect(
      Math.hypot(next.lng - first.lng, next.lat - first.lat),
    ).toBeGreaterThan(0.000_01);
    await expect(
      mobile
        ? page.getByTestId("mobile-current-instruction")
        : page.locator('[aria-current="step"]'),
    ).toHaveText(/Turn (left|right)/);
    await page
      .getByRole("button", { name: "Previous step", exact: true })
      .click();
    await expect(
      page.getByRole("progressbar", { name: "Route progress" }),
    ).toHaveAttribute("aria-valuenow", "0");
    await page
      .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
      .click();
    await page.getByLabel("Route destination", { exact: true }).fill("05-S203");
    await page.getByRole("option", { name: /^05-S203 · Stair/ }).click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "1 floor change",
    );
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: /^Go to step \d+: Take stairs up to Floor 2$/,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Open level selector", exact: true }),
    ).toHaveAttribute("data-floor-id", "storey:694", { timeout: 15_000 });
    if (mobile) {
      await expect(page.getByTestId("mobile-route-floor")).toContainText(
        "Floor 2",
      );
      await expect(
        page.getByTestId("mobile-current-instruction"),
      ).toContainText("Take stairs up");
    } else
      await expect(page.locator('[aria-current="step"]')).toContainText(
        "Take stairs up",
      );
    await page
      .getByRole("button", { name: "Previous step", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open level selector", exact: true }),
    ).toHaveAttribute("data-floor-id", "storey:1450417+311+1487816", {
      timeout: 15_000,
    });
    await page
      .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Route profile", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", {
        name: "Confirmed step-free route",
        exact: true,
      })
      .click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "No confirmed step-free route",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // A coarse classroom outline reaches only a marginal edge of its jamb.
    // Preserve the source review instead of restoring an unsupported shortcut.
    // Then follow a verified ordinary-room journey through three flights.
    await page
      .getByRole("button", { name: "Route profile", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Public review", exact: true })
      .click();
    await page.getByLabel("Route start", { exact: true }).fill("08-161");
    await page.getByRole("option", { name: /^08-161 · Classroom/ }).click();
    await page.getByLabel("Route destination", { exact: true }).fill("10-4588");
    await page.getByRole("option", { name: /^10-4588 · Classroom/ }).click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "no prepared entrance connection",
    );
    await expect(
      page.getByRole("button", { name: "Review connection", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Route start", { exact: true }).fill("10-1018");
    await page.getByRole("option", { name: /^10-1018 · OT Office/ }).click();
    await page.getByLabel("Route destination", { exact: true }).fill("10-4018");
    await page.getByRole("option", { name: /^10-4018 · Office/ }).click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "3 floor changes",
    );
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    for (const [name, id] of [
      ["Floor 2", "694"],
      ["Floor 3", "400176"],
      ["Floor 4", "402367"],
    ]) {
      await page
        .getByRole("button", {
          name: new RegExp(`^Go to step \\d+: Take stairs up to ${name}$`),
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toHaveAttribute("data-floor-id", `storey:${id}`, { timeout: 15_000 });
      await expect(
        mobile
          ? page.getByTestId("mobile-current-instruction")
          : page.locator('[aria-current="step"]'),
      ).toContainText(`Take stairs up to ${name}`);
      if (!mobile)
        await expect
          .poll(async () => {
            const list = await page
              .getByTestId("hospital-step-list")
              .boundingBox();
            const row = await page
              .locator('[aria-current="step"]')
              .boundingBox();
            return (
              !!list &&
              !!row &&
              row.y >= list.y &&
              row.y + row.height <= list.y + list.height
            );
          })
          .toBe(true);
    }
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            !(
              globalThis as unknown as { projectTestMap: Map }
            ).projectTestMap.isMoving(),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/unbc-three-flight-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page
      .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Swap start and destination", exact: true })
      .click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "3 floor changes",
    );
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    for (const name of ["Floor 3", "Floor 2", "Campus Floor 1"]) {
      await page
        .getByRole("button", {
          name: new RegExp(`^Go to step \\d+: Take stairs down to ${name}$`),
        })
        .click();
      await expect(
        mobile
          ? page.getByTestId("mobile-current-instruction")
          : page.locator('[aria-current="step"]'),
      ).toContainText(`Take stairs down to ${name}`);
    }
    expect(errors).toEqual([]);
  });
}
