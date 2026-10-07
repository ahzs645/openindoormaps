import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { gapProject } from "../fixtures/native-area-project";
import {
  deriveNativeAreas,
  saveNativeBoundaryPatches,
} from "../../app/indoor-project/native-area-review";
import { nativeBoundaryPatchFile } from "../../app/indoor-project/native-boundary-patch-file";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";

for (const mobile of [false, true]) {
  test(`portable geometry corrections import as proposals on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const p = await gapProject();
    const result = await deriveNativeAreas(p.dataset, 1, { maxGapFeet: 6 });
    const applied = await saveNativeBoundaryPatches(
      p,
      result,
      [result.gapCandidates![0].id],
      "Reviewed precise native partition ends; real floor hole and doorway remain.",
      true,
    );
    const file = nativeBoundaryPatchFile(applied);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/openindoormaps/#/projects/indoor");
    const projectChooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import project ZIP", exact: true })
      .click();
    await (
      await projectChooser
    ).setFiles({
      name: "original.reviter.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(await exportIndoorProject(p)),
    });
    await expect(page.locator(".project-status")).toContainText("Loaded");
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
    const patchChooser = page.waitForEvent("filechooser");
    await panel
      .getByRole("button", { name: "Import geometry patch JSON", exact: true })
      .click();
    await (
      await patchChooser
    ).setFiles({
      name: "corrections.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await expect(panel).toContainText("1 new boundary proposals imported");
    await expect(panel).toContainText("Saved boundary patches · 1");
    await expect(panel).toContainText("1 native regions");
    await panel.getByRole("button", { name: /Preview saved boundary/ }).click();
    await expect(panel).toContainText("2 native regions");
    const exported = page.waitForEvent("download");
    await panel
      .getByRole("button", { name: "Export geometry patch JSON", exact: true })
      .click();
    const exportedFile = JSON.parse(
      readFileSync((await (await exported).path())!, "utf8"),
    );
    expect(exportedFile.nativeBoundaryPatches.patches[0].status).toBe(
      "proposed",
    );
    expect(exportedFile.nativeBoundaryPatches.patches[0].ringsFeet).toEqual(
      file.nativeBoundaryPatches.patches[0].ringsFeet,
    );
    const badChooser = page.waitForEvent("filechooser");
    await panel
      .getByRole("button", { name: "Import geometry patch JSON", exact: true })
      .click();
    await (
      await badChooser
    ).setFiles({
      name: "wrong-model.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          ...file,
          source: { ...file.source, modelSha256: "d".repeat(64) },
        }),
      ),
    });
    await expect(panel).toContainText("different source model");
    await expect(panel).toContainText("Saved boundary patches · 1");
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const reviewedDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: /Download reviewed/ }).click();
    const reviewed = await readIndoorProject(
      new Uint8Array(readFileSync((await (await reviewedDownload).path())!)),
    );
    expect(reviewed.rooms.nativeBoundaryPatches).toEqual(
      exportedFile.nativeBoundaryPatches,
    );
    expect(reviewed.dataset.walls.some((w) => w.reviewPatchId)).toBe(false);
    expect(reviewed.files["model/review.rvt"]).toEqual(
      p.files["model/review.rvt"],
    );
    await panel
      .getByRole("button", { name: "Export geometry patch JSON", exact: true })
      .scrollIntoViewIfNeeded();
    mkdirSync("work/office-patch-investigation/sidecar/browser", {
      recursive: true,
    });
    await page.screenshot({
      path: `work/office-patch-investigation/sidecar/browser/patch-file-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
  });
}
