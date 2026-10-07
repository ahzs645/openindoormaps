import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { readIndoorProject } from "../../app/indoor-project/package";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
type W = typeof globalThis & { officePatchMap: Map };
for (const mobile of [false, true])
  test(`UNBC separate office boundaries and original-model patch overlay on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the patched UNBC candidate");
    test.setTimeout(240000);
    const p = await readIndoorProject(readFileSync(zip!)),
      errors: string[] = [];
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
        if (args[0] === "project-areas")
          (globalThis as W).officePatchMap = this;
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
      .getByRole("button", { name: "Native areas", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Native area decisions" });
    await panel
      .getByRole("button", { name: "Native area floor", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", {
        name: "Floor 2 · #694 · 14.44 ft",
        exact: true,
      })
      .click();
    await expect(panel).toContainText("native regions", { timeout: 90000 });
    for (const number of ["10-2030", "10-2036", "10-2038"]) {
      await panel
        .getByLabel("Find native region", { exact: true })
        .fill(number);
      const row = panel.locator(".native-area-region-list button");
      await expect(row).toHaveCount(1);
      await expect(row).toContainText("1 place labels");
      await row.click();
      await expect(panel).toContainText("1 selected regions");
    }
    const dir = "work/office-patch-investigation/browser";
    mkdirSync(dir, { recursive: true });
    await panel
      .getByRole("heading", { name: "Repair or trim this floor", exact: true })
      .scrollIntoViewIfNeeded();
    const center = geographicPoint(p.dataset, [93, 866]);
    await page.evaluate(
      ({ center, mobile }) =>
        (globalThis as W).officePatchMap.jumpTo({
          center,
          zoom: mobile ? 22.3 : 22.6,
          bearing: 0,
          pitch: 0,
        }),
      { center, mobile },
    );
    await page.screenshot({
      path: `${dir}/office-selection-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Close native areas", exact: true })
      .click();
    // Check regenerated visitor blocks and first-click selection, not just the
    // review trace. The original scene overlay cannot prove a raised enclosure.
    if (p.dataset.presentation?.rooms.length) {
      await page.getByLabel("Find project area", { exact: true }).fill("10-2036");
      const room = p.dataset.records.find(r => r.number === "10-2036")!;
      await page.getByRole("button", {
        name: `10-2036 · ${room.name} · #${room.levelId}`, exact: true,
      }).click();
      await page.getByRole("button", { name: "Explore map", exact: true }).click();
      for (const mode of ["2D rooms", "3D rooms", "3D relative heights"]) {
        await page.getByRole("button", { name: mode, exact: true }).click();
        await expect(page.getByTestId("floor-preparation")).toBeHidden({timeout: 90000});
        await expect.poll(() => page.evaluate(async ({keys, selected, mode}) => {
          const map = (globalThis as W).officePatchMap;
          const source = map.getSource("project-room-blocks") as GeoJSONSource;
          if (!source) return false;
          const data = await source.getData() as FeatureCollection;
          const layer = mode === "2D rooms" ? "project-block-fill" : "project-room-boxes";
          // Selection is a paint expression so cached geometry need not be
          // uploaded again when only the selected identity changes.
          const color = JSON.stringify(map.getPaintProperty(layer, mode === "2D rooms" ? "fill-color" : "fill-extrusion-color"));
          return keys.every(key => data.features.some(f => f.properties?.key === key && Number(f.properties?.height) > Number(f.properties?.base ?? 0)))
            && color.includes(selected) && color.includes("#ffe09d")
            && map.getLayoutProperty(layer, "visibility") !== "none";
        }, {keys: p.dataset.records.filter(r => r.levelId === 694 && ["10-2030","10-2036","10-2038"].includes(r.number)).map(r=>r.key), selected:room.key, mode}), {timeout:90000}).toBe(true);
        await page.evaluate(({center, mobile, mode}) => (globalThis as W).officePatchMap.jumpTo({center, zoom:mobile?22.2:22.7, bearing:0, pitch:mode==="2D rooms"?0:45}), {center, mobile, mode});
        await expect.poll(()=>page.evaluate(()=>(globalThis as W).officePatchMap.loaded()),{timeout:60000}).toBe(true);
        await page.screenshot({path:`${dir}/offices-${mode.replaceAll(" ","-")}-${mobile?"mobile":"desktop"}.png`,fullPage:true});
      }
    }
    const picker = page.getByLabel("Map floor", { exact: true });
    if (await page.getByRole("button", { name: "Review project", exact: true }).isVisible())
      await page.getByRole("button", { name: "Review project", exact: true }).click();
    if (await picker.isVisible())
      await picker.selectOption(
        p.dataset.floors.find((f) => f.levelIds.includes(694))!.id,
      );
    await page
      .getByRole("button", { name: "Source model", exact: true })
      .click();
    await expect(page.getByText(/1 reviewed patch footprints/)).toBeVisible({
      timeout: 90000,
    });
    await expect(
      page.getByRole("button", { name: "Show geometry patches", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(
      ({ center, mobile }) =>
        (globalThis as W).officePatchMap.jumpTo({
          center,
          zoom: mobile ? 22.9 : 23.3,
          bearing: 0,
          pitch: 45,
        }),
      { center: geographicPoint(p.dataset, [90, 864.3]), mobile },
    );
    await expect
      .poll(
        () => page.evaluate(() => (globalThis as W).officePatchMap.loaded()),
        { timeout: 60000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `${dir}/source-patch-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Show geometry patches", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Show geometry patches", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(/1 reviewed patch footprints/)).toHaveCount(0);
    await page.screenshot({
      path: `${dir}/source-original-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
