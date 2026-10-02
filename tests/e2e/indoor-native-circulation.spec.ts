import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
const zip = process.env.INDOOR_PROJECT_ZIP;
test("rebuilt native circulation retains its review pin in the production source-model preview", async ({
  page,
}) => {
  test.skip(
    !zip || !existsSync(zip),
    "Provide the native circulation master ZIP.",
  );
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1640, height: 1100 });
  await page.goto("/projects/indoor");
  await expect(page.locator('input[type="file"]')).toBeAttached();
  await page.locator('input[type="file"]').setInputFiles(zip!);
  await expect(page.getByRole("status")).toContainText("Loaded", {
    timeout: 60_000,
  });
  await page
    .getByRole("button", { name: "Review project", exact: true })
    .click();
  await page
    .getByLabel("Map floor", { exact: true })
    .selectOption({ label: "Floor 2" });
  await page.getByRole("button", { name: "Review pin 4", exact: true }).click();
  await page
    .getByRole("button", { name: "Show pin on map", exact: true })
    .click();
  await page.getByRole("button", { name: "Source model", exact: true }).click();
  await expect(page.getByTestId("review-pin-panel")).toContainText("#694");
  await expect(
    page.getByText(
      "Native 3D model · selected floor section · saved GIS alignment",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 60_000 });
  await page.screenshot({
    path: "docs/screenshots/unbc-native-circulation-pin-production.png",
  });
  expect(errors).toEqual([]);
});
