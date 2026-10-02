import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

const zipPath = process.env.INDOOR_DESK_PROJECT_ZIP;
test.skip(
  !zipPath || !existsSync(zipPath),
  "Set INDOOR_DESK_PROJECT_ZIP to the source-supported desk entrance repair.",
);

for (const mobile of [false, true]) {
  test(`Library Services Desk entrance works in both directions on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zipPath!);
    // This real archive expands to 160 MiB and initially draws the whole campus.
    await expect(page.getByRole("status")).toContainText("Loaded 1,860", {
      timeout: 60_000,
    });
    await page.getByLabel("Search indoor map", { exact: true }).fill("05-136");
    await page
      .getByRole("button", { name: /^05-136 · Library Services Desk/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Library Services Desk", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Entrance needs review before directions are available.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `docs/screenshots/unbc-library-desk-${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("05-137");
    await page.getByRole("option", { name: /^05-137 · Open Area/ }).click();
    const result = page.getByTestId("project-route-result");
    await expect(result).toContainText("0 floor changes");
    await expect(result).toContainText("Public access needs confirmation");
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Swap start and destination", exact: true })
      .click();
    await expect(page.getByLabel("Route start", { exact: true })).toHaveValue(
      "05-136 · Library Services Desk",
    );
    await expect(result).toContainText("0 floor changes");
    await page
      .getByRole("button", { name: "Preview directions", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Next step", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `docs/screenshots/unbc-library-desk-route-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
    if (mobile) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
