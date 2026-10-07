import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
import { readIndoorProject } from "../../app/indoor-project/package";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
const roomNumber = process.env.WINDOW_COMPARE_ROOM ?? "10-2036";
const screenshotRoot =
  process.env.WINDOW_SCREENSHOT_DIR ?? "work/window-export-comparison/browser";
type W = typeof globalThis & { windowReviewMap: Map };
for (const mobile of [false, true])
  test(`native window preview and both export choices on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide enriched master ZIP");
    test.setTimeout(300000);
    const input = await readIndoorProject(readFileSync(zip!));
    const targetRoom = input.dataset.records.find(
      (r) => r.number === roomNumber,
    )!;
    expect(targetRoom).toBeTruthy();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    page.setDefaultTimeout(30000);
    // Isolate native rendering from remote basemap/network availability.
    await page.route("https://tiles.openfreemap.org/**", async (route) => {
      if (route.request().url().includes("/styles/"))
        await route.fulfill({
          json: {
            version: 8,
            glyphs:
              "https://tiles.openfreemap.org/test-glyphs/{fontstack}/{range}.pbf",
            sources: {},
            layers: [
              {
                id: "background",
                type: "background",
                paint: { "background-color": "#f7f5f0" },
              },
            ],
          },
        });
      else
        await route.fulfill({
          body: Buffer.alloc(0),
          contentType: "application/x-protobuf",
        });
    });
    await page.goto("/openindoormaps/#/projects/indoor");
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .some((r) => r.name.includes("/deps/maplibre-gl.js")),
        ),
      )
      .toBe(true);
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as W).windowReviewMap = this;
        return add.apply(this, args);
      };
    });
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import project ZIP", exact: true })
      .click();
    await (await chooser).setFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 90000,
    });
    if (
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
    await page
      .getByLabel("Find project area", { exact: true })
      .fill(roomNumber);
    await page
      .getByRole("button", {
        name: `${roomNumber} · ${targetRoom.name} · #${targetRoom.levelId}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    if (roomNumber === "03-3025") {
      await page
        .getByRole("button", { name: "Map preferences", exact: true })
        .click();
      await page
        .getByLabel("Show unmapped structures", { exact: true })
        .check();
      await page
        .getByRole("button", { name: "Map preferences", exact: true })
        .click();
    }
    mkdirSync(screenshotRoot, { recursive: true });
    for (const view of ["2D rooms", "3D rooms", "3D relative heights"]) {
      await page.getByRole("button", { name: view, exact: true }).click();
      for (const mode of ["simplified", "native"] as const) {
        await page
          .getByRole("button", { name: "Map preferences", exact: true })
          .click();
        await page
          .getByLabel("Preview window detail", { exact: true })
          .selectOption(mode);
        await page
          .getByRole("button", { name: "Map preferences", exact: true })
          .click();
        await expect(page.getByTestId("floor-preparation")).toBeHidden({
          timeout: 90000,
        });
        await expect
          .poll(
            () =>
              page.evaluate(async () => {
                const map = (globalThis as W).windowReviewMap,
                  s = map?.getSource("project-native-windows") as GeoJSONSource;
                if (!s) return -1;
                const data = (await s.getData()) as { features: unknown[] };
                return data.features.length;
              }),
            { timeout: 90000 },
          )
          .toBe(
            mode === "native"
              ? input.dataset.windowDisplay!.elements.filter(
                  (e) => e.levelId === targetRoom.levelId,
                ).length
              : 0,
          );
        const room = targetRoom;
        const points = room.ringsFeet[0];
        const center = geographicPoint(input.dataset, [
          points.reduce((n, p) => n + p[0], 0) / points.length,
          points.reduce((n, p) => n + p[1], 0) / points.length,
        ]);
        await page.evaluate(
          ({ center, mobile, view }) =>
            (globalThis as W).windowReviewMap.jumpTo({
              center,
              zoom: mobile ? 22.1 : 22.5,
              pitch: view === "2D rooms" ? 0 : 45,
              bearing: 0,
            }),
          { center, mobile, view },
        );
        await expect
          .poll(() =>
            page.evaluate(
              () => !!(globalThis as W).windowReviewMap?.isStyleLoaded(),
            ),
          )
          .toBe(true);
        if (roomNumber === "03-3025") {
          // Within the broad curtain-host box, outside the actual facade and
          // exact glazing. The simplified comparison retains the old envelope.
          const probe = geographicPoint(input.dataset, [95.7, -181.5]);
          const containsProbe = await page.evaluate(
            async ({ probe }) => {
              const map = (globalThis as W).windowReviewMap;
              const source = map.getSource(
                "project-exposed-walls",
              ) as GeoJSONSource;
              const data = (await source.getData()) as {
                features: { geometry: { coordinates: number[][][][] } }[];
              };
              const inRing = (ring: number[][]) => {
                let inside = false;
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                  const a = ring[i],
                    b = ring[j];
                  if (
                    a[1] > probe[1] !== b[1] > probe[1] &&
                    probe[0] <
                      ((b[0] - a[0]) * (probe[1] - a[1])) / (b[1] - a[1]) + a[0]
                  )
                    inside = !inside;
                }
                return inside;
              };
              return data.features.some((f) =>
                f.geometry.coordinates.some(
                  (p) => inRing(p[0]) && !p.slice(1).some(inRing),
                ),
              );
            },
            { probe },
          );
          expect(containsProbe, `${view} ${mode}: host margin comparison`).toBe(
            mode === "simplified",
          );
        }
        await page.locator(".project-map").screenshot({
          path: `${screenshotRoot}/${mobile ? "mobile" : "desktop"}-${view.replaceAll(" ", "-")}-${mode}.png`,
        });
        if (mode === "native" && view !== "2D rooms")
          expect(
            await page.evaluate(
              () =>
                !!(globalThis as W).windowReviewMap.getLayer(
                  "project-native-window-glass",
                ),
            ),
          ).toBe(true);
      }
    }
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    for (const windows of (process.env.WINDOW_SKIP_EXPORTS
      ? []
      : ["native", "simplified"]) as ("native" | "simplified")[]) {
      await page
        .getByLabel("Window detail", { exact: true })
        .selectOption(windows);
      await page
        .getByRole("button", { name: "Export campus viewer", exact: true })
        .click();
      await expect(page.locator(".project-status")).toContainText(
        "Campus viewer ready",
        { timeout: 90000 },
      );
      const download = page.waitForEvent("download");
      await page
        .getByRole("link", { name: "Download campus viewer ZIP", exact: true })
        .click();
      const file = await download;
      expect(file.suggestedFilename()).toContain(`windows-${windows}`);
      const path = await file.path();
      const p = await readIndoorProject(readFileSync(path!));
      expect(p.dataset.windowDisplay?.mode).toBe(
        windows === "native" ? "native" : undefined,
      );
      for (const key of [
        "records",
        "walls",
        "nodes",
        "edges",
        "doors",
        "alignment",
      ] as const)
        expect(p.dataset[key]).toEqual(input.dataset[key]);
    }
    expect(errors).toEqual([]);
  });
