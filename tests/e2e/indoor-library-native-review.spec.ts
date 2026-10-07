import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
const zip = process.env.INDOOR_LIBRARY_REVIEW_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the reviewed Library master ZIP.");
for (const mobile of [false, true])
  test(`Library native walking groups and merged room on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 },
    );
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    const search = page.getByLabel("Search indoor map", { exact: true });
    for (const [number, name] of [
      ["05-136", "Library Services Desk"],
      ["05-161", "Reception"],
      ["05-168", "Admin Area"],
      ["05-168A", "Waiting"],
      ["05-166", "Lab / Kitchen"],
      ["05-169", "Print"],
    ]) {
      await search.fill(number);
      await page
        .getByRole("button", {
          name: new RegExp(
            "^" +
              number.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`) +
              " · " +
              name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
          ),
        })
        .click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Entrance needs review before directions are available.",
          { exact: true },
        ),
      ).toHaveCount(0);
      if (number === "05-168" || number === "05-166" || number === "05-169")
        await page.screenshot({
          path: testInfo.outputPath(`${number}-2d.png`),
        });
      if (number === "05-168") {
        await page
          .getByRole("button", { name: "3D rooms", exact: true })
          .click();
        await page.screenshot({
          path: testInfo.outputPath("admin-native-3d.png"),
        });
        await page
          .getByRole("button", { name: "2D rooms", exact: true })
          .click();
      }
    }
    await search.fill("05-166");
    await page
      .getByRole("button", { name: /^05-166 · Lab \/ Kitchen/ })
      .click();
    await page.getByRole("button", { name: "Directions", exact: true }).click();
    await page.getByLabel("Route start", { exact: true }).fill("05-161");
    await page.getByRole("option", { name: /^05-161 · Reception/ }).click();
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await page
      .getByRole("button", { name: "Swap start and destination", exact: true })
      .click();
    await expect(page.getByLabel("Route start", { exact: true })).toHaveValue(
      "05-166 · Lab / Kitchen",
    );
    await expect(
      page.getByRole("button", { name: "Preview directions", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("merged-lab-route.png"),
    });
    expect(errors).toEqual([]);
    if (mobile)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
  });
