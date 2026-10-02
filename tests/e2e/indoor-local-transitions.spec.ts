import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";

const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the updated UNBC package.");
for (const mobile of [false, true])
  test(`local steps show once and import preserves reference pins on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
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
      const { default: lib } = await import(path),
        original = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { localMap: Map }).localMap = this;
        return original.apply(this, args);
      };
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const data: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const edge = data.edges.find(
      (e) => e.kind === "local-steps" && e.nativeElementId === 1_620_957,
    )!;
    const marker = page.locator(
      `.project-connector-marker[data-edge-id="${edge.id}"]`,
    );
    await expect(marker).toHaveCount(1);
    await page.evaluate(
      ({ center }) =>
        (globalThis as unknown as { localMap: Map }).localMap.jumpTo({
          center,
          zoom: 22,
          pitch: 45,
          bearing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
      { center: geographicPoint(data, [63, 455]) },
    );
    await expect(marker).toBeVisible({ timeout: 30_000 });
    await expect(marker).toHaveAttribute(
      "aria-label",
      "Steps up · local level change",
    );
    await marker.click();
    await expect(
      page.getByRole("heading", { name: "Local steps #1620957" }),
    ).toBeVisible();
    await expect(
      page.getByText("1.00 m elevation change within Campus Floor 1", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "07-180 ↔ Building 08 landing (generated; no source room outline)",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByLabel("Connection accessibility", { exact: true }),
    ).toHaveValue("no");
    await page.screenshot({
      path: `docs/screenshots/unbc-local-steps-${mobile ? "mobile" : "desktop"}.png`,
    });
    // Dropping a reference pin must survive replacing the prepared graph with
    // another archive for this exact source model, without changing that graph.
    await page.getByRole("button", { name: "Drop pin", exact: true }).click();
    await page
      .locator(".maplibregl-canvas")
      .click({ position: mobile ? { x: 195, y: 240 } : { x: 350, y: 400 } });
    await expect(
      page.getByRole("heading", { name: "Review pin 1", exact: true }),
    ).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await expect(
      page.getByRole("button", { name: "Review pin 1", exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(marker).toHaveCount(1);
    expect(errors).toEqual([]);
  });
