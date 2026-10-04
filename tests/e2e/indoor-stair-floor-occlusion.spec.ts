import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { geographicPoint } from "../../app/indoor-project/routing";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import polygonClipping from "polygon-clipping";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
const zip = process.env.INDOOR_VIEWER_ZIP;
for (const mobile of [false, true])
  test(`Floor 3 keeps the Building 6 native well open and surrounding ground solid on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the consolidated viewer ZIP");
    test.setTimeout(120_000);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const floor = data.floors.find((f) => f.levelIds.includes(1_487_353))!;
    const errors: string[] = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("Application error:", e.message);
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached({
      timeout: 15_000,
    });
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
        if (args[0] === "project-areas")
          (
            globalThis as unknown as { stairOcclusionMap: Map }
          ).stairOcclusionMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Open level selector", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: floor.name, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Open level selector", exact: true }),
    ).toHaveAttribute("data-floor-id", floor.id);
    await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = (globalThis as unknown as { stairOcclusionMap?: Map })
            .stairOcclusionMap;
          return !!map && map.loaded() && !map.isMoving();
        }),
      )
      .toBe(true);
    const center = geographicPoint(data, [-202, -82]);
    for (const three of [false, true]) {
      await page
        .getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: three ? "3D rooms" : "2D rooms",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.evaluate(
        ({ center, three, mobile }) =>
          (
            globalThis as unknown as { stairOcclusionMap: Map }
          ).stairOcclusionMap.jumpTo({
            center,
            zoom: mobile ? 20.6 : 22.2,
            pitch: three ? (mobile ? 25 : 35) : 0,
            bearing: 15,
            padding: mobile
              ? { top: 125, right: 10, bottom: 440, left: 10 }
              : { top: 0, right: 0, bottom: 0, left: 390 },
          }),
        { center, three, mobile },
      );
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const m = (globalThis as unknown as { stairOcclusionMap: Map })
                .stairOcclusionMap;
              const source = (await (
                m.getSource("project-native-stairs") as GeoJSONSource
              ).getData()) as FeatureCollection;
              const steps = source.features.filter(
                (f) => f.properties?.stairElementId === 1_779_495,
              );
              return (
                steps.length > 0 &&
                steps.every((f) => f.properties?.nativeFloorBound === true) &&
                !m.isMoving()
              );
            }),
          { timeout: 30_000 },
        )
        .toBe(true);
      if (three) {
        await expect
          .poll(() =>
            page.evaluate(() => {
              const m = (globalThis as unknown as { stairOcclusionMap: Map })
                .stairOcclusionMap;
              const opacity = m.getPaintProperty(
                "project-relative-floors",
                "fill-extrusion-opacity",
              );
              // Visitor layers fade in with zoom. At detail zoom the curve's
              // final stop evaluates to opaque ground, rather than a literal 1.
              const opaque =
                opacity === 1 ||
                (Array.isArray(opacity) &&
                  opacity.at(-1) === 1 &&
                  m.getZoom() >= Number(opacity.at(-2)));
              return (
                m.getLayoutProperty("project-relative-floors", "visibility") ===
                  "visible" &&
                opaque &&
                Boolean(m.getLayer("project-descending-stairs"))
              );
            }),
          )
          .toBe(true);
      }
      const collections = (await page.evaluate(async () => {
        const m = (globalThis as unknown as { stairOcclusionMap: Map })
          .stairOcclusionMap;
        return {
          stairs: await (
            m.getSource("project-native-stairs") as GeoJSONSource
          ).getData(),
          ground: await (
            m.getSource("project-areas") as GeoJSONSource
          ).getData(),
          selection: await (
            m.getSource("project-selection-areas") as GeoJSONSource
          ).getData(),
        };
      })) as {
        stairs: FeatureCollection;
        ground: FeatureCollection;
        selection: FeatureCollection;
      };
      const material = collections.ground.features.filter(
        (f) =>
          !f.properties?.openDrop &&
          (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
      );
      expect(material.some((f) => f.properties?.nativeFloor)).toBe(true);
      // The native well is open in the actual rendered ground, not merely in a
      // place-specific overlay. Source contours remain available for picking.
      expect(
        material.some((f) =>
          booleanPointInPolygon(
            { type: "Point", coordinates: center },
            f.geometry as
              | import("geojson").Polygon
              | import("geojson").MultiPolygon,
          ),
        ),
      ).toBe(false);
      const ground = {
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: material.flatMap((f) =>
            f.geometry.type === "Polygon"
              ? [f.geometry.coordinates]
              : (f.geometry as import("geojson").MultiPolygon).coordinates,
          ),
        },
      };
      const stairKeys = new Set(
        data.records.filter((r) => r.stair).map((r) => r.key),
      );
      for (const f of material.filter((f) =>
        stairKeys.has(String(f.properties?.key)),
      ))
        expect(
          f.properties?.nativeCellId ||
            f.properties?.groundEvidence === "native-stair-surround",
        ).toBeTruthy();
      expect(
        collections.stairs.features.filter(
          (f) => f.properties?.stairElementId === 1_779_495,
        ).length,
      ).toBeGreaterThanOrEqual(24);
      // Native circulation stays inside its original physical cell. Existing
      // room-face masks may trim its tint around neighbouring repaired rooms.
      for (const f of collections.ground.features.filter((f) =>
        Boolean(f.properties?.nativeCellId),
      )) {
        const original = collections.selection.features.find(
          (s) => s.id === f.id && s.properties?.key === f.properties?.key,
        )!;
        expect(original).toBeDefined();
        if (f.properties?.wallFaceFloorMasks) {
          expect(f.geometry.type).toBe("MultiPolygon");
          expect(original.geometry.type).toBe("MultiPolygon");
          const extra = polygonClipping.difference(
            (f.geometry as import("geojson").MultiPolygon).coordinates as [
              number,
              number,
            ][][][],
            (original.geometry as import("geojson").MultiPolygon)
              .coordinates as [number, number][][][],
          );
          const origin = (f.geometry as import("geojson").MultiPolygon)
            .coordinates[0][0][0];
          const extraArea = extra.reduce(
            (sum, polygon) =>
              sum +
              polygon.reduce(
                (area, ring, i) =>
                  area +
                  ((i ? -1 : 1) *
                    Math.abs(
                      ring.reduce((value, a, j) => {
                        const b = ring[(j + 1) % ring.length];
                        return (
                          value +
                          (a[0] - origin[0]) * (b[1] - origin[1]) -
                          (b[0] - origin[0]) * (a[1] - origin[1])
                        );
                      }, 0),
                    )) /
                    2,
                0,
              ),
            0,
          );
          // Geographic clipping can leave sub-millimetre round-trip slivers.
          expect(extraArea).toBeLessThan(1e-14);
        } else {
          expect(f).toEqual(original);
        }
      }
      const covered = collections.stairs.features.filter(
        (f) =>
          f.properties?.stairElementId === 1_779_495 &&
          Number(f.properties?.topMetres) < -0.003,
      );
      for (const f of covered) {
        if (
          f.geometry.type === "Polygon" &&
          ground.geometry.type === "MultiPolygon"
        ) {
          const origin = f.geometry.coordinates[0][0];
          const parts = polygonClipping.intersection(
            f.geometry.coordinates as [number, number][][],
            ground.geometry.coordinates as [number, number][][][],
          );
          const area = parts.reduce(
            (sum, p) =>
              sum +
              p.reduce(
                (s, r, i) =>
                  s +
                  ((i ? -1 : 1) *
                    Math.abs(
                      r.reduce((a, q, j) => {
                        const b = r[(j + 1) % r.length];
                        return (
                          a +
                          (q[0] - origin[0]) * (b[1] - origin[1]) -
                          (b[0] - origin[0]) * (q[1] - origin[1])
                        );
                      }, 0),
                    )) /
                    2,
                0,
              ),
            0,
          );
          expect(area).toBeLessThan(1e-14); // Geographic round-trip rounding only.
        }
      }
      await page.screenshot({
        path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/unbc-floor-3-stairwell-mode-verified-${three ? "3d" : "2d"}-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    // The open well still supports a real native-flight click in 2D.
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await page.evaluate(
      ({ center, mobile }) =>
        (
          globalThis as unknown as { stairOcclusionMap: Map }
        ).stairOcclusionMap.jumpTo({
          center,
          zoom: 21.7,
          pitch: 0,
          bearing: 15,
          padding: mobile
            ? { top: 125, right: 10, bottom: 440, left: 10 }
            : { top: 0, right: 0, bottom: 0, left: 390 },
        }),
      { center, mobile },
    );
    const point = await page.evaluate((center) => {
      const m = (globalThis as unknown as { stairOcclusionMap: Map })
        .stairOcclusionMap;
      const p = m.project(center),
        r = m.getCanvas().getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top };
    }, center);
    await page.mouse.click(point.x, point.y);
    const inspector = page.getByRole("complementary", {
      name: "Source staircase",
      exact: true,
    });
    await expect(inspector).toContainText("Source staircase #1779495");
    await expect(inspector).toContainText("06-S205");
    expect(errors).toEqual([]);
  });
