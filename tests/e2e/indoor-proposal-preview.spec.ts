import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Map, GeoJSONSource } from "maplibre-gl";
import { readIndoorProject } from "../../app/indoor-project/package";
const zip = process.env.INDOOR_PROJECT_ZIP;
const output =
  process.env.PROPOSAL_SCREENSHOT_DIR ?? "work/building03-preview/browser";
type W = typeof globalThis & { proposalMap: Map };
for (const mobile of [false, true])
  test(`Building03 proposed solutions remain temporary on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(!zip, "Provide the current review master");
    test.setTimeout(600000);
    const input = await readIndoorProject(readFileSync(zip!));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/openindoormaps/#/projects/indoor");
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance
            .getEntriesByType("resource")
            .some((r) => r.name.includes("/deps/maplibre-gl.js")),
        ),
      )
      .toBe(true);
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((r) => r.includes("/deps/maplibre-gl.js"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas") (globalThis as W).proposalMap = this;
        return add.apply(this, args);
      };
    });
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Import project ZIP", exact: true })
      .click();
    await (await chooser).setFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 90000,
    });
    await page
      .getByRole("button", { name: "Room review", exact: true })
      .click();
    await expect(page.getByTestId("enclosure-counts")).toBeVisible({
      timeout: 300000,
    });
    await page
      .getByRole("button", { name: "Geometry finding", exact: true })
      .click();
    await page
      .getByRole("menuitemradio", { name: "All places", exact: true })
      .click();
    async function select(number: string, name: string) {
      await page
        .getByLabel("Find room enclosure", { exact: true })
        .fill(number);
      await page
        .getByRole("button", {
          name: `Review ${number} · ${name}`,
          exact: true,
        })
        .click();
    }
    const detail = page.getByRole("region", {
      name: "Selected enclosure evidence",
    });
    async function capture(name: string) {
      await expect(page.getByTestId("floor-preparation")).toBeHidden({
        timeout: 90000,
      });
      await page.locator(".maplibregl-canvas").scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          page.evaluate(() => (globalThis as W).proposalMap?.loaded()),
        )
        .toBe(true);
      mkdirSync(output, { recursive: true });
      await page.screenshot({
        path: `${output}/${mobile ? "mobile" : "desktop"}-${name}.png`,
      });
    }
    async function overlay() {
      return page.evaluate(async () => {
        const source = (globalThis as W).proposalMap?.getSource(
          "boundary-proposal-preview",
        ) as GeoJSONSource | undefined;
        return source ? await source.getData() : null;
      });
    }
    await select("03-3025", "Office");
    await detail.getByRole("button", { name: "2D", exact: true }).click();
    await capture("original");
    await detail
      .getByRole("button", { name: "Preview proposed solution", exact: true })
      .click();
    await expect(detail).toContainText(
      "Boundary preview ready · 1 matching regions · 1 place labels",
      { timeout: 120000 },
    );
    await expect
      .poll(async () => JSON.stringify(await overlay()))
      .toContain("patch");
    const joined = (await overlay()) as { features: { properties: { kind: string } }[] };
    expect(joined.features.filter(f => f.properties.kind === "region")).toHaveLength(1);
    await capture("wall-preview");
    await detail
      .getByRole("button", { name: "Show original geometry", exact: true })
      .click();
    await expect.poll(overlay).toBe(null);
    await detail
      .getByRole("button", { name: "Preview native windows", exact: true })
      .click();
    await expect(
      detail.getByRole("button", {
        name: "Show original windows",
        exact: true,
      }),
    ).toBeVisible();
    await capture("windows-preview");
    await detail
      .getByRole("button", { name: "Show original windows", exact: true })
      .click();
    await select("03-S303", "Stair");
    await detail
      .getByRole("button", { name: "Preview proposed walkway", exact: true })
      .click();
    await expect(detail).toContainText(
      "Blue shows the proposed slab-supported landing",
    );
    await expect
      .poll(async () => JSON.stringify(await overlay()))
      .toContain("walkway");
    await capture("landing-2d");
    await detail.getByRole("button", { name: "3D", exact: true }).click();
    await capture("landing-3d");
    await detail
      .getByRole("button", { name: "Native heights", exact: true })
      .click();
    await capture("landing-native-heights");
    await detail
      .getByRole("button", { name: "Show original walkway", exact: true })
      .click();
    await expect.poll(overlay).toBe(null);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download review report", exact: true })
      .click();
    const report = JSON.parse(
      readFileSync((await (await download).path())!, "utf8"),
    );
    expect(report.source.modelSha256).toBe(input.dataset.source.modelSha256);
    expect(report.datasetSha256).toBe(
      createHash("sha256").update(JSON.stringify(input.dataset)).digest("hex"),
    );
    expect(report.enclosureProposals).toEqual(input.rooms.enclosureProposals);
    expect(
      input.rooms.nativeBoundaryPatches!.patches.find(
        (p) =>
          p.levelId === 402367 &&
          p.wallEvidence.some((w) => w.nativeElementId === 1069165),
      )!.status,
    ).toBe("proposed");
    expect(errors).toEqual([]);
  });
