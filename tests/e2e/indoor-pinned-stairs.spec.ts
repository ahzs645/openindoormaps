import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
const zip = process.env.INDOOR_PINNED_STAIRS_ZIP;
test.skip(
  !zip || !existsSync(zip),
  "Provide a master containing review pins 23 and 24.",
);
for (const mobile of [false, true])
  test(`pinned source stair connectors in 2D and 3D on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/projects/indoor");
    await expect(page.locator('input[type="file"]')).toBeAttached();
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const floor = page.getByLabel("Project floor", { exact: true });
    const value = await floor
      .locator("option")
      .filter({ hasText: "Floor 2 · #694" })
      .getAttribute("value");
    await floor.selectOption(value!);
    for (const c of [
      { pin: 23, id: 2_024_027, connected: false },
      { pin: 24, id: 2_474_568, connected: true },
    ]) {
      await page
        .getByRole("button", { name: `Review pin ${c.pin}`, exact: true })
        .click();
      const panel = page.getByTestId("review-pin-panel");
      await expect(
        panel.getByText(`Native staircase #${c.id}`, { exact: true }),
      ).toBeVisible();
      await expect(panel).toContainText(
        c.connected
          ? "Route connection available"
          : "No compiled route connection · landings need review",
      );
      await panel
        .getByRole("button", {
          name: `Inspect staircase #${c.id}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: `Source staircase #${c.id}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          c.connected
            ? "Route connection available. Stairs are excluded from wheelchair paths."
            : "Entrance connection needs review before directions are available. Stairs are excluded from wheelchair paths.",
          { exact: true },
        ),
      ).toBeVisible();
      for (const view of ["2D rooms", "3D rooms", "Source model"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
        await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
          timeout: 30_000,
        });
        const marker = page.locator(
          `[data-testid="project-connector-markers"] [data-stair-element-id="${c.id}"]`,
        );
        await expect(marker).toHaveCount(1);
        await expect(marker).toBeVisible();
        await page.locator("canvas.maplibregl-canvas").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `work/stair-pins-23-24/browser/pin-${c.pin}-${view.replaceAll(" ", "-")}-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
    }
    expect(errors).toEqual([]);
  });
