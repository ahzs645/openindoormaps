import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { readIndoorProject } from "../../app/indoor-project/package";
import type { Map, GeoJSONSource } from "maplibre-gl";
const input = process.env.INDOOR_PROJECT_ZIP;
const output =
  process.env.NATIVE_WALKWAY_SCREENSHOT_DIR ??
  "work/native-walkway-20261004/browser";
type W = typeof globalThis & { easyApplyMap: Map };
for (const mobile of [false, true])
  test(`Full native walkway investigation on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!input, "Provide regenerated candidate master");
    test.setTimeout(600000);
    const project = await readIndoorProject(readFileSync(input!));
    expect(project.dataset.windowDisplay?.mode).toBe("native");
    expect(project.dataset.boundaryPatchState?.regenerated).toBe(true);
    const patch = project.rooms.nativeBoundaryPatches!.patches.find(
      (p) =>
        p.levelId === 402367 &&
        p.wallEvidence.some((w) => w.nativeElementId === 1069165),
    )!;
    expect(patch.status).toBe("applied");
    expect(
      project.dataset.walls.some((w) => w.reviewPatchId === patch.id),
    ).toBe(true);
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
        .find((r) => r.includes("/deps/maplibre-gl.js"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas") (globalThis as W).easyApplyMap = this;
        return add.apply(this, args);
      };
    });
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import project ZIP", exact: true })
      .click();
    await (await chooser).setFiles(input!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 90000,
    });
    await page
      .getByRole("button", { name: "Room review", exact: true })
      .click();
    await expect(page.getByLabel("Window detail", { exact: true })).toHaveValue(
      "native",
    );
    await expect(page.getByTestId("enclosure-counts")).toBeVisible({
      timeout: 300000,
    });
    mkdirSync(output, { recursive: true });
    writeFileSync(
      `${output}/${mobile ? "mobile" : "desktop"}-coverage.txt`,
      await page.getByTestId("enclosure-counts").innerText(),
    );
    await page.getByRole("button", { name: /^View proposals/ }).click();
    await expect(
      page.getByRole("button", { name: "Geometry finding", exact: true }),
    ).toContainText("Proposed solutions");
    await expect(
      page.getByRole("button", { name: "Review 03-S303 · Stair", exact: true }),
    ).toBeVisible();
    const detail = page.getByRole("region", {
      name: "Selected enclosure evidence",
      exact: true,
    });
    async function select(number: string) {
      await page
        .getByRole("button", { name: "Geometry finding", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: "All places", exact: true })
        .click();
      await page
        .getByLabel("Find room enclosure", { exact: true })
        .fill(number);
      await page
        .getByRole("button", { name: `Review ${number} · Office`, exact: true })
        .click();
      await expect(detail).toContainText("Room block present");
      await expect(detail).toContainText("1 / 1");
    }
    async function capture(name: string) {
      await expect(page.getByTestId("floor-preparation")).toBeHidden({
        timeout: 90000,
      });
      await page.locator(".maplibregl-canvas").scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.evaluate(() => (globalThis as W).easyApplyMap?.loaded()),
        )
        .toBe(true);
      mkdirSync(output, { recursive: true });
      await page.screenshot({
        path: `${output}/${mobile ? "mobile" : "desktop"}-${name}.png`,
      });
    }
    for (const number of ["03-S203", "03-S303"]) {
      await page.getByRole("button", { name: /^View proposals/ }).click();
      await page
        .getByRole("button", { name: `Review ${number} · Stair`, exact: true })
        .click();
      await detail.getByRole("button", { name: "2D", exact: true }).click();
      await detail
        .getByRole("button", { name: "Preview proposed walkway", exact: true })
        .click();
      await expect(detail).toContainText("Full native boundary traced", {
        timeout: 120000,
      });
      await expect(detail).toContainText("Amber shows the connected area");
      await expect(detail).toContainText(
        "The old outline identifies the seed only",
      );
      const preview = project.rooms.enclosureProposals!.records.find(
        (p) =>
          project.dataset.records.find((r) => r.key === p.key)?.number ===
          number,
      )!.displayPreview!;
      expect(preview.kind).toBe("native-enclosure-walkway");
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const s = (globalThis as W).easyApplyMap?.getSource(
              "boundary-proposal-preview",
            ) as GeoJSONSource | undefined;
            return s ? JSON.stringify(await s.getData()) : "";
          }),
        )
        .toContain("investigation");
      const rendered = await page.evaluate(async () =>
        (
          (globalThis as W).easyApplyMap.getSource(
            "boundary-proposal-preview",
          ) as GeoJSONSource
        ).getData(),
      );
      writeFileSync(
        `${output}/${mobile ? "mobile" : "desktop"}-${number}-geometry.json`,
        JSON.stringify(rendered),
      );
      expect(JSON.stringify(rendered)).not.toContain('"kind":"walkway"');
      await capture(`${number}-full-native-2d`);
      const extent = await page.evaluate(async () => {
        const map = (globalThis as W).easyApplyMap;
        const collection = (await (
          map.getSource("boundary-proposal-preview") as GeoJSONSource
        ).getData()) as import("geojson").FeatureCollection<
          import("geojson").Polygon
        >;
        const points = collection.features
          .flatMap((f) => f.geometry.coordinates[0])
          .map((p) => map.project(p as [number, number]));
        return {
          x0: Math.min(...points.map((p) => p.x)),
          x1: Math.max(...points.map((p) => p.x)),
          y0: Math.min(...points.map((p) => p.y)),
          y1: Math.max(...points.map((p) => p.y)),
          width: map.getContainer().clientWidth,
          height: map.getContainer().clientHeight,
        };
      });
      writeFileSync(
        `${output}/${mobile ? "mobile" : "desktop"}-${number}-camera.json`,
        JSON.stringify(extent),
      );
      expect(extent.x0).toBeGreaterThanOrEqual(0);
      expect(extent.y0).toBeGreaterThanOrEqual(0);
      expect(extent.x1).toBeLessThanOrEqual(extent.width);
      expect(extent.y1).toBeLessThanOrEqual(extent.height);
      await detail.getByRole("button", { name: "3D", exact: true }).click();
      await capture(`${number}-full-native-3d`);
      await detail
        .getByRole("button", { name: "Native heights", exact: true })
        .click();
      await capture(`${number}-full-native-heights`);
      await detail
        .getByRole("button", { name: "Show original walkway", exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (globalThis as W).easyApplyMap.getSource(
                "boundary-proposal-preview",
              ) === undefined,
          ),
        )
        .toBe(true);
      await detail.getByRole("button", { name: "2D", exact: true }).click();
    }
    expect(errors).toEqual([]);
  });
