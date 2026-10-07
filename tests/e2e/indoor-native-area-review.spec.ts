import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { readIndoorProject } from "../../app/indoor-project/package";
const folder = process.env.INDOOR_MASTER_FOLDER;
for (const mobile of [false, true])
  test(`folder companions and native decision actions on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!folder, "Provide the checksummed master folder.");
    test.setTimeout(360000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/openindoormaps/#/projects/indoor");
    const chooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
    await page
      .getByRole("button", { name: "Import master folder", exact: true })
      .click();
    await (await chooserPromise).setFiles(folder!, { timeout: 30000 });
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 90000,
    });
    if (
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
    await page.locator(".project-review-files summary").click();
    await expect(page.locator(".project-review-files")).toContainText(
      "companions saved",
    );
    await page
      .getByRole("button", { name: "source-model-review.md", exact: true })
      .click();
    await expect(page.locator(".project-review-files pre")).toContainText(
      "Source",
    );
    await page.locator(".project-review-files summary").click();
    await page
      .getByRole("button", { name: "Native areas", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Native area decisions" });
    await page
      .getByRole("button", { name: "Native area floor", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /#400176/ }).click();
    await expect(panel).toContainText("native regions", { timeout: 180000 });
    await page
      .getByLabel("Find native region", { exact: true })
      .fill("10-3004");
    await panel.locator(".native-area-region-list button").first().click();
    const checks = panel.getByRole("region", {
      name: "Native boundary checks",
    });
    await expect(checks).toContainText(
      "measured doors have the same connected area",
    );
    await expect(checks).toContainText(
      "Indoor / outdoor enclosure needs review",
    );
    mkdirSync("work/exterior-connection-review/browser", { recursive: true });
    await checks
      .getByText("Indoor / outdoor enclosure needs review", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
      timeout: 180000,
    });
    await checks
      .getByText(/feet of this selection reaches an open native/)
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `work/exterior-connection-review/browser/open-edge-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await checks.locator("summary").click();
    await checks
      .getByRole("button", { name: "Show door #2255457", exact: true })
      .click();
    await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
      timeout: 180000,
    });
    await checks.locator("summary").click();
    await checks
      .getByRole("heading", { name: "Check the enclosure", exact: true })
      .scrollIntoViewIfNeeded();
    await page.waitForTimeout(750);
    mkdirSync("work/native-selection-leaks/browser", { recursive: true });
    await page.screenshot({
      path: `work/native-selection-leaks/browser/checks-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    // Compare the real problematic Floor 3 component without applying any
    // assumptions to its source. Render proof at close and wider zooms.
    mkdirSync("work/native-gap-review/browser", { recursive: true });
    await panel
      .getByLabel("Show existing hallway mapping", { exact: true })
      .uncheck();
    for (const [limit, count, regions] of [
      [5, 71, 272],
      [6, 78, 275],
    ]) {
      await panel
        .getByLabel("Maximum wall gap feet", { exact: true })
        .fill(String(limit));
      const summary = panel.getByText(`Wall gap recommendations · ${count}`, {
        exact: true,
      });
      await expect(summary).toBeVisible({ timeout: 180000 });
      if ((await summary.locator("..").getAttribute("open")) === null)
        await summary.click();
      await panel
        .getByRole("button", {
          name: "Preview all recommended closures",
          exact: true,
        })
        .click();
      await expect(panel).toContainText(`${regions} native regions`, {
        timeout: 180000,
      });
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 180000,
      });
      await page
        .getByLabel("Find native region", { exact: true })
        .fill("10-3004");
      await panel.locator(".native-area-region-list button").first().click();
      await panel
        .getByLabel("Maximum wall gap feet", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(750);
      await page.screenshot({
        path: `work/native-gap-review/browser/${limit}-feet-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
      for (let i = 0; i < 2; i++)
        await page
          .getByRole("button", { name: "Zoom out", exact: true })
          .click();
      await page.waitForTimeout(750);
      await page.screenshot({
        path: `work/native-gap-review/browser/${limit}-feet-wide-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
    }
    await panel.getByLabel("Maximum wall gap feet", { exact: true }).fill("0");
    await expect(panel).toContainText("256 native regions", {
      timeout: 180000,
    });
    await panel
      .getByLabel("Show existing hallway mapping", { exact: true })
      .check();
    await page.getByLabel("Find native region", { exact: true }).fill("08-334");
    const candidate = panel.locator(".native-area-region-list button").first();
    await expect(candidate).toBeVisible();
    await candidate.click();
    await expect(candidate).toHaveAttribute("aria-pressed", "true");
    await page
      .getByLabel("Native area classification", { exact: true })
      .click();
    await page
      .getByRole("menuitemradio", {
        name: "Staff only walking area",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Native area label", { exact: true })
      .fill("Native staff-area review");
    await page
      .getByLabel("Native area evidence", { exact: true })
      .fill(
        "Native slab, closed measured doors and wall partitions compared. Test proposal, not a verified access change.",
      );
    await page
      .getByRole("button", { name: "Save proposal", exact: true })
      .click();
    await expect(panel).toContainText("Area decision saved", {
      timeout: 20000,
    });
    await expect(
      panel.getByRole("button", { name: /Native staff-area review/ }),
    ).toContainText("proposed");
    await expect(
      page.getByRole("button", {
        name: "Apply classification to map",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      panel.getByLabel("08-334 · Office", { exact: true }),
    ).not.toBeChecked();
    await panel.getByLabel("08-334 · Office", { exact: true }).check();
    await expect(
      page.getByRole("button", {
        name: "Apply classification to map",
        exact: true,
      }),
    ).toBeEnabled();
    // A ready decision worker can precede the prepared floor renderer. Capture
    // evidence only once the map is visible, rather than its loading overlay.
    await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
      timeout: 180000,
    });
    await expect(page.locator(".native-area-label")).toContainText(
      "Native staff-area review · proposed",
    );
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await page.waitForTimeout(750);
    mkdirSync("work/native-area-review/browser", { recursive: true });
    await page.screenshot({
      path: `work/native-area-review/browser/native-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    const download = page.waitForEvent("download", { timeout: 90000 });
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Apply classification to map",
        exact: true,
      }),
    ).toBeDisabled();
    // The export first creates the explicit downloadable link.
    await expect(
      page.getByRole("link", { name: /Download reviewed/ }),
    ).toBeVisible({ timeout: 90000 });
    await page.getByRole("link", { name: /Download reviewed/ }).click();
    const d = await download,
      p = await readIndoorProject(
        new Uint8Array(readFileSync((await d.path())!)),
      );
    expect(p.rooms.reviewBundle!.files.length).toBeGreaterThan(10);
    expect(p.rooms.nativeAreaReviews!.decisions[0].status).toBe("proposed");
    expect(
      p.dataset.records.find((r) => r.number === "08-334")!.access,
    ).not.toBe("staff");
    // Apply explicitly, then undo; neither operation manufactures a door/edge.
    await page
      .getByRole("button", { name: "Apply classification to map", exact: true })
      .click();
    await expect(panel).toContainText("Classification applied", {
      timeout: 30000,
    });
    await expect(
      panel.getByRole("button", { name: /Native staff-area review/ }),
    ).toContainText("applied");
    await page
      .getByRole("button", { name: "Undo area edit", exact: true })
      .click();
    await expect(
      panel.getByRole("button", { name: /Native staff-area review/ }),
    ).toContainText("proposed");
    await page
      .getByRole("button", { name: "Native area floor", exact: true })
      .click();
    await page.getByRole("menuitemradio", { name: /#402367/ }).click();
    await expect(panel).toContainText("0 selected regions", {
      timeout: 180000,
    });
    await page
      .getByRole("button", { name: "Close native areas", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Source model", exact: true })
      .click();
    const fullContext = page.getByRole("button", {
      name: "Full model context",
      exact: true,
    });
    await expect(fullContext).toHaveAttribute("aria-pressed", "false");
    await fullContext.click();
    await expect(
      page.getByText(
        "Full native 3D model · no floor clipping · saved GIS alignment",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 90000 });
    await expect(fullContext).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(750);
    await page.screenshot({
      path: `work/exterior-connection-review/browser/full-context-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await fullContext.click();
    await expect(
      page.getByText(
        "Native 3D model · selected floor section · saved GIS alignment",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 90000 });
    expect(errors).toEqual([]);
  });
