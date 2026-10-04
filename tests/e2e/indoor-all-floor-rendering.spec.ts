import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { geographicPoint } from "../../app/indoor-project/routing";
import { roomDisplayColor } from "../../app/indoor-project/display-geometry";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { Map, GeoJSONSource, LngLatLike } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon } from "geojson";
type TestWindow = typeof globalThis & { floorAuditMap: Map };
type RenderCollection = FeatureCollection<
  MultiPolygon,
  { key: string; roomKeys?: string[]; height: number; circulation: boolean }
>;
const require = createRequire(import.meta.url),
  { PNG } = require(
    path.join(
      path.dirname(require.resolve("playwright-core")),
      "lib/utilsBundle.js",
    ),
  );
const zip = process.env.INDOOR_PROJECT_ZIP;
const area = (r: number[][]) =>
  Math.abs(
    r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length],
        o = r[0];
      return s + (p[0] - o[0]) * (q[1] - o[1]) - (q[0] - o[0]) * (p[1] - o[1]);
    }, 0) / 2,
  );
for (const mobile of [false, true])
  test(`all campus floors use stable visitor walls on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide a current viewer or master ZIP");
    test.setTimeout(300_000);
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const targets = data.floors.map((f) => ({
      floor: f,
      room: data.records
        .filter(
          (r) =>
            f.levelIds.includes(r.levelId) &&
            r.walkable &&
            !r.circulation &&
            !r.stair &&
            r.access !== "staff" &&
            roomDisplayColor(r, false) === "#f5f5f4" &&
            !data.visitor?.places[r.key]?.color &&
            data.presentation?.rooms.some((p) => p.roomKey === r.key),
        )
        .sort((a, b) => area(b.ringsFeet[0]) - area(a.ringsFeet[0]))[0],
    }));
    expect(targets.every((t) => t.room)).toBe(true);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached();
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
          (globalThis as TestWindow).floorAuditMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    for (const { floor, room } of targets) {
      await page
        .getByRole("textbox", { name: "Search indoor map", exact: true })
        .fill(room.number);
      await page
        .getByRole("button", {
          name: new RegExp(
            `^${room.number.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)} ·`,
          ),
        })
        .click();
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      await page
        .getByRole("button", { name: "All places", exact: true })
        .click();
      for (const mode of ["3D rooms", "3D relative heights"]) {
        await page.getByRole("button", { name: mode, exact: true }).click();
        await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
          timeout: 30_000,
        });
        const pts = room.ringsFeet.flat(),
          center = geographicPoint(data, [
            (Math.min(...pts.map((p) => p[0])) +
              Math.max(...pts.map((p) => p[0]))) /
              2,
            (Math.min(...pts.map((p) => p[1])) +
              Math.max(...pts.map((p) => p[1]))) /
              2,
          ]);
        for (const zoom of [20.5, 21.5, 22]) {
          await page.evaluate(
            ({ center, zoom, mobile }) =>
              (globalThis as TestWindow).floorAuditMap.jumpTo({
                center,
                zoom,
                pitch: 45,
                bearing: 25,
                padding: mobile
                  ? { left: 0, right: 0, top: 70, bottom: 100 }
                  : { left: 390, right: 0, top: 0, bottom: 0 },
              }),
            { center, zoom, mobile },
          );
          await expect
            .poll(() =>
              page.evaluate(() =>
                (globalThis as TestWindow).floorAuditMap.areTilesLoaded(),
              ),
            )
            .toBe(true);
          const proof = await page.evaluate(
            async ({ key }) => {
              const map = (globalThis as TestWindow).floorAuditMap,
                walls = (await (
                  map.getSource("project-exposed-walls") as GeoJSONSource
                ).getData()) as RenderCollection,
                blocks = (await (
                  map.getSource("project-room-blocks") as GeoJSONSource
                ).getData()) as RenderCollection;
              return {
                precision: !!map.getLayer("project-precision-walls"),
                old: map.getLayoutProperty("project-wall-boxes", "visibility"),
                walls: walls.features.length,
                oneShell: walls.features.every(
                  (f) => f.geometry.coordinates.length === 1,
                ),
                room: blocks.features.find((f) => f.properties.key === key),
              };
            },
            { key: room.key },
          );
          expect(proof.precision, `${floor.name} ${mode}`).toBe(true);
          expect(proof.old).toBe("none");
          expect(proof.walls).toBeGreaterThan(0);
          expect(proof.oneShell).toBe(true);
          expect(proof.room).toBeTruthy();
          const screenshot = await page.screenshot({
            path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/${floor.id}-${mode.replaceAll(" ", "-")}-${zoom}-${mobile ? "mobile" : "desktop"}.png`,
          });
          const points = proof.room!.geometry.coordinates.flat(2) as number[][],
            box = [
              Math.min(...points.map((p) => p[0])),
              Math.min(...points.map((p) => p[1])),
              Math.max(...points.map((p) => p[0])),
              Math.max(...points.map((p) => p[1])),
            ];
          const probes = [0.25, 0.75]
            .flatMap((x) =>
              [0.25, 0.75].map((y) => [
                box[0] + x * (box[2] - box[0]),
                box[1] + y * (box[3] - box[1]),
              ]),
            )
            .filter((p) =>
              booleanPointInPolygon(
                { type: "Point", coordinates: p },
                proof.room!.geometry,
              ),
            );
          const pixels = await page.evaluate(
              (ps) =>
                ps.map((p) => {
                  const q = (globalThis as TestWindow).floorAuditMap.project(
                    p as LngLatLike,
                  );
                  return [Math.round(q.x), Math.round(q.y)];
                }),
              probes,
            ),
            png = PNG.sync.read(screenshot);
          let checked = 0;
          for (const [x, y] of pixels) {
            if (
              x < (mobile ? 10 : 400) ||
              x >= png.width - 20 ||
              y < 110 ||
              y >= png.height - 120
            )
              continue;
            const rgb = png.data.subarray(
              (y * png.width + x) * 4,
              (y * png.width + x) * 4 + 3,
            );
            expect(
              Math.min(...rgb),
              `${floor.name}, ${room.number}, ${mode}, zoom ${zoom}, roof pixel ${x},${y}`,
            ).toBeGreaterThan(230);
            checked++;
          }
          // Large campus rooms may be mostly outside a close mobile camera. The
          // desktop view must independently exercise interior pixel probes.
          if (!mobile && zoom === 20.5)
            expect(checked, `${floor.name} roof probes`).toBeGreaterThan(0);
        }
      }
    }
    expect(errors).toEqual([]);
  });
