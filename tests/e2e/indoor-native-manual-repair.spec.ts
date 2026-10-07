import { test, expect, type Page } from "@playwright/test";
import type { Map } from "maplibre-gl";
import { mkdirSync, readFileSync } from "node:fs";
import { gapProject } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import { geographicPoint } from "../../app/indoor-project/routing";
import {
  deriveNativeAreas,
  pointInNativeArea,
} from "../../app/indoor-project/native-area-review";
import type { IndoorDataset } from "../../app/indoor-project/contract";
type W = typeof globalThis & { manualRepairMap: Map };
async function load(page: Page, mobile: boolean) {
  const p = await gapProject();
  await page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  );
  await page.goto("/openindoormaps/#/projects/indoor");
  await expect(
    page.getByRole("button", { name: "Import project ZIP", exact: true }),
  ).toBeVisible();
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
      if (args[0] === "native-area-regions")
        (globalThis as W).manualRepairMap = this;
      return add.apply(this, args);
    };
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import project ZIP", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "manual-repair.reviter.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(await exportIndoorProject(p)),
  });
  await expect(page.locator(".project-status")).toContainText("Loaded");
  if (
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
  await page.getByRole("button", { name: "Native areas", exact: true }).click();
  const panel = page.getByRole("region", { name: "Native area decisions" });
  await expect(panel).toContainText("1 native regions");
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as W).manualRepairMap?.loaded()),
    )
    .toBe(true);
  return { p, panel };
}
async function clickNative(
  page: Page,
  data: IndoorDataset,
  point: [number, number],
) {
  await page.locator(".maplibregl-canvas").scrollIntoViewIfNeeded();
  const geo = geographicPoint(data, point);
  const pixel = await page.evaluate((geo) => {
    const map = (globalThis as W).manualRepairMap;
    map.jumpTo({ center: geo, zoom: 22, pitch: 0, bearing: 0 });
    const p = map.project(geo),
      b = map.getCanvas().getBoundingClientRect();
    return { x: p.x + b.x, y: p.y + b.y };
  }, geo);
  await page.mouse.click(pixel.x, pixel.y);
}
async function reopened(page: Page) {
  await page
    .getByRole("button", { name: "Export reviewed project", exact: true })
    .click();
  const link = page.getByRole("link", { name: /Download reviewed/ });
  await expect(link).toBeVisible();
  const download = page.waitForEvent("download");
  await link.click();
  return readIndoorProject(
    new Uint8Array(readFileSync((await (await download).path())!)),
  );
}
for (const mobile of [false, true]) {
  test(`draw, preview and apply a missing native wall join on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { p, panel } = await load(page, mobile);
    await panel
      .getByRole("button", { name: "Draw wall gap patch", exact: true })
      .click();
    await clickNative(page, p.dataset, [15, 7.25]);
    await expect(panel).toContainText("1 of 2 points placed");
    await clickNative(page, p.dataset, [15, 12.75]);
    await expect(panel).toContainText("2 native regions");
    await expect(
      panel.getByRole("checkbox", { name: /Preview closure manual-gap:/ }),
    ).toBeChecked();
    await panel
      .getByRole("checkbox", { name: /Patch closure manual-gap:/ })
      .check();
    await panel
      .getByLabel("Boundary patch evidence", { exact: true })
      .fill(
        "User checked the actual missing join between native wall caps 200 and 201 in this synthetic fixture.",
      );
    await panel
      .getByRole("button", {
        name: "Apply checked boundary patches",
        exact: true,
      })
      .click();
    await expect(panel).toContainText("Boundary patches applied");
    await expect(panel).toContainText("2 native regions");
    await panel
      .getByRole("heading", { name: "Repair or trim this floor", exact: true })
      .scrollIntoViewIfNeeded();
    mkdirSync("work/native-manual-repair/browser", { recursive: true });
    await page.screenshot({
      path: `work/native-manual-repair/browser/manual-wall-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    const out = await reopened(page);
    expect(out.dataset.boundaryPatchState!.regenerated).toBe(false);
    expect(
      out.rooms.nativeBoundaryPatches!.patches[0].manualPointsFeet,
    ).toHaveLength(2);
    expect(out.dataset.walls.some((w) => w.reviewPatchId)).toBe(true);
    expect(out.dataset.walkingSupport).toEqual(p.dataset.walkingSupport);
    const modelEntry = Object.keys(p.files).find((key) => key.endsWith('.rvt'))!;
    expect(p.files[modelEntry].length).toBeGreaterThan(0);
    expect(out.files[modelEntry]).toEqual(p.files[modelEntry]);
    await panel
      .getByRole("button", { name: "Undo area edit", exact: true })
      .click();
    await expect(panel).toContainText("1 native regions");
    expect(errors).toEqual([]);
  });
  test(`draw only the outdoor portion and keep the indoor area selectable on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { p, panel } = await load(page, mobile);
    await panel
      .getByRole("button", { name: "Draw outdoor boundary", exact: true })
      .click();
    for (const point of [
      [0.1, 0.1],
      [12, 0.1],
      [12, 19.9],
      [0.1, 19.9],
    ] as [number, number][]) {
      await clickNative(page, p.dataset, point);
    }
    await expect(panel).toContainText("4 points placed");
    await panel
      .getByRole("button", { name: "Preview outdoor boundary", exact: true })
      .click();
    await expect(panel).toContainText(
      "User-drawn boundary clipped to native floor support",
    );
    await panel.locator(".native-area-region-list button").click();
    await panel
      .getByLabel("Native area label", { exact: true })
      .fill("Exterior portion");
    await panel
      .getByLabel("Native area evidence", { exact: true })
      .fill(
        "Synthetic source review: only the drawn west strip is outdoors, the east supported floor remains inside.",
      );
    await panel
      .getByRole("checkbox", { name: /I checked the full source model/ })
      .check();
    await panel
      .getByRole("button", {
        name: "Exclude outdoors from selection and routes",
        exact: true,
      })
      .click();
    await expect(
      panel.getByRole("button", { name: "Reset drawn boundary", exact: true }),
    ).toHaveCount(0);
    await expect(panel).toContainText("1 native regions");
    await panel
      .getByRole("heading", { name: "Repair or trim this floor", exact: true })
      .scrollIntoViewIfNeeded();
    mkdirSync("work/native-manual-repair/browser", { recursive: true });
    await page.screenshot({
      path: `work/native-manual-repair/browser/outdoor-trim-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    const out = await reopened(page),
      areas = await deriveNativeAreas(out.dataset, 1);
    expect(
      areas.regions.some((r) => pointInNativeArea([5, 5], r.ringsFeet)),
    ).toBe(false);
    expect(
      areas.regions.some((r) => pointInNativeArea([20, 5], r.ringsFeet)),
    ).toBe(true);
    expect(out.dataset.records).toEqual(p.dataset.records);
    expect(out.dataset.walkingSupport).toEqual(p.dataset.walkingSupport);
    expect(errors).toEqual([]);
  });
}
