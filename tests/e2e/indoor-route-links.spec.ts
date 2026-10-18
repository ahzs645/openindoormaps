import { expect, test } from "@playwright/test";
import { generateFloorOpeningFixture } from "../fixtures/indoor-floor-opening";

let fixturePath: string;
const base = process.env.PAGES_BASE_PATH ?? "/openindoormaps/";
test.beforeAll(async () => {
  fixturePath = (await generateFloorOpeningFixture("/tmp/oim-route-links.zip"))
    .path;
});

for (const mobile of [false, true]) {
  test(`indoor directions link restores stable places and profile on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto(
      `${base}#/projects/indoor?from=lower-main&to=upper-room&accessible=1`,
    );
    await page.locator('input[type="file"]').setInputFiles(fixturePath);
    await expect(page.getByLabel("Route start", { exact: true })).toHaveValue(
      /Lower room through atrium/,
      { timeout: 60_000 },
    );
    await expect(
      page.getByLabel("Route destination", { exact: true }),
    ).toHaveValue(/Upper Studio/);
    await expect(
      page.getByRole("button", { name: "Route profile", exact: true }),
    ).toHaveText("Step-free");
    await page
      .getByRole("button", { name: "Swap start and destination" })
      .click();
    await expect(page.getByLabel("Route start", { exact: true })).toHaveValue(
      /Upper Studio/,
    );
    await expect
      .poll(() =>
        new URLSearchParams(new URL(page.url()).hash.split("?")[1]).get("from"),
      )
      .toBe("upper-room");
    await page.screenshot({
      path: testInfo.outputPath("route-link.png"),
      fullPage: true,
    });
    await page.reload();
    await expect(page.getByLabel("Route start", { exact: true })).toHaveValue(
      /Upper Studio/,
      { timeout: 60_000 },
    );
    await expect(
      page.getByLabel("Route destination", { exact: true }),
    ).toHaveValue(/Lower room through atrium/);
    expect(errors).toEqual([]);
  });
}
