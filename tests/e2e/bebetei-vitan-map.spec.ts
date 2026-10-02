import { expect, test } from "@playwright/test";

test("renders the Bebetei Vitan map shell", async ({ page }) => {
  await page.goto("/bebetei-vitan");

  await expect(
    page.getByPlaceholder("Search indoor locations..."),
  ).toBeVisible();
  await expect(page.getByTestId("map-canvas-root")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();

  const searchBox = await page
    .getByPlaceholder("Search indoor locations...")
    .boundingBox();
  expect(searchBox?.x).toBeLessThan(80);
  expect(searchBox?.y).toBeLessThan(80);

  await page.waitForFunction(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>(".maplibregl-canvas");

    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  });
});

test("keeps the map usable with the mobile bottom sheet", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/bebetei-vitan");

  await expect(page.getByTestId("map-canvas-root")).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(
    page.getByPlaceholder("Search indoor locations..."),
  ).toBeVisible();

  const sheetBox = await page
    .getByRole("button", { name: "Resize map panel" })
    .locator("xpath=..")
    .boundingBox();
  const lastMapButtonBox = await page
    .getByRole("button", { name: "Toggle fullscreen" })
    .boundingBox();

  expect(sheetBox?.y).toBeDefined();
  expect(lastMapButtonBox?.y).toBeDefined();
  expect(
    (sheetBox?.y ?? 0) -
      ((lastMapButtonBox?.y ?? 0) + (lastMapButtonBox?.height ?? 0)),
  ).toBeGreaterThan(8);
});
