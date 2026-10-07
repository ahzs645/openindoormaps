import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { readIndoorProject } from "../../app/indoor-project/package";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
type W = typeof globalThis & { doorwayMap: Map };
for (const mobile of [false, true])
  test(`measured doorway display toggle and metadata on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide UNBC master ZIP");
    test.setTimeout(240000);
    const p = await readIndoorProject(readFileSync(zip!));
    const room = p.dataset.records.find((r) => r.number === "10-2036")!;
    const door = p.dataset.doors!.find((d) => d.nativeElementId === 2200058)!;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
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
        if (args[0] === "project-areas") (globalThis as W).doorwayMap = this;
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
      .fill(room.number);
    await page
      .getByRole("button", {
        name: `${room.number} · ${room.name} · #${room.levelId}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Map preferences", exact: true })
      .click();
    const toggle = page.getByRole("checkbox", {
      name: "Show doorway recesses",
      exact: true,
    });
    await expect(toggle).not.toBeChecked();
    mkdirSync("work/doorway-mask-review/browser", { recursive: true });
    for (const mode of ["2D rooms", "3D rooms", "3D relative heights"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      for (const open of [false, true, false]) {
        await toggle.setChecked(open);
        await expect(page.getByTestId("floor-preparation")).toBeHidden({
          timeout: 90000,
        });
        await expect
          .poll(
            () =>
              page.evaluate(
                async ({ key, open }) => {
                  const map = (globalThis as W).doorwayMap;
                  const source = map?.getSource(
                    "project-room-blocks",
                  ) as GeoJSONSource;
                  if (!source) return false;
                  const data = (await source.getData()) as FeatureCollection;
                  const f = data.features.find(
                    (f) => f.properties?.key === key,
                  );
                  return (
                    !!f &&
                    Number(f.properties?.height) >
                      Number(f.properties?.base ?? 0) &&
                    (open
                      ? f.properties?.measuredDoorwayFills?.length === 0
                      : f.properties?.measuredDoorwayFills?.some(
                          (c: { nativeDoorId: number }) =>
                            c.nativeDoorId === 2200058,
                        ))
                  );
                },
                { key: room.key, open },
              ),
            { timeout: 90000 },
          )
          .toBe(true);
        await page.evaluate(
          ({ center, mobile, mode }) =>
            (globalThis as W).doorwayMap.jumpTo({
              center,
              zoom: mobile ? 23.1 : 23.2,
              bearing: 0,
              pitch: mode === "2D rooms" ? 0 : 45,
            }),
          { center: geographicPoint(p.dataset, [93, 866]), mobile, mode },
        );
        await expect
          .poll(
            () => page.evaluate(() => (globalThis as W).doorwayMap.loaded()),
            { timeout: 60000 },
          )
          .toBe(true);
        await page.screenshot({
          path: `work/doorway-mask-review/browser/${mobile ? "mobile" : "desktop"}-${mode.replaceAll(" ", "-")}-${open ? "recess" : "closed"}.png`,
          fullPage: true,
        });
      }
    }
    await page
      .getByRole("checkbox", { name: "Show door locations", exact: true })
      .check();
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.stringify(
            (globalThis as W).doorwayMap.getFilter("project-portal-circle"),
          ),
        ),
      )
      .toContain("door");
    await page.evaluate(
      ({ point }) =>
        (globalThis as W).doorwayMap.jumpTo({
          center: point,
          zoom: 23,
          pitch: 0,
        }),
      { point: geographicPoint(p.dataset, door.pointFeet) },
    );
    await expect
      .poll(() =>
        page.evaluate(
          async ({ id }) => {
            const map = (globalThis as W).doorwayMap;
            const source = map.getSource("project-portals") as GeoJSONSource;
            const d = (await source.getData()) as FeatureCollection;
            return d.features.some(
              (f) => f.properties?.id === id && f.properties?.kind === "door",
            );
          },
          { id: door.id },
        ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
