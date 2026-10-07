import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import {
  enclosureItems,
  enclosureEvidenceText,
} from "../../app/indoor-project/enclosure-review";
import { readIndoorProject } from "../../app/indoor-project/package";
import { createHash } from "node:crypto";
import type { VolumeAudit } from "../../app/indoor-project/volume-coverage";
const zip = process.env.INDOOR_PROJECT_ZIP;
const auditPath = process.env.INDOOR_VOLUME_AUDIT;
const output = "work/room-review-proposals/browser";
for (const mobile of [false, true])
  test(`room evidence review on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(
      !zip || !auditPath,
      "Provide a master ZIP and its shared audit report.",
    );
    test.setTimeout(300_000);
    const expected: VolumeAudit = JSON.parse(readFileSync(auditPath!, "utf8"));
    const all = enclosureItems(expected);
    const missing = all.filter(
      (r) => r.status === "unsupported-room-enclosure",
    );
    const upper = missing.find((r) =>
      r.scopes.some((s) => s.scope === "campus-floor" && s.name === "Floor 2"),
    )!;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/openindoormaps/#/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Room review", exact: true })
      .click();
    await expect(page.getByTestId("enclosure-counts")).toContainText(
      String(missing.length),
      { timeout: 180_000 },
    );
    await expect(page.getByTestId("enclosure-counts")).toContainText(
      all.filter((r) => r.status === "block-present").length.toLocaleString(),
    );
    await expect(page.locator(".enclosure-revision")).toContainText(
      expected.datasetSha256.slice(0, 12),
    );
    await page
      .getByRole("button", { name: "Review building", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", {
        name: `Building ${upper.building}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Review floor", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Floor 2", exact: true })
      .click();
    await page
      .getByLabel("Find room enclosure", { exact: true })
      .fill(upper.number);
    await page
      .getByRole("button", {
        name: `Review ${upper.number} · ${upper.name}`,
        exact: true,
      })
      .click();
    const detail = page.getByRole("region", {
      name: "Selected enclosure evidence",
    });
    await expect(detail).toContainText(upper.key);
    const proposals = JSON.parse(
      readFileSync("public/review/enclosure-proposals.json", "utf8"),
    );
    const proposed = proposals.records.find(
      (r: { key: string }) => r.key === upper.key,
    );
    const card = page.getByRole("region", { name: "Proposed room solution" });
    await expect(card).toContainText(proposed.solution);
    await expect(card).toContainText("correction not applied");
    await expect(page.locator(".enclosure-proposal-status")).toContainText(
      `${proposals.records.length} proposed solutions`,
    );
    await card
      .getByRole("button", {
        name: "Use proposal as review notes",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Enclosure review notes", { exact: true }),
    ).toHaveValue(/Proposed correction/);
    await page
      .getByRole("button", { name: "Save proposals in project", exact: true })
      .click();
    await expect(page.locator(".enclosure-proposal-status")).toContainText(
      "Included in reviewed project exports",
    );
    await expect(
      page.getByRole("button", { name: "Stop audit", exact: true }),
    ).toHaveCount(0);
    // A wrong model import must preserve the existing catalog and project.
    await page
      .getByLabel("Import enclosure proposals", { exact: true })
      .setInputFiles({
        name: "wrong-model.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({ ...proposals, modelSha256: "0".repeat(64) }),
        ),
      });
    await expect(page.getByRole("alert")).toContainText("another source model");
    await expect(card).toContainText(proposed.solution);
    await expect(
      page.getByRole("button", { name: "Open level selector" }),
    ).toContainText("Floor 2");
    await detail.getByRole("button", { name: "2D", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "2D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await detail.getByRole("button", { name: "3D", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "3D rooms", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await detail
      .getByRole("button", { name: "Source model", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Source model", exact: true }).last(),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("enclosure-source-status")).toContainText(
      `native level #${upper.nativeLevel} section`,
      { timeout: 60_000 },
    );
    await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
      timeout: 60_000,
    });
    // Wait for both the native GLB and the floor's prepared map layers before
    // capturing source evidence; loading status alone doesn't prove a view.
    await page.waitForTimeout(750);
    mkdirSync(output, { recursive: true });
    await page.screenshot({
      path: `${output}/source-${mobile ? "mobile" : "desktop"}.png`,
    });
    await detail
      .getByRole("button", { name: "Enclosure decision", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "Needs correction", exact: true })
      .click();
    const note = `Browser ${mobile ? "mobile" : "desktop"} review: verify native door and inside wall faces.`;
    await page.getByLabel("Enclosure review notes", { exact: true }).fill(note);
    await page
      .getByRole("button", { name: "Save room review", exact: true })
      .click();
    await expect(detail).toContainText("Review saved.");
    await expect(page.getByTestId("enclosure-counts")).toContainText(
      String(missing.length - 1),
    );
    const reporting = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download review report", exact: true })
      .click();
    const reportDownload = await reporting;
    const savedReport = JSON.parse(
      readFileSync((await reportDownload.path())!, "utf8"),
    );
    expect(savedReport.datasetSha256).toBe(expected.datasetSha256);
    expect(savedReport.views).toEqual(expected.views);
    expect(savedReport.enclosureReviews.records[upper.key].notes).toBe(note);
    expect(savedReport.enclosureProposals.records.length).toBe(
      proposals.records.length,
    );
    // Saving authoring notes must not restart the detector or hide a geometry finding.
    await expect(
      page.getByRole("button", { name: "Stop audit", exact: true }),
    ).toHaveCount(0);
    await expect(detail).toContainText("Enclosure needs evidence");
    await page
      .getByRole("button", { name: "Export reviewed project", exact: true })
      .click();
    const downloadLink = page.getByRole("link", {
      name: "Download reviewed ZIP",
      exact: true,
    });
    await expect(downloadLink).toBeVisible({ timeout: 60_000 });
    const downloading = page.waitForEvent("download");
    await downloadLink.click();
    const downloaded = await downloading;
    const exported = await readIndoorProject(
      readFileSync((await downloaded.path())!),
    );
    expect(exported.rooms.enclosureReviews?.records[upper.key].notes).toBe(
      note,
    );
    expect(exported.rooms.enclosureProposals).toEqual(proposals);
    expect(
      exported.rooms.enclosureReviews?.records[upper.key].evidenceSha256,
    ).toBe(expected.reviewEvidenceSha256);
    expect(
      createHash("sha256")
        .update(enclosureEvidenceText(exported.dataset))
        .digest("hex"),
    ).toBe(expected.reviewEvidenceSha256);
    await detail.getByRole("button", { name: "2D", exact: true }).click();
    await card.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const map = await page
      .getByRole("region", { name: "Indoor campus map", exact: true })
      .boundingBox();
    expect(map!.width).toBeGreaterThan(mobile ? 300 : 500);
    expect(map!.height).toBeGreaterThan(250);
    const panel = await page.locator(".project-sidebar").boundingBox();
    expect(panel!.height).toBeGreaterThan(220);
    if (mobile) expect(panel!.y).toBeGreaterThanOrEqual(map!.y + map!.height);
    mkdirSync(output, { recursive: true });
    await page.screenshot({
      path: `${output}/${mobile ? "mobile" : "desktop"}.png`,
    });
    await page.getByRole("button", { name: "Clear map", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Room review", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Room enclosure review", { exact: true }),
    ).toHaveCount(0);
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(
      page.getByRole("button", { name: "Room review", exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await page
      .getByRole("button", { name: "Room review", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stop audit", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stop audit", exact: true }).click();
    await expect(
      page.getByText("Audit stopped. Run it again to rebuild the queue.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("enclosure-counts")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

// Changing pitch immediately after the first room pick must not cancel its fit.
// Use the imported project's own geometry rather than a campus-specific extent.
test("first room review focus survives a rapid mobile view switch", async ({
  page,
}) => {
  test.skip(!zip, "Provide an indoor project ZIP.");
  test.setTimeout(300_000);
  const project = await readIndoorProject(readFileSync(zip!));
  const blocks = new Set(
    project.dataset.presentation?.rooms.map((room) => room.roomKey),
  );
  const room = project.dataset.records.find(
    (record) =>
      blocks.has(record.key) &&
      !record.circulation &&
      !record.stair &&
      record.access !== "staff" &&
      (!process.env.INDOOR_FOCUS_ROOM ||
        record.number === process.env.INDOOR_FOCUS_ROOM),
  );
  expect(room, "The project must contain a raised room to focus").toBeTruthy();
  const { geographicPoint } = await import("../../app/indoor-project/routing");
  const corners = room!.ringsFeet[0].map((point) =>
    geographicPoint(project.dataset, point),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/openindoormaps/#/projects/indoor");
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .some((entry) =>
            /\/(?:deps\/maplibre-gl|assets\/maplibre-[^/]+)\.js(?:\?|$)/.test(
              entry.name,
            ),
          ),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const path = performance
      .getEntriesByType("resource")
      .find((entry) =>
        /\/(?:deps\/maplibre-gl|assets\/maplibre-[^/]+)\.js(?:\?|$)/.test(
          entry.name,
        ),
      )!.name;
    const module = await import(path);
    // Vite dev exposes the default library; the production manual chunk
    // exposes its cached CommonJS module factory. Both share the live Map class.
    const library =
      module.default ??
      Object.values(module).find((value: any) => value?.Map) ??
      (
        Object.values(module).find(
          (value) => typeof value === "function",
        ) as () => any
      )();
    const addSource = library.Map.prototype.addSource;
    library.Map.prototype.addSource = function (
      ...args: Parameters<typeof addSource>
    ) {
      if (args[0] === "project-areas")
        (
          globalThis as typeof globalThis & {
            enclosureFocusMap?: import("maplibre-gl").Map;
          }
        ).enclosureFocusMap = this;
      return addSource.apply(this, args);
    };
  });
  await page.locator('input[type="file"]').setInputFiles(zip!);
  await expect(page.locator(".project-status")).toContainText("Loaded", {
    timeout: 150_000,
  });
  await page.getByRole("button", { name: "Room review", exact: true }).click();
  await expect(page.getByTestId("enclosure-counts")).toBeVisible({
    timeout: 180_000,
  });
  await page
    .getByRole("button", { name: "Geometry finding", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "All places", exact: true })
    .click();
  await page
    .getByLabel("Find room enclosure", { exact: true })
    .fill(room!.number);
  await page
    .getByRole("button", {
      name: `Review ${room!.number} · ${room!.name}`,
      exact: true,
    })
    .click();
  // Avoid an actionability delay that lets the first focus finish and hides the
  // race. This remains a real first room pick followed by its visible 2D button.
  await page
    .getByRole("region", { name: "Selected enclosure evidence" })
    .getByRole("button", { name: "2D", exact: true })
    .click({ force: true });
  await expect(page.getByTestId("floor-preparation")).toBeHidden({
    timeout: 90_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate((points) => {
          const map = (
            globalThis as typeof globalThis & {
              enclosureFocusMap?: import("maplibre-gl").Map;
            }
          ).enclosureFocusMap;
          if (!map?.loaded() || map.isMoving()) return false;
          const projected = points.map((point) => map.project(point));
          const xs = projected.map((point) => point.x),
            ys = projected.map((point) => point.y);
          const left = Math.min(...xs),
            right = Math.max(...xs),
            top = Math.min(...ys),
            bottom = Math.max(...ys);
          const center = { x: (left + right) / 2, y: (top + bottom) / 2 };
          const container = map.getContainer();
          return (
            center.x >= 0 &&
            center.x <= container.clientWidth &&
            center.y >= 0 &&
            center.y <= container.clientHeight &&
            Math.max(right - left, bottom - top) >= 40 &&
            map.getPitch() < 0.1
          );
        }, corners),
      {
        timeout: 90_000,
        message: "The first room must remain visibly focused in 2D",
      },
    )
    .toBe(true);
});
