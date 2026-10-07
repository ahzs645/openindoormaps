import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { gapProject } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
for (const mobile of [false, true])
  test(`gap preview, portable source patch and undo on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const p = await gapProject();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/openindoormaps/#/projects/indoor");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import project ZIP", exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "gap-test.reviter.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await exportIndoorProject(p)),
    });
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 30000,
    });
    if (
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Native areas", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Native area decisions" });
    await expect(panel).toContainText("1 native regions");
    await panel.getByLabel("Maximum wall gap feet", { exact: true }).fill("5");
    await expect(
      panel.getByText("Wall gap recommendations · 1", { exact: true }),
    ).toHaveCount(0);
    await panel.getByLabel("Maximum wall gap feet", { exact: true }).fill("6");
    await expect(
      panel.getByText("Wall gap recommendations · 1", { exact: true }),
    ).toBeVisible();
    await panel
      .getByText("Wall gap recommendations · 1", { exact: true })
      .click();
    await panel
      .getByRole("button", {
        name: "Preview all recommended closures",
        exact: true,
      })
      .click();
    await expect(panel).toContainText("2 native regions");
    await panel.getByRole("checkbox", { name: /Patch closure/ }).check();
    await panel
      .getByLabel("Boundary patch evidence", { exact: true })
      .fill(
        "Synthetic evidence: missing partition continuation between wall caps 200 and 201; real slab hole remains open.",
      );
    await panel
      .getByRole("button", {
        name: "Save checked boundary recommendations",
        exact: true,
      })
      .click();
    await expect(panel).toContainText("Boundary recommendations saved");
    await expect(
      panel.getByRole("button", { name: /Preview saved boundary/ }),
    ).toBeVisible();
    await panel
      .getByRole("button", {
        name: "Apply checked boundary patches",
        exact: true,
      })
      .click();
    await expect(panel).toContainText("regeneration needed");
    await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
      timeout: 60000,
    });
    await panel
      .getByLabel("Maximum wall gap feet", { exact: true })
      .scrollIntoViewIfNeeded();
    mkdirSync("work/native-gap-review/browser", { recursive: true });
    await page.screenshot({
      path: `work/native-gap-review/browser/patch-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const link = page.getByRole("link", { name: /Download reviewed/ });
    await expect(link).toBeVisible({ timeout: 30000 });
    const download = page.waitForEvent("download");
    await link.click();
    const reopened = await readIndoorProject(
      new Uint8Array(readFileSync((await (await download).path())!)),
    );
    expect(reopened.rooms.nativeBoundaryPatches!.patches[0].status).toBe(
      "applied",
    );
    expect(reopened.dataset.boundaryPatchState!.regenerated).toBe(false);
    expect(reopened.files["model/review.rvt"]).toEqual(
      p.files["model/review.rvt"],
    );
    await panel
      .getByRole("button", { name: "Undo area edit", exact: true })
      .click();
    await expect(panel).not.toContainText("regeneration needed");
    await expect(panel).toContainText("proposed");
    await panel
      .getByRole("button", { name: "Native selection mode", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Room focus", exact: true })
      .click();
    await panel.getByLabel("Find room enclosure", { exact: true }).fill("01-0");
    await panel
      .getByRole("button", { name: "Focus 01-0 · Office", exact: true })
      .click();
    await expect(panel).toContainText("unverified");
    await expect(panel).toContainText("1 selected regions");
    expect(errors).toEqual([]);
  });
