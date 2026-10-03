import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";

const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;

for (const mobile of [false, true]) {
  test(`native room evidence displays and remains selectable on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!data, "Set INDOOR_PROJECT_ZIP to the regenerated UNBC ZIP.");
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
          (globalThis as unknown as { evidenceMap: Map }).evidenceMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    const numbers = mobile
      ? ["10-1040", "05-255"]
      : ["10-1040", "05-308", "04-429", "04-422", "05-255"];
    for (const number of numbers) {
      const record = data!.records.find((r) => r.number === number)!;
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
      await page.getByLabel("Find project area", { exact: true }).fill(number);
      await page
        .getByRole("button", {
          name: `${number} · ${record.name} · #${record.levelId}`,
          exact: true,
        })
        .click();
      if (number !== "10-1040")
        await expect(
          page.getByText(
            "Native 3D wall section · display only; original navigation interior",
            { exact: true },
          ),
        ).toBeVisible();
      await page
        .getByRole("button", { name: "Explore map", exact: true })
        .click();
      if (number === "10-1040") {
        await page
          .getByRole("button", { name: "Map preferences", exact: true })
          .click();
        await expect(
          page.getByLabel("Simplify map geometry", { exact: true }),
        ).not.toBeChecked();
        await page
          .getByRole("button", { name: "Map preferences", exact: true })
          .click();
      }
      await expect(
        page.getByRole("heading", { name: record.name, exact: true }),
      ).toBeVisible();
      for (const view of ["2D rooms", "3D rooms", "3D relative heights"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        await expect
          .poll(
            () =>
              page.evaluate(
                async ({ key, unresolved }) => {
                  const map = (globalThis as unknown as { evidenceMap: Map })
                    .evidenceMap;
                  if (
                    !map?.getSource("project-room-blocks") ||
                    !map.getSource("project-selection-areas")
                  )
                    return false;
                  const source = async (id: string) =>
                    (await (
                      map.getSource(id) as GeoJSONSource
                    ).getData()) as FeatureCollection;
                  const [blocks, selection, ground, walls] = await Promise.all(
                    [
                      "project-room-blocks",
                      "project-selection-areas",
                      "project-areas",
                      "project-exposed-walls",
                    ].map(source),
                  );
                  const block = blocks.features.find(
                    (f) => f.properties?.key === key,
                  );
                  return (
                    selection.features.some((f) => f.properties?.key === key) &&
                    (unresolved
                      ? block?.properties?.boundarySource ===
                          "assumed-native-wall-enclosure" &&
                        ground.features.some(
                          (f) => f.properties?.nativeFloorId === 1_501_009,
                        ) &&
                        !ground.features.some(
                          (f) => f.properties?.key === key,
                        ) &&
                        walls.features.length > 0
                      : block?.properties?.boundarySource ===
                        "prepared-native-mesh-walls")
                  );
                },
                { key: record.key, unresolved: number === "10-1040" },
              ),
            { timeout: 30_000 },
          )
          .toBe(true);
        if (number === "10-1040") {
          const highlight =
            view === "2D rooms" ? "project-block-fill" : "project-room-boxes";
          await expect
            .poll(() =>
              page.evaluate(
                ({ key, highlight }) => {
                  const map = (globalThis as unknown as { evidenceMap: Map })
                    .evidenceMap;
                  return (
                    map.getLayoutProperty(highlight, "visibility") ===
                      "visible" &&
                    map
                      .queryRenderedFeatures({ layers: [highlight] })
                      .some((f) => f.properties?.key === key)
                  );
                },
                { key: record.key, highlight },
              ),
            )
            .toBe(true);
          expect(
            JSON.stringify(
              await page.evaluate((highlight) => {
                const map = (globalThis as unknown as { evidenceMap: Map })
                  .evidenceMap;
                return map.getPaintProperty(
                  highlight,
                  highlight === "project-room-boxes"
                    ? "fill-extrusion-color"
                    : "fill-color",
                );
              }, highlight),
            ),
          ).toContain("#ffe09d");
          await page.screenshot({
            path: `${process.env.INDOOR_SCREENSHOT_DIR}/office-selected-${view.replaceAll(" ", "-").toLowerCase()}-${mobile ? "mobile" : "desktop"}.png`,
          });
        }
      }
      if (number === "10-1040") {
        const corners = [
          [74, 780.6],
          [77, 779],
          [77, 800.25],
        ].map((p) => geographicPoint(data!, p as [number, number]));
        // These corners were outside the coarse source outline, leaving blue
        // wedges against the native walls. Check the actual rendered sources.
        expect(
          await page.evaluate(
            async ({ key, corners }) => {
              const map = (globalThis as unknown as { evidenceMap: Map })
                .evidenceMap;
              const source = async (id: string) =>
                (await (
                  map.getSource(id) as GeoJSONSource
                ).getData()) as FeatureCollection<GeoJSON.MultiPolygon>;
              const [ground, selection] = await Promise.all([
                source("project-areas"),
                source("project-selection-areas"),
              ]);
              const inRing = (p: number[], ring: number[][]) => {
                let yes = false;
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                  const a = ring[i],
                    b = ring[j];
                  if (
                    a[1] > p[1] !== b[1] > p[1] &&
                    p[0] <
                      ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
                  )
                    yes = !yes;
                }
                return yes;
              };
              const contains = (
                f: GeoJSON.Feature<GeoJSON.MultiPolygon>,
                p: number[],
              ) =>
                f.geometry.coordinates.some(
                  (rings) =>
                    inRing(p, rings[0]) &&
                    !rings.slice(1).some((r) => inRing(p, r)),
                );
              const room = selection.features.find(
                (f) => f.properties?.key === key,
              )!;
              return (
                room.properties?.floorMaskSource ===
                  "assumed-native-wall-enclosure" &&
                corners.every(
                  (p) =>
                    contains(room, p) &&
                    !ground.features.some(
                      (f) =>
                        f.properties?.circulation === true &&
                        f.properties?.access !== "staff" &&
                        contains(f, p),
                    ),
                )
              );
            },
            { key: record.key, corners },
          ),
        ).toBe(true);
        await page
          .getByRole("button", { name: "2D rooms", exact: true })
          .click();
        await page.screenshot({
          path: `${process.env.INDOOR_SCREENSHOT_DIR}/office-wall-faces-2d-${mobile ? "mobile" : "desktop"}.png`,
        });
        // Actual canvas hit testing must select the new display volume.
        await page
          .getByRole("button", { name: "3D rooms", exact: true })
          .click();
        await page
          .getByRole("button", { name: "All places", exact: true })
          .click();
        await expect
          .poll(() =>
            page.evaluate(() => {
              const map = (globalThis as unknown as { evidenceMap: Map })
                .evidenceMap;
              return JSON.stringify(
                map.getPaintProperty(
                  "project-room-boxes",
                  "fill-extrusion-color",
                ),
              ).includes("rm-1487816-92f4725b53ff");
            }),
          )
          .toBe(false);
        if (mobile) {
          // Put the newly filled corner above the mobile discovery sheet before
          // testing a real tap. Do not force clicks through the sheet.
          await page.mouse.move(70, 350);
          await page.mouse.down();
          await page.mouse.move(70, 180, { steps: 10 });
          await page.mouse.up();
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  !(
                    globalThis as unknown as { evidenceMap: Map }
                  ).evidenceMap.isMoving(),
              ),
            )
            .toBe(true);
        }
        const point = await page.evaluate((corner) => {
          const map = (globalThis as unknown as { evidenceMap: Map })
            .evidenceMap;
          const pixel = map.project(corner as [number, number]);
          return { x: pixel.x, y: pixel.y };
        }, corners[0]);
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        const canvas = page.locator(".maplibregl-canvas");
        await canvas.click({ position: point, timeout: 10_000 });
        await expect(
          page.getByRole("heading", { name: "Office", exact: true }),
        ).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              (key) =>
                (globalThis as unknown as { evidenceMap: Map }).evidenceMap
                  .queryRenderedFeatures({
                    layers: ["project-room-boxes"],
                  })
                  .some((f) => f.properties?.key === key),
              record.key,
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: `${process.env.INDOOR_SCREENSHOT_DIR}/office-native-walls-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
    }
    const hallway = data!.records.find((r) => r.number === "10-1021");
    if (hallway?.circulation) {
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
      await page
        .getByLabel("Find project area", { exact: true })
        .fill("10-1021");
      await page
        .getByRole("button", {
          name: `10-1021 · ${hallway.name} · #${hallway.levelId}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByText(
          "Native floor and wall circulation boundary · navigation regenerated",
          { exact: true },
        ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Explore map", exact: true })
        .click();
      await page.getByRole("button", { name: "3D rooms", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Search indoor map", exact: true })
        .fill("10-1021");
      await expect(
        page.getByText("No matching places.", { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(async (key) => {
            const map = (globalThis as unknown as { evidenceMap: Map })
              .evidenceMap;
            const blocks = (await (
              map.getSource("project-room-blocks") as GeoJSONSource
            ).getData()) as FeatureCollection;
            const areas = (await (
              map.getSource("project-areas") as GeoJSONSource
            ).getData()) as FeatureCollection;
            return (
              !blocks.features.some((f) => f.properties?.key === key) &&
              areas.features.some(
                (f) =>
                  f.properties?.nativeCellId &&
                  f.properties?.circulation &&
                  f.properties?.roomKeys?.includes(key),
              )
            );
          }, hallway.key),
        )
        .toBe(true);
      await page.screenshot({
        path: `${process.env.INDOOR_SCREENSHOT_DIR}/hallway-10-1021-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    for (const number of ["10-1096", "10-1046"]) {
      const record = data!.records.find((r) => r.number === number)!;
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
      await page.getByLabel("Find project area", { exact: true }).fill(number);
      await page
        .getByRole("button", {
          name: `${number} · ${record.name} · #${record.levelId}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Explore map", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: record.name, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Entrance needs review before directions are available.",
          { exact: true },
        ),
      ).not.toBeVisible();
      for (const view of ["2D rooms", "3D rooms", "3D relative heights"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        await expect
          .poll(
            () =>
              page.evaluate(async (key) => {
                const map = (globalThis as unknown as { evidenceMap: Map })
                  .evidenceMap;
                const blocks = (await (
                  map.getSource("project-room-blocks") as GeoJSONSource
                ).getData()) as FeatureCollection;
                const block = blocks.features.find(
                  (f) => f.properties?.key === key,
                );
                return (
                  !!block &&
                  Math.abs(
                    Number(block.properties?.height) -
                      Number(block.properties?.base ?? 0) -
                      0.6,
                  ) < 0.0001
                );
              }, record.key),
            { timeout: 30_000 },
          )
          .toBe(true);
      }
      await page.screenshot({
        path: `${process.env.INDOOR_SCREENSHOT_DIR}/${number}-native-room-${mobile ? "mobile" : "desktop"}.png`,
      });
    }
    expect(
      data!.records
        .filter((r) => ["10-1042", "10-1046"].includes(r.number))
        .map((r) => [r.number, r.name]),
    ).toEqual([["10-1046", "Kitchen"]]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
