import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Map as MapLibreMap } from "maplibre-gl";
import { generateFloorOpeningFixture } from "../fixtures/indoor-floor-opening";
import { readIndoorProject } from "../../app/indoor-project/package";

const base = process.env.PAGES_BASE_PATH ?? "/openindoormaps/";
type NavigationProbe = {
  documentToken: string;
  map?: MapLibreMap;
  firstMap?: MapLibreMap;
};
let zipPath = process.env.INDOOR_PROJECT_ZIP ?? "";
test.beforeAll(async () => {
  if (!zipPath) zipPath = (await generateFloorOpeningFixture()).path;
});

for (const mobile of [false, true]) {
  test(`Pages navigation releases the demo map and survives return and reload on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.emulateMedia({ colorScheme: "light" });
    // Exercise the real basemap layer without depending on remote tile service
    // availability. Empty vector tiles are sufficient for its lifecycle.
    await page.route("https://tiles.openfreemap.org/**", async (route) => {
      await (route.request().url().includes("/styles/")
        ? route.fulfill({
            json: {
              version: 8,
              glyphs:
                "https://tiles.openfreemap.org/test-glyphs/{fontstack}/{range}.pbf",
              sources: {
                openmaptiles: {
                  type: "vector",
                  tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
                  minzoom: 0,
                  maxzoom: 0,
                },
              },
              layers: [{ id: "background", type: "background" }],
            },
          })
        : route.fulfill({
            body: Buffer.alloc(0),
            contentType: "application/x-protobuf",
          }));
    });
    await page.goto(`${base}#/projects/indoor`);
    const workspace = page.getByRole("heading", {
      name: "Indoor project workspace",
    });
    await expect(workspace).toBeVisible();
    // The workspace loads MapLibre without importing a project. Observe the
    // production chunk's actual addLayer call before mounting the demo map.
    const token = await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => /\/assets\/maplibre-[^/]+\.js$/.test(name));
      if (!url) throw new Error("The Pages MapLibre chunk was not loaded.");
      type MapLibreExport = { Map?: typeof MapLibreMap };
      const exports = (await import(url)) as Record<
        string,
        MapLibreExport | (() => MapLibreExport)
      >;
      // Rolldown emits the CommonJS library as a lazy factory; other builds
      // expose its namespace directly. Both resolve the actual shared module.
      const lib = Object.values(exports)
        .map((value) => (typeof value === "function" ? value() : value))
        .find((value) => value?.Map?.prototype?.addLayer);
      if (!lib?.Map) throw new Error("The Pages MapLibre export is missing.");
      const probe: NavigationProbe = { documentToken: crypto.randomUUID() };
      (
        globalThis as unknown as { navigationProbe: NavigationProbe }
      ).navigationProbe = probe;
      const addLayer = lib.Map.prototype.addLayer;
      lib.Map.prototype.addLayer = function (
        this: MapLibreMap,
        ...args: Parameters<MapLibreMap["addLayer"]>
      ) {
        const result = addLayer.apply(this, args);
        if (args[0].id === "basemap-3d-buildings") {
          probe.map = this;
          probe.firstMap ??= this;
        }
        return result;
      };
      return probe.documentToken;
    });
    await page.getByRole("link", { name: "Venue maps", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "OpenIndoorMaps", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "UNBC IFC Import", exact: true })
      .click();
    const mapReady = async () => {
      await expect(page.getByTestId("map-canvas-root")).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const map = (
                globalThis as unknown as { navigationProbe: NavigationProbe }
              ).navigationProbe.map;
              return (
                !!map?.isStyleLoaded() && !!map.getLayer("basemap-3d-buildings")
              );
            }),
          { timeout: 30_000 },
        )
        .toBe(true);
    };
    await mapReady();
    // A hash change leaves the document alive and runs React's map cleanup;
    // a full page.goto would not reliably exercise that teardown ordering.
    await page.evaluate(() => {
      location.hash = "#/projects/indoor";
    });
    await expect(workspace).toBeVisible();
    await expect(page.getByTestId("map-canvas-root")).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const probe = (
          globalThis as unknown as { navigationProbe: NavigationProbe }
        ).navigationProbe;
        return {
          token: probe.documentToken,
          removed:
            (probe.firstMap as unknown as { style?: unknown }).style ===
            undefined,
        };
      }),
    ).toEqual({ token, removed: true });
    await page.goBack();
    await mapReady();
    expect(
      await page.evaluate(() => {
        const probe = (
          globalThis as unknown as { navigationProbe: NavigationProbe }
        ).navigationProbe;
        return {
          token: probe.documentToken,
          replaced: probe.map !== probe.firstMap,
        };
      }),
    ).toEqual({ token, replaced: true });
    await page.goForward();
    await expect(workspace).toBeVisible();
    await page.reload();
    await expect(workspace).toBeVisible();
    expect(page.url()).toContain("#/projects/indoor");
    await page.getByRole("link", { name: "Venue maps", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "OpenIndoorMaps", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test(`Pages supports ZIP import, floors, export and refresh on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    // A direct route and reload must work on a host without SPA rewrites.
    await page.goto(`${base}#/projects/indoor`);
    await expect(
      page.getByRole("heading", { name: "Indoor project workspace" }),
    ).toBeVisible();
    for (const asset of [
      "favicon.svg",
      "images/oim-ctrl-logo.svg",
      "revit/ahsz-preview.png",
      "images/vendor-reference-icons/stairs.png",
      "models/vendor-reference-models/new_escalator.glb",
    ]) {
      const response = await request.get(base + asset);
      expect(response.ok(), asset).toBe(true);
      expect(response.headers()["content-type"], asset).not.toContain(
        "text/html",
      );
    }
    await page.locator('input[type="file"]').setInputFiles(zipPath);
    await expect(page.locator('p.project-status[role="status"]')).toContainText(
      "Loaded",
      {
        timeout: 60_000,
      },
    );
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const floor = page.getByLabel("Map floor", { exact: true });
    await expect(floor).toBeVisible();
    expect(await floor.locator("option").count()).toBeGreaterThan(1);
    const options = await floor
      .locator("option")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLOptionElement).value),
      );
    await floor.selectOption(options[1]);
    await expect(floor).toHaveValue(options[1]);
    // This renderer fixture has saved arrivals but no doors or edges. Select
    // inside endpoints explicitly; the default hallway mode must refuse it.
    await page
      .getByRole("button", { name: "Route endpoints", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Inside room", exact: true })
      .click();
    // Exercise the bundled route worker on the static Pages host too.
    const departure = page.getByLabel("Route start", { exact: true });
    const arrival = page.getByLabel("Route destination", { exact: true });
    const roomKey = await departure
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await departure.selectOption(roomKey!);
    await arrival.selectOption(roomKey!);
    await expect(page.getByTestId("project-route-result")).toContainText(
      "0.0 m",
      { timeout: 30_000 },
    );

    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "2D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "3D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Export campus viewer", exact: true })
      .click();
    await expect(page.locator('p.project-status[role="status"]')).toContainText(
      "Campus viewer ready",
      { timeout: 60_000 },
    );
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download campus viewer ZIP", exact: true })
      .click();
    const file = await (await downloadEvent).path();
    expect(file).toBeTruthy();
    const viewer = await readIndoorProject(
      new Uint8Array(await readFile(file!)),
    );
    expect(viewer.manifest.format).toBe("openindoormaps-viewer");
    await page.reload();
    await expect(page.locator('p.project-status[role="status"]')).toContainText(
      "Loaded",
      {
        timeout: 60_000,
      },
    );
    expect(page.url()).toContain("#/projects/indoor");
    expect(errors).toEqual([]);
  });
}
