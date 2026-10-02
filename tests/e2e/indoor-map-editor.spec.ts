import { expect, test } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import type { Map } from "maplibre-gl";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zipPath = process.env.INDOOR_PROJECT_ZIP;
const source: IndoorDataset | undefined =
  zipPath && existsSync(zipPath)
    ? JSON.parse(
        strFromU8(unzipSync(readFileSync(zipPath))["viewer/indoor.json"]),
      )
    : undefined;
for (const mobile of [false, true]) {
  test(`map editor places, edits and saves UNBC annotations on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.skip(!source, "Set INDOOR_PROJECT_ZIP to a prepared UNBC archive.");
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path);
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { editorTestMap: Map }).editorTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zipPath!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Map editor" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!(
              globalThis as unknown as { editorTestMap: Map }
            ).editorTestMap?.getSource("project-annotations"),
        ),
      )
      .toBe(true);
    const room = source!.records.find((r) => r.number === "05-107")!;
    const arrival = source!.nodes.find((n) => n.id === room.arrivalNodeId)!;
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { editorTestMap: Map }
          ).editorTestMap.getPitch(),
        ),
      )
      .toBe(0);
    await page.evaluate(
      (center) =>
        (globalThis as unknown as { editorTestMap: Map }).editorTestMap.jumpTo({
          center,
          zoom: 20.5,
          pitch: 0,
        }),
      geographicPoint(source!, arrival.pointFeet),
    );
    const clickMap = async (dx = 0, dy = 0) => {
      const canvas = page.locator(".project-map canvas.maplibregl-canvas");
      await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!;
      await page.mouse.click(
        box.x + box.width / 2 + dx,
        box.y + box.height / 2 + dy,
      );
    };
    await page.getByRole("button", { name: "Add label", exact: true }).click();
    await page
      .getByLabel("Annotation text", { exact: true })
      .fill("Student services");
    await clickMap();
    await expect(
      page.getByRole("button", { name: "Create annotation", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Create annotation", exact: true })
      .click();
    await expect(page.locator(".project-annotation-label")).toContainText(
      "Student services",
    );
    await expect(page.locator(".project-status")).toContainText(
      "Unsaved edits",
    );
    await page
      .getByRole("button", { name: "Move annotation", exact: true })
      .click();
    await clickMap(45, -30);
    await page.getByRole("button", { name: "Undo edit", exact: true }).click();
    await page.getByRole("button", { name: "Redo edit", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Edit annotation: Student services",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Annotation text", { exact: true })
      .fill("UNBC help desk");
    await page
      .getByRole("button", { name: "Save annotation", exact: true })
      .click();
    await page.getByRole("button", { name: "Draw area", exact: true }).click();
    await page
      .getByLabel("Annotation text", { exact: true })
      .fill("Quiet study zone");
    for (const point of [
      [-80, 10],
      [30, 10],
      [30, 55],
      [-80, 55],
    ])
      await clickMap(...(point as [number, number]));
    await expect(
      page.getByText("4 corners placed", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create annotation", exact: true })
      .click();
    await expect(page.locator(".project-annotation-label")).toHaveCount(2);
    await page.getByText("Edit area corners", { exact: true }).click();
    await page
      .getByRole("button", { name: "Move corner 2", exact: true })
      .click();
    await clickMap(60, 10);
    // Floor isolation, then return to this floor.
    const floor = await page
      .getByLabel("Map floor", { exact: true })
      .inputValue();
    const other = source!.floors.find((f) => f.id !== floor)!;
    await page.getByLabel("Map floor", { exact: true }).selectOption(other.id);
    await expect(page.locator(".project-annotation-label")).toHaveCount(0);
    await page.getByLabel("Map floor", { exact: true }).selectOption(floor);
    await expect(page.locator(".project-annotation-label")).toHaveCount(2);
    await page.evaluate(
      (center) =>
        (globalThis as unknown as { editorTestMap: Map }).editorTestMap.jumpTo({
          center,
          zoom: 20.5,
          pitch: 0,
        }),
      geographicPoint(source!, arrival.pointFeet),
    );
    await page
      .getByRole("button", {
        name: "Edit annotation: Quiet study zone",
        exact: true,
      })
      .click();
    await (mobile
      ? page.screenshot({
          path: "docs/screenshots/unbc-map-editor-mobile.png",
        })
      : page.screenshot({
          path: "docs/screenshots/unbc-map-editor-desktop.png",
        }));
    // Delete and undo before producing the portable archive.
    await page
      .getByRole("button", { name: "Delete annotation", exact: true })
      .click();
    await expect(page.locator(".project-annotation-label")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo edit", exact: true }).click();
    await expect(page.locator(".project-annotation-label")).toHaveCount(2);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    await clickMap();
    await expect(
      page.getByRole("heading", { name: "Selected area", exact: true }),
    ).toBeVisible();
    await page
      .getByText("Visitor names, categories and colors", { exact: true })
      .click();
    await page
      .getByLabel("Visitor place name", { exact: true })
      .fill("Student advising");
    await page
      .getByLabel("Visitor room color", { exact: true })
      .fill("#cbe8de");
    await page
      .getByRole("button", { name: "Apply visitor details", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    await expect(page.locator(".project-annotation-label")).toHaveCount(2);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect(page.locator(".project-annotation-label")).toHaveCount(2);
    await page.getByRole("button", { name: "Edit map", exact: true }).click();
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const link = page.getByRole("link", {
      name: "Download reviewed ZIP",
      exact: true,
    });
    await expect(link).toBeVisible({ timeout: 90_000 });
    const downloadPromise = page.waitForEvent("download");
    await link.click();
    const download = await downloadPromise;
    const savedPath = testInfo.outputPath("editor-reviewed.zip");
    await download.saveAs(savedPath);
    const contents = unzipSync(readFileSync(savedPath));
    const rooms = JSON.parse(strFromU8(contents["floors/rooms.json"]));
    expect(
      rooms.mapEdits.annotations.map((a: { text: string }) => a.text),
    ).toEqual(["UNBC help desk", "Quiet study zone"]);
    const restored: IndoorDataset = JSON.parse(
      strFromU8(contents["viewer/indoor.json"]),
    );
    expect(restored.nodes).toEqual(source!.nodes);
    expect(restored.edges).toEqual(source!.edges);
    expect(restored.records).toEqual(source!.records);
    expect(restored.visitor?.places[room.key]?.displayName).toBe(
      "Student advising",
    );
    expect(restored.visitor?.places[room.key]?.color).toBe("#cbe8de");
    await page.locator('input[type="file"]').setInputFiles(savedPath);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await expect(page.locator(".project-annotation-label")).toHaveCount(2, {
      timeout: 30_000,
    });
    await page.reload();
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await expect(page.locator(".project-annotation-label")).toHaveCount(2, {
      timeout: 30_000,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
