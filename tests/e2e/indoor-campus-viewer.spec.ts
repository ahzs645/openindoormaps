import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map, GeoJSONSource } from "maplibre-gl";
const masterPath = process.env.INDOOR_PROJECT_ZIP;
const masterFloors =
  masterPath && existsSync(masterPath)
    ? (JSON.parse(
        strFromU8(unzipSync(readFileSync(masterPath))["viewer/indoor.json"]),
      ).floors as { id: string; name: string; levelIds: number[] }[])
    : [];
test.skip(
  !masterPath || !existsSync(masterPath),
  "Provide a prepared campus master ZIP.",
);
const sourceNames = [
  "project-areas",
  "project-room-blocks",
  "project-lower-rooms",
  "project-native-stairs",
  "project-doors",
  "project-exposed-walls",
];
for (const mobile of [false, true])
  test(`campus viewer export preserves room views and multi-floor navigation on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, info) => {
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
      const original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { viewerTestMap: Map }).viewerTestMap =
            this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(masterPath!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await expect(
      page.getByRole("button", { name: "Review project", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Export campus viewer", exact: true })
      .click();
    await expect(
      page.getByRole("link", {
        name: "Download campus viewer ZIP",
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download campus viewer ZIP", exact: true })
      .click();
    const download = await downloaded;
    const output = info.outputPath("campus-viewer.zip");
    await download.saveAs(output);
    const viewerFiles = unzipSync(readFileSync(output));
    expect(Object.keys(viewerFiles).sort()).toEqual([
      "gis/reference-points.json",
      "manifest.json",
      "viewer/indoor.json",
      "viewer/metadata.json",
    ]);
    expect(JSON.parse(strFromU8(viewerFiles["viewer/indoor.json"]))).toEqual(
      JSON.parse(
        strFromU8(unzipSync(readFileSync(masterPath!))["viewer/indoor.json"]),
      ),
    );
    expect(readFileSync(output).length).toBeLessThan(
      readFileSync(masterPath!).length / 10,
    );
    // Capture the same visitor source geometry before and after the format change.
    await page
      .getByRole("button", { name: "Explore map", exact: true })
      .click();
    const geometry = async () =>
      page.evaluate(async (names) => {
        const map = (globalThis as unknown as { viewerTestMap: Map })
          .viewerTestMap;
        if (!map || names.some((n) => !map.getSource(n))) return null;
        return Promise.all(
          names.map(async (n) => {
            const data = await (map.getSource(n) as GeoJSONSource).getData();
            const bytes = new TextEncoder().encode(JSON.stringify(data));
            const digest = await crypto.subtle.digest("SHA-256", bytes);
            return [
              n,
              [...new Uint8Array(digest)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
            ];
          }),
        );
      }, sourceNames);
    await expect.poll(geometry).not.toBeNull();
    const before = await geometry();
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.locator('input[type="file"]').setInputFiles(output);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Review project", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Edit map", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Source model", exact: true }),
    ).toHaveCount(0);
    await expect.poll(geometry, { timeout: 15_000 }).toEqual(before);
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            globalThis as unknown as { viewerTestMap: Map }
          ).viewerTestMap.getPitch(),
        ),
      )
      .toBe(0);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              globalThis as unknown as { viewerTestMap: Map }
            ).viewerTestMap.getLayer("project-room-boxes")?.type,
        ),
      )
      .toBe("fill-extrusion");
    await page
      .getByRole("button", { name: "Get directions", exact: true })
      .click();
    await page.getByLabel("Route start", { exact: true }).fill("10-1018");
    await page.getByRole("option", { name: /^10-1018 · OT Office/ }).click();
    await page.getByLabel("Route destination", { exact: true }).fill("10-4018");
    await page.getByRole("option", { name: /^10-4018 · Office/ }).click();
    await expect(page.getByTestId("project-route-result")).toContainText(
      "3 floor changes",
    );
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    for (const levelId of [694, 400_176, 402_367]) {
      const floor = masterFloors.find((f) => f.levelIds.includes(levelId))!;
      await page
        .getByRole("button", {
          name: new RegExp(
            `^Go to step \\d+: Take stairs up to ${floor.name}$`,
          ),
        })
        .click();
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toHaveAttribute("data-floor-id", floor.id, { timeout: 30_000 });
    }
    await page.screenshot({
      path: `docs/screenshots/unbc-campus-viewer-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    // The saved viewer restores without a master or source scene.
    await page.reload();
    await expect(page.getByTestId("project-navigation")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: "Source model", exact: true }),
    ).toHaveCount(0);
  });
