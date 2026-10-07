import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { gapProject } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";

for (const mobile of [false, true]) {
  for (const bypass of [false, true]) {
    test(`pass-through threshold ${bypass ? "same-region" : "neighbour"} preview on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const project = await gapProject();
      project.dataset.doors = [
        {
          id: "door",
          nativeElementId: 300,
          levelId: 1,
          pointFeet: [15, 10],
          normalFeet: [1, 0],
          footprintFeet: [
            [14.8, 7.25],
            [15.2, 7.25],
            [15.2, 12.75],
            [14.8, 12.75],
          ],
          roomKeys: ["0", "1"],
          state: "connected",
        },
      ];
      if (bypass) project.dataset.walls[0].ringsFeet[0][2][1] = 6;
      if (bypass) project.dataset.walls[0].ringsFeet[0][3][1] = 6;
      const preserved = (p: typeof project) =>
        JSON.stringify({
          records: p.dataset.records,
          nodes: p.dataset.nodes,
          edges: p.dataset.edges,
          doors: p.dataset.doors,
          walls: p.dataset.walls,
          floors: p.dataset.walkingSupport,
        });
      const before = preserved(project);
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
        name: "pass-through.reviter.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(await exportIndoorProject(project)),
      });
      await expect(page.locator(".project-status")).toContainText("Loaded");
      const review = page.getByRole("button", {
        name: "Review project",
        exact: true,
      });
      if (await review.isVisible()) await review.click();
      await page
        .getByRole("button", { name: "Native areas", exact: true })
        .click();
      const panel = page.getByRole("region", { name: "Native area decisions" });
      await expect(panel).toContainText(`${bypass ? 1 : 2} native regions`);
      await panel
        .getByLabel("Find native region", { exact: true })
        .fill("01-0");
      await panel.locator(".native-area-region-list button").click();
      await panel
        .getByText(
          bypass
            ? "Inspect door checks · 1"
            : "Neighbouring areas across doors · 1",
          { exact: true },
        )
        .click();
      await panel
        .getByRole("button", {
          name: "Preview pass-through threshold #300",
          exact: true,
        })
        .click();
      await expect(panel).toContainText("1 native regions");
      await expect(
        panel.getByRole("button", {
          name: "Close selection threshold #300",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel.getByRole("region", { name: "Pass-through threshold previews" }),
      ).toContainText("Physical doors, access and routes remain unchanged");
      await panel.locator(".native-area-region-list button").click();
      await expect(
        panel.getByLabel("01-0 · Office", { exact: true }),
      ).not.toBeChecked();
      await expect(
        panel.getByLabel("01-1 · Corridor", { exact: true }),
      ).not.toBeChecked();
      await panel
        .getByLabel("Native area label", { exact: true })
        .fill("Vestibule threshold preview");
      await panel
        .getByLabel("Native area evidence", { exact: true })
        .fill(
          "Explicit measured door-floor preview; routing and physical door preserved.",
        );
      await panel
        .getByRole("button", { name: "Save proposal", exact: true })
        .click();
      await expect(panel).toContainText("Saved area decisions · 1");
      await panel
        .getByRole("button", {
          name: "Close selection threshold #300",
          exact: true,
        })
        .click();
      await expect(panel).toContainText(`${bypass ? 1 : 2} native regions`);
      await expect(
        panel.getByRole("region", { name: "Pass-through threshold previews" }),
      ).toHaveCount(0);
      await panel
        .getByRole("button", { name: /Vestibule threshold preview · Hallway/ })
        .click();
      await expect(
        panel.getByRole("button", {
          name: "Close selection threshold #300",
          exact: true,
        }),
      ).toBeVisible();
      await expect(panel).toContainText("1 selected regions");
      await expect(page.getByText("Loading map", { exact: true })).toBeHidden({
        timeout: 60000,
      });
      await expect(page.getByTestId("floor-preparation")).toBeHidden({
        timeout: 60000,
      });
      await panel
        .getByRole("region", { name: "Pass-through threshold previews" })
        .scrollIntoViewIfNeeded();
      mkdirSync("work/vestibule-20261005/browser", { recursive: true });
      await page.screenshot({
        path: `work/vestibule-20261005/browser/${bypass ? "same-region" : "neighbour"}-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Export reviewed project", exact: true })
        .click();
      const link = page.getByRole("link", { name: /Download reviewed/ });
      await expect(link).toBeVisible();
      const download = page.waitForEvent("download");
      await link.click();
      const reopened = await readIndoorProject(
        new Uint8Array(readFileSync((await (await download).path())!)),
      );
      expect(
        reopened.rooms.nativeAreaReviews!.decisions[0].selectionOptions
          ?.passThroughDoorIds,
      ).toEqual([300]);
      expect(preserved(reopened)).toBe(before);
      expect(errors).toEqual([]);
    });
  }
}
