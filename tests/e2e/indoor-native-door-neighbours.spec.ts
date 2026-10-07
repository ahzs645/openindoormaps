import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { gapProject } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
for (const mobile of [false, true])
  test(`explicit selection across a closed native door on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    const p = await gapProject();
    p.dataset.doors = [
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
    const before = JSON.stringify({
      nodes: p.dataset.nodes,
      edges: p.dataset.edges,
      doors: p.dataset.doors,
      floors: p.dataset.walkingSupport,
      records: p.dataset.records,
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/openindoormaps/#/projects/indoor");
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import project ZIP", exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "door-neighbours.reviter.zip",
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
    await expect(panel).toContainText("2 native regions");
    await panel.getByLabel("Find native region", { exact: true }).fill("01-0");
    await panel.locator(".native-area-region-list button").click();
    await expect(panel).toContainText("1 selected regions");
    const neighbours = panel.getByText("Neighbouring areas across doors · 1", {
      exact: true,
    });
    await neighbours.click();
    await expect(
      panel.getByRole("button", {
        name: "Show connecting door #300",
        exact: true,
      }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Add area across door #300", exact: true })
      .click();
    await expect(panel).toContainText("2 selected regions");
    await expect(neighbours).toHaveCount(0);
    await expect(
      panel.getByLabel("01-0 · Office", { exact: true }),
    ).not.toBeChecked();
    await expect(
      panel.getByLabel("01-1 · Corridor", { exact: true }),
    ).not.toBeChecked();
    await panel
      .getByRole("heading", { name: "Check the enclosure", exact: true })
      .scrollIntoViewIfNeeded();
    mkdirSync("work/building-10-selection/browser", { recursive: true });
    await page.screenshot({
      path: `work/building-10-selection/browser/door-selection-${mobile ? "mobile" : "desktop"}.png`,
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
      JSON.stringify({
        nodes: reopened.dataset.nodes,
        edges: reopened.dataset.edges,
        doors: reopened.dataset.doors,
        floors: reopened.dataset.walkingSupport,
        records: reopened.dataset.records,
      }),
    ).toBe(before);
    expect(errors).toEqual([]);
  });
