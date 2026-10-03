import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { generateFloorOpeningFixture } from "../fixtures/indoor-floor-opening";
import { readIndoorProject } from "../../app/indoor-project/package";

const base = process.env.PAGES_BASE_PATH ?? "/openindoormaps/";
let zipPath = process.env.INDOOR_PROJECT_ZIP ?? "";
test.beforeAll(async () => {
  if (!zipPath) zipPath = (await generateFloorOpeningFixture()).path;
});

for (const mobile of [false, true]) {
  test(`Pages supports ZIP import, floors, export and refresh on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    // A direct route and reload must work on a host without SPA rewrites.
    await page.goto(`${base}#/projects/indoor`);
    await expect(
      page.getByRole("heading", { name: "Indoor project workspace" }),
    ).toBeVisible();
    for (const asset of [
      "favicon.svg",
      "images/oim-ctrl-logo.svg",
      "revit/ahsz-preview.png",
      "images/vendor-reference-icons/stairs.png",
      "models/vendor-reference-models/new_escalator.glb",
    ]) {
      const response = await request.get(base + asset);
      expect(response.ok(), asset).toBe(true);
      expect(response.headers()["content-type"], asset).not.toContain(
        "text/html",
      );
    }
    await page.locator('input[type="file"]').setInputFiles(zipPath);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const floor = page.getByLabel("Map floor", { exact: true });
    await expect(floor).toBeVisible();
    expect(await floor.locator("option").count()).toBeGreaterThan(1);
    const options = await floor
      .locator("option")
      .evaluateAll((items) =>
        items.map((item) => (item as HTMLOptionElement).value),
      );
    await floor.selectOption(options[1]);
    await expect(floor).toHaveValue(options[1]);
    // Exercise the bundled route worker on the static Pages host too.
    const departure = page.getByLabel("Route start", { exact: true });
    const arrival = page.getByLabel("Route destination", { exact: true });
    const roomKey = await departure
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await departure.selectOption(roomKey!);
    await arrival.selectOption(roomKey!);
    await expect(page.getByTestId("project-route-result")).toContainText(
      "0.0 m",
      { timeout: 30_000 },
    );

    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "2D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "3D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Export campus viewer", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Campus viewer ready",
      { timeout: 60_000 },
    );
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download campus viewer ZIP", exact: true })
      .click();
    const file = await (await downloadEvent).path();
    expect(file).toBeTruthy();
    const viewer = await readIndoorProject(
      new Uint8Array(await readFile(file!)),
    );
    expect(viewer.manifest.format).toBe("openindoormaps-viewer");
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    expect(page.url()).toContain("#/projects/indoor");
    expect(errors).toEqual([]);
  });
}
