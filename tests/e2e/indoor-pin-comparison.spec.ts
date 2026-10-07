import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { coupledGapProject } from "../fixtures/native-area-project";
import { deriveNativeAreas } from "../../app/indoor-project/native-area-review";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import { saveReviewCompanion } from "../../app/indoor-project/review-companion-save";
import { readPinPatchDecisions } from "../../app/indoor-project/pin-patch-decisions";
import { pinRecommendationGeometryHash } from "../../app/indoor-project/pin-recommendations";
for (const mobile of [false, true])
  test(`pin sidebar comparison and portable decisions ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let p = await coupledGapProject();
    const derived = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 1 });
    const patch = {
      ...derived.gapCandidates![0],
      status: "proposed" as const,
      notes: "Source-supported test divider; preview only.",
    };
    const secondPatch = {
      ...derived.gapCandidates![1],
      status: "proposed" as const,
      notes: "Second join; preview only.",
    };
    p.rooms.nativeBoundaryPatches = {
      version: 1,
      patches: [patch, secondPatch],
    };
    p.rooms.reviewPins = {
      version: 1,
      sourceModelSha256: p.dataset.source.modelSha256,
      pins: [
        {
          id: "pin-gap",
          label: "Review gap",
          notes: "",
          levelId: 1,
          pointFeet: [6, 6],
        },
      ],
    };
    p = await saveReviewCompanion(p, "pin-review/pin-recommendations.json", {
      format: "openindoormaps-pin-recommendations",
      version: 1,
      sourceModelSha256: p.dataset.source.modelSha256,
      roomsSha256: p.dataset.source.roomsSha256,
      geometrySha256: await pinRecommendationGeometryHash(p.dataset),
      entries: [
        {
          id: "r1",
          pinId: "pin-gap",
          title: "Divider review",
          recommendation: "Compare the proposed divider.",
          question: "Should these areas stay separate?",
          patchIds: [patch.id, secondPatch.id],
          evidencePaths: [],
        },
        {
          id: "r2",
          pinId: "pin-gap",
          title: "Evidence only",
          recommendation: "Inspect original glazing.",
          question: "Is a source correction required?",
          patchIds: [],
          evidencePaths: [],
        },
      ],
    });
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
      name: "pin-comparison.reviter.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await exportIndoorProject(p)),
    });
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 30000,
    });
    await page.getByRole("button", { name: "Pin review", exact: true }).click();
    const sidebar = page.getByRole("complementary", {
        name: "Pin review sidebar",
      }),
      map = page.getByRole("region", { name: "Indoor campus map" });
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar
        .locator("p[role=status]:visible")
        .filter({ hasText: /Comparison ready/ }),
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(
      sidebar.getByLabel("Patch scope", { exact: true }),
    ).toHaveValue(patch.id);
    await expect(
      sidebar.locator("p:visible").filter({ hasText: /Patch 1 of 2 only/ }),
    ).toBeVisible();
    await sidebar
      .getByRole("button", { name: "Next patch", exact: true })
      .click();
    await expect(
      sidebar.getByLabel("Patch scope", { exact: true }),
    ).toHaveValue(secondPatch.id);
    await expect(
      sidebar.locator("p:visible").filter({ hasText: /Patch 2 of 2 only/ }),
    ).toBeVisible();
    await expect(
      sidebar.locator("p:visible").filter({ hasText: /Target before:/ }),
    ).toContainText(/Target after:[\s\S]*2 place labels/);
    await sidebar
      .getByRole("button", { name: "Previous patch", exact: true })
      .click();
    await expect(
      sidebar.getByLabel("Patch scope", { exact: true }),
    ).toHaveValue(patch.id);
    await sidebar.getByLabel("Patch scope", { exact: true }).selectOption("");
    await expect(
      sidebar
        .locator("p:visible")
        .filter({ hasText: /All 2 saved patches together/ }),
    ).toBeVisible();
    await expect(
      sidebar.locator("p:visible").filter({ hasText: /Target before:/ }),
    ).toContainText(/Target after:[\s\S]*1 place labels/);
    const bounds = await map.boundingBox();
    expect(bounds!.height).toBeGreaterThan(mobile ? 260 : 650);
    expect(bounds!.width).toBeGreaterThan(mobile ? 360 : 850);
    await sidebar
      .getByRole("button", { name: "Before patch", exact: true })
      .click();
    await expect(
      sidebar.getByRole("button", { name: "Before patch", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(sidebar.getByRole("region", {name:"Patch room colors",exact:true})).toContainText("Before patch · 1 connected area");
    await sidebar
      .getByRole("button", { name: "Patch overlay", exact: true })
      .click();
    await expect(
      sidebar.getByRole("button", { name: "Patch overlay", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await sidebar
      .getByRole("button", { name: "After patch", exact: true })
      .click();
    await expect(sidebar).toContainText("Target after:");
    const colors = sidebar.getByRole("region", {name:"Patch room colors",exact:true});
    await expect(colors).toContainText("After patch · 2 connected areas");
    await expect(colors.getByRole("listitem")).toHaveCount(2);
    await page.waitForTimeout(700);
    mkdirSync("work/pin-review-sidebar/browser", { recursive: true });
    await page.screenshot({
      path: `work/pin-review-sidebar/browser/updated-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await sidebar
      .getByLabel("Patch scope", { exact: true })
      .selectOption(patch.id);
    const patchReview = sidebar.getByRole("group", {
      name: "Review patches one by one",
      exact: true,
    });
    await patchReview
      .getByLabel(`Patch note ${patch.id}`, { exact: true })
      .fill("First joint confirmed against the source footprint.");
    await patchReview
      .getByRole("button", { name: "Accept patch and next", exact: true })
      .click();
    await expect(
      sidebar.getByLabel("Patch scope", { exact: true }),
    ).toHaveValue(secondPatch.id);
    await expect(patchReview).toContainText(
      "1 of 2 patches reviewed · 1 accepted.",
    );
    await patchReview
      .getByRole("button", { name: "Reject patch", exact: true })
      .click();
    await expect(patchReview).toContainText(
      "2 of 2 patches reviewed · 1 accepted.",
    );
    await patchReview
      .getByRole("button", {
        name: "Preview accepted patches (1)",
        exact: true,
      })
      .click();
    await expect(
      sidebar
        .locator("p:visible")
        .filter({ hasText: /1 accepted patches only/ }),
    ).toBeVisible();
    await expect(
      sidebar.locator("p:visible").filter({ hasText: /Target before:/ }),
    ).toContainText(/Target after:[\s\S]*2 place labels/);
    await sidebar
      .getByLabel("Patch scope", { exact: true })
      .selectOption(secondPatch.id);
    await patchReview
      .getByRole("button", { name: "Accept patch", exact: true })
      .click();
    await expect(patchReview).toContainText(
      "2 of 2 patches reviewed · 2 accepted.",
    );
    await patchReview
      .getByRole("button", {
        name: "Preview accepted patches (2)",
        exact: true,
      })
      .click();
    await expect(
      sidebar
        .locator("p:visible")
        .filter({ hasText: /2 accepted patches only/ }),
    ).toBeVisible();
    await expect(
      sidebar.locator("p:visible").filter({ hasText: /Target before:/ }),
    ).toContainText(/Target after:[\s\S]*1 place labels/);
    // Clicking an already selected accepted scope must keep its comparison ready.
    await patchReview
      .getByRole("button", {
        name: "Preview accepted patches (2)",
        exact: true,
      })
      .click();
    await expect(
      sidebar
        .locator("p:visible")
        .filter({ hasText: /2 accepted patches only/ }),
    ).toBeVisible();
    await page.screenshot({
      path: `work/pin-review-sidebar/browser/accepted-${mobile ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await sidebar
      .getByLabel("Patch scope", { exact: true })
      .selectOption(patch.id);
    await patchReview
      .getByRole("button", { name: "Reject patch and next", exact: true })
      .click();
    await expect(patchReview).toContainText(
      "2 of 2 patches reviewed · 1 accepted.",
    );
    await sidebar
      .getByText("Whole recommendation answer (optional)", { exact: true })
      .filter({ visible: true })
      .click();
    await sidebar
      .getByLabel("Reason Divider review", { exact: true })
      .fill("Keep the offices separate after confirming source geometry.");
    await sidebar
      .getByRole("button", { name: "Next pin", exact: true })
      .click();
    await expect(sidebar).toContainText("No geometric patch is saved");
    await expect(
      sidebar.getByRole("button", { name: "After patch", exact: true }),
    ).toBeDisabled();
    await sidebar
      .getByRole("button", { name: "Previous pin", exact: true })
      .click();
    await expect(
      sidebar.getByLabel("Reason Divider review", { exact: true }),
    ).toHaveValue(
      "Keep the offices separate after confirming source geometry.",
    );
    await sidebar
      .getByLabel("Decision Divider review", { exact: true })
      .selectOption("accept");
    await sidebar
      .getByRole("button", {
        name: "Save decision: Divider review",
        exact: true,
      })
      .click();
    await expect(
      sidebar.getByRole("heading", {
        name: "Divider review · accept",
        exact: true,
      }),
    ).toBeVisible();
    await sidebar
      .getByRole("button", { name: "Current map", exact: true })
      .click();
    await expect(
      sidebar.getByRole("button", { name: "Current map", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const link = page.getByRole("link", { name: /Download reviewed/ });
    await expect(link).toBeVisible({ timeout: 30000 });
    const download = page.waitForEvent("download");
    await link.click();
    const restored = await readIndoorProject(
      new Uint8Array(readFileSync((await (await download).path())!)),
    );
    expect(restored.rooms.nativeBoundaryPatches?.patches[0].status).toBe(
      "proposed",
    );
    expect(
      readPinPatchDecisions(restored).decisions.map((d) => [
        d.patchId,
        d.decision,
      ]),
    ).toEqual([
      [secondPatch.id, "accept"],
      [patch.id, "reject"],
    ]);
    expect(restored.dataset.walls).toEqual(p.dataset.walls);
    expect(restored.dataset.edges).toEqual(p.dataset.edges);
    expect(errors).toEqual([]);
  });
