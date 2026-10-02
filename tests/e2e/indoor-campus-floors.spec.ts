import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide a prepared UNBC project.");
for (const mobile of [false, true]) {
  test(`combined campus floor survives export and reload on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page
      .getByLabel("Project floor", { exact: true })
      .selectOption("storey:400176");
    await page.getByText("Combine campus floors", { exact: true }).click();
    await page
      .getByLabel("Combine with floor", { exact: true })
      .selectOption("storey:1487353");
    await page
      .getByLabel("Combined floor name", { exact: true })
      .fill("Campus Floor 3");
    await page
      .getByRole("button", { name: "Combine floors", exact: true })
      .click();
    await expect(page.getByLabel("Project floor", { exact: true })).toHaveValue(
      "storey:400176+1487353",
    );
    await expect(
      page.getByLabel("Project building", { exact: true }).locator("option"),
    ).toContainText([
      "All buildings",
      "Building 03",
      "Building 04",
      "Building 05",
      "Building 06",
      "Building 08",
      "Building 10",
    ]);
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download reviewed ZIP" }),
    ).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "Open level selector" }).click();
    await expect(
      page.getByRole("menuitemradio", { name: /Campus Floor 3/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: /Floor 3\.5/ }),
    ).toHaveCount(0);
    await page.getByRole("menuitemradio", { name: /Campus Floor 3/ }).click();
    await expect(
      page.getByRole("button", { name: "Open level selector" }),
    ).toContainText("Campus Floor 3");
    await page.screenshot({
      path: `docs/screenshots/unbc-combined-floor-3-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
  });
}
