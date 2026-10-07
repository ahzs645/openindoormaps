import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { project } from "../fixtures/native-area-project";
import {
  exportIndoorProject,
  readIndoorProject,
} from "../../app/indoor-project/package";
import { findProjectRoute } from "../../app/indoor-project/routing";
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
async function outsideProject() {
  const p = await project(),
    d = p.dataset;
  d.records = d.records.slice(0, 2);
  p.rooms.annotations = p.rooms.annotations.slice(0, 2);
  for (const [i, r] of d.records.entries()) {
    r.ringsFeet = [rect(i * 15, 0, 10, 10)];
    r.circulation = true;
    r.arrivalNodeId = i ? "b" : "a";
    r.name = i ? "Outdoor connection" : "Indoor corridor";
  }
  d.nodes = [
    {
      id: "a",
      roomKey: "0",
      levelId: 1,
      building: "01",
      surfaceId: "first",
      pointFeet: [5, 5, 0],
      geographic: [-122, 53],
      kind: "arrival",
    },
    {
      id: "b",
      roomKey: "1",
      levelId: 1,
      building: "01",
      surfaceId: "first",
      pointFeet: [20, 5, 0],
      geographic: [-122, 53],
      kind: "arrival",
    },
  ];
  d.edges = [
    {
      id: "native-walk",
      from: "a",
      to: "b",
      kind: "walk",
      pointsFeet: [
        [5, 5, 0],
        [20, 5, 0],
      ],
      lengthMetres: 15 * 0.3048,
      roomKeys: ["0", "1"],
      accessible: "yes",
      enabled: true,
      evidence: "Supported floor connection",
    },
  ];
  d.walkingSupport = {
    version: 1,
    sourceModelSha256: d.source.modelSha256,
    floors: [
      {
        nativeElementId: 100,
        elevationFeet: 0,
        ringsFeet: [rect(0, 0, 14, 20)],
      },
      {
        nativeElementId: 101,
        elevationFeet: 0,
        ringsFeet: [rect(14, 0, 16, 20), rect(22, 14, 3, 3)],
      },
    ],
  };
  d.walls = [];
  d.doors = [];
  return p;
}
for (const reason of ["outdoor", "off-limits"] as const)
  for (const mobile of [false, true])
    test(`${reason} proposal, application, ZIP persistence and restoration on ${mobile ? "mobile" : "desktop"}`, async ({
      page,
    }) => {
      test.setTimeout(180000);
      const offLimits = reason === "off-limits";
      const classification = offLimits
        ? "Exclude non-traversable footprint"
        : "Outdoors / exclude from indoor map";
      const areaLabel = offLimits
        ? "Non-traversable lip test"
        : "Outdoor bridge test";
      const excludedRegion = offLimits
        ? "Excluded footprints"
        : "Excluded outdoor areas";
      const p = await outsideProject();
      expect(findProjectRoute(p.dataset, "0", "1")).not.toBeNull();
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
        name: "indoor-outdoor-test.reviter.zip",
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
      await expect(panel).toContainText("1 native regions", { timeout: 30000 });
      await panel
        .getByRole("button", { name: "Native slab focus", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: "Slab #101", exact: true })
        .click();
      await expect(panel).toContainText("Exact native slab #101");
      await panel.locator(".native-area-region-list button").first().click();
      await expect(panel).toContainText("1 selected regions");
      await panel
        .getByRole("button", {
          name: "Native area classification",
          exact: true,
        })
        .click();
      await page
        .getByRole("menuitemradio", {
          name: classification,
          exact: true,
        })
        .click();
      await panel
        .getByLabel("Native area label", { exact: true })
        .fill(areaLabel);
      await panel
        .getByLabel("Native area evidence", { exact: true })
        .fill(
          offLimits
            ? "Synthetic non-traversable lip fixture behind a checked railing; exact native footprint selected, adjacent indoor region and real opening retained."
            : "Synthetic exterior slab fixture; exact native bridge footprint selected, indoor slab excluded. Actual source classification requires facade evidence.",
        );
      const action = panel.getByRole("button", {
        name: offLimits
          ? "Exclude non-traversable footprint from selection and routes"
          : "Exclude outdoors from selection and routes",
        exact: true,
      });
      await expect(action).toBeDisabled();
      await panel
        .getByRole("button", { name: "Save proposal", exact: true })
        .click();
      await expect(panel).toContainText("Classification is proposed");
      await expect(panel).toContainText("1 native regions");
      await panel
        .getByRole("checkbox", {
          name: `I checked the full source model and this entire selection is ${offLimits ? "non-traversable" : "outdoors"}`,
          exact: true,
        })
        .check();
      await expect(action).toBeEnabled();
      mkdirSync("work/indoor-outdoor-scope/browser", { recursive: true });
      await panel
        .getByRole("region", {
          name: offLimits ? "Non-traversable exclusion" : "Outdoor exclusion",
        })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `work/indoor-outdoor-scope/browser/${reason}-proposal-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
      await action.click();
      await expect(
        panel.getByRole("region", { name: excludedRegion }),
      ).toContainText(areaLabel);
      await expect(panel).toContainText("0 native regions", { timeout: 30000 });
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 60000,
      });
      await expect(page.getByText("Loading map", { exact: true })).toHaveCount(
        0,
        {
          timeout: 60000,
        },
      );
      await panel
        .getByRole("region", { name: excludedRegion })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `work/indoor-outdoor-scope/browser/${reason}-applied-${mobile ? "mobile" : "desktop"}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Export reviewed project", exact: true })
        .click();
      const link = page.getByRole("link", { name: /Download reviewed/ });
      await expect(link).toBeVisible({ timeout: 30000 });
      const download = page.waitForEvent("download");
      await link.click();
      const bytes = new Uint8Array(
        readFileSync((await (await download).path())!),
      );
      const reopened = await readIndoorProject(bytes);
      for (const mode of ["public", "accessible"] as const)
        expect(findProjectRoute(reopened.dataset, "0", "1", mode)).toBeNull();
      expect(reopened.dataset.indoorExclusions!.areas[0].reason).toBe(reason);
      expect(
        reopened.dataset.indoorExclusions!.areas[0].nativeFloorIds,
      ).toEqual([101]);
      expect(reopened.files["model/review.rvt"]).toEqual(
        p.files["model/review.rvt"],
      );
      expect(reopened.files["gis/reference-points.json"]).toEqual(
        p.files["gis/reference-points.json"],
      );
      expect(reopened.dataset.walkingSupport).toEqual(p.dataset.walkingSupport);
      // Reload recognizes the newly saved exclusion, rather than an older ZIP.
      await page.reload();
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
      await expect(
        panel.getByRole("region", { name: excludedRegion }),
      ).toContainText(areaLabel);
      await panel
        .getByRole("button", {
          name: `Restore indoor scope: ${areaLabel}`,
          exact: true,
        })
        .click();
      await expect(
        panel.getByRole("region", { name: excludedRegion }),
      ).toHaveCount(0);
      await expect(panel).toContainText(
        `${offLimits ? "Footprint" : "Outdoor"} exclusion removed`,
      );
      await expect(panel).toContainText("proposed");
      await expect(panel).toContainText("1 native regions", { timeout: 30000 });
      await panel
        .getByRole("button", { name: "Native slab focus", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: "Slab #101", exact: true })
        .click();
      await expect(panel).toContainText("Selection is limited to slab #101");
      await expect(panel).toContainText("1 native regions", { timeout: 30000 });
      await panel.locator(".native-area-region-list button").first().click();
      await expect(panel).toContainText("1 selected regions");
      await panel
        .getByRole("button", { name: "Native slab focus", exact: true })
        .click();
      await page
        .getByRole("menuitemradio", {
          name: "All native slabs on this level",
          exact: true,
        })
        .click();
      await expect(panel).toContainText("1 native regions", { timeout: 30000 });
      await expect(panel).toContainText("0 selected regions");
      expect(errors).toEqual([]);
    });
