import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { gapProject } from "../fixtures/native-area-project";
import type { Map } from "maplibre-gl";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";

for (const mobile of [false, true]) {
  test(`native review pins retain selection and floor on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const project = await gapProject();
    project.dataset.nativeLevels.push({
      id: 2,
      name: "Floor 2",
      elevationFeet: 10,
    });
    project.dataset.floors[0].levelIds.push(2);
    project.dataset.walkingSupport!.floors.push({
      ...structuredClone(project.dataset.walkingSupport!.floors[0]),
      nativeElementId: 101,
      elevationFeet: 10,
    });
    const geometry = (p: typeof project) =>
      JSON.stringify({
        ...p.dataset,
        source: { ...p.dataset.source, roomsSha256: undefined },
      });
    const original = geometry(project);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/openindoormaps/#/projects/indoor");
    await expect(
      page.getByRole("button", { name: "Import project ZIP", exact: true }),
    ).toBeVisible();
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
        (globalThis as unknown as { nativePinMap: Map }).nativePinMap = this;
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
      name: "pins.reviter.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await exportIndoorProject(project)),
    });
    await expect(page.locator(".project-status")).toContainText("Loaded");
    await page
      .getByRole("button", { name: "Native areas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Native area floor", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", {
        name: "Floor 2 · #2 · 10.00 ft",
        exact: true,
      })
      .click();
    const panel = page.getByRole("region", { name: "Native area decisions" });
    await expect(panel).toContainText("1 native regions");
    await panel.locator(".native-area-region-list button").click();
    await expect(panel).toContainText("1 selected regions");
    await expect(page.getByTestId("floor-preparation")).toBeHidden({
      timeout: 60000,
    });
    await page.getByRole("button", { name: "Drop pin", exact: true }).click();
    await expect(page.getByText(/region selection is paused/)).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const map = (globalThis as unknown as { nativePinMap?: Map })
              .nativePinMap;
            return (
              !!map &&
              !!map.getLayer("project-review-pin-dot") &&
              !map.isMoving()
            );
          }),
        { timeout: 60000 },
      )
      .toBe(true);
    const canvas = page.locator("canvas.maplibregl-canvas");
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
    expect(errors).toEqual([]);
    const pin = page.locator(
      '.project-sidebar [data-testid="review-pin-panel"]',
    );
    await expect(pin).toBeVisible();
    await expect(pin).toContainText("#2");
    await expect(panel).toContainText("1 selected regions");
    await pin
      .getByLabel("Review pin notes")
      .fill("Investigate the office wall join.");
    await pin
      .getByRole("button", { name: "Save pin notes", exact: true })
      .click();
    await pin.getByRole("button", { name: "Move pin", exact: true }).click();
    await canvas.click({
      position: { x: box!.width / 2 + 10, y: box!.height / 2 },
    });
    await expect(pin).toContainText("#2");
    await expect(panel).toContainText("1 selected regions");
    mkdirSync("work/office-source-review-20261005/browser", {
      recursive: true,
    });
    await pin.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `work/office-source-review-20261005/browser/native-pin-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download reviewed ZIP", exact: true })
      .click();
    const saved = await readIndoorProject(
      new Uint8Array(readFileSync((await (await download).path())!)),
    );
    expect(geometry(saved)).toBe(original);
    expect(saved.model).toEqual(project.model);
    expect(saved.rooms.reviewPins!.pins).toHaveLength(1);
    expect(saved.rooms.reviewPins!.pins[0]).toMatchObject({
      levelId: 2,
      notes: "Investigate the office wall join.",
    });
  });
}
