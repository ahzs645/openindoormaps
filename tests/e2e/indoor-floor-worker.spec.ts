import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Map, GeoJSONSource } from "maplibre-gl";
import { readIndoorProject } from "../../app/indoor-project/package";
import { editorVisitorDataset } from "../../app/indoor-project/map-edits";
import { prepareFloor } from "../../app/indoor-project/prepared-floor";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the UNBC floor-openings viewer.");
const options = {
  showPillars: false,
  showPassThroughPlaces: false,
  showVestibuleDoors: false,
  showStructures: false,
  review: false,
  simplifyGeometry: true,
};
const hash = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
async function instrument(page: Page) {
  await page.goto("/projects/indoor");
  await page.locator('input[type="file"]').waitFor({ state: "attached" });
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
    const { default: lib } = await import(url),
      add = lib.Map.prototype.addSource,
      fit = lib.Map.prototype.fitBounds;
    lib.Map.prototype.addSource = function (
      this: Map,
      ...args: Parameters<Map["addSource"]>
    ) {
      if (args[0] === "project-areas")
        (globalThis as unknown as { workerMap: Map }).workerMap = this;
      return add.apply(this, args);
    };
    lib.Map.prototype.fitBounds = function (
      this: Map,
      ...args: Parameters<Map["fitBounds"]>
    ) {
      const bounds = args[0];
      (globalThis as unknown as { lastFloorBounds: unknown }).lastFloorBounds =
        typeof (bounds as { toArray?: () => unknown }).toArray === "function"
          ? (bounds as { toArray: () => unknown }).toArray()
          : bounds;
      return fit.apply(this, args);
    };
  });
  await page.locator('input[type="file"]').setInputFiles(zip!);
  await expect(page.getByRole("status")).toContainText("Loaded", {
    timeout: 60_000,
  });
}
async function settle(page: Page) {
  await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const m = (globalThis as unknown as { workerMap: Map }).workerMap;
          return !!m && m.loaded() && !m.isMoving();
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}
async function choose(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Open level selector", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open level selector", exact: true }),
  ).toContainText(name);
}
for (const mobile of [false, true])
  test(`rapid changes, room zoom and worker geometry on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const workerURLs: string[] = [];
    page.on("worker", (w) => workerURLs.push(w.url()));
    await instrument(page);
    await settle(page);
    const data = editorVisitorDataset(
      await readIndoorProject(new Uint8Array(readFileSync(zip!))),
    );
    const sourceHash = hash(data);
    await choose(page, "Floor 4");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Preparing Floor 4",
    );
    const start = Date.now();
    await choose(page, "Campus Floor 3");
    await choose(page, "Floor 2");
    const switchingMs = Date.now() - start;
    expect(switchingMs).toBeLessThan(1500);
    await settle(page);
    expect(
      workerURLs.filter((u) => u.includes("floor-presentation.worker")).length,
    ).toBeGreaterThanOrEqual(3);
    const floor = data.floors.find((f) => f.name === "Floor 2")!;
    const expected = prepareFloor(data, floor.levelIds, "all", options);
    const snapshot = await page.evaluate(async () => {
      const m = (globalThis as unknown as { workerMap: Map }).workerMap;
      return {
        rooms: await (
          m.getSource("project-room-blocks") as GeoJSONSource
        ).getData(),
        areas: await (m.getSource("project-areas") as GeoJSONSource).getData(),
        stairs: await (
          m.getSource("project-native-stairs") as GeoJSONSource
        ).getData(),
      };
    });
    expect(hash(snapshot.rooms)).toBe(hash(expected.stairCutRooms));
    expect(hash(snapshot.areas)).toBe(hash(expected.stairCutAreas));
    expect(hash(snapshot.stairs)).toBe(hash(expected.nativeStairs));
    expect(hash(data)).toBe(sourceHash);
    await page
      .getByRole("textbox", { name: "Search indoor map" })
      .fill("05-247");
    await page.getByRole("button", { name: /05-247/ }).click();
    await expect(
      page.getByRole("heading", { name: "Group Study", exact: true }),
    ).toBeVisible();
    await settle(page);
    await choose(page, "Floor 4");
    await settle(page);
    await expect(
      page.getByRole("heading", { name: "Group Study", exact: true }),
    ).toBeVisible();
    await choose(page, "Floor 2");
    await settle(page);
    const points = expected.presentation.display.records.flatMap((r) =>
      r.ringsFeet[0].map((p) => geographicPoint(data, p)),
    );
    const bounds = [
      [
        Math.min(...points.map((p) => p[0])),
        Math.min(...points.map((p) => p[1])),
      ],
      [
        Math.max(...points.map((p) => p[0])),
        Math.max(...points.map((p) => p[1])),
      ],
    ];
    expect(
      await page.evaluate(
        () =>
          (globalThis as unknown as { lastFloorBounds: unknown })
            .lastFloorBounds,
      ),
    ).toEqual(bounds);
    await expect(
      page.getByRole("heading", { name: "Group Study", exact: true }),
    ).toBeVisible();
    const selectedFeatures = await page.evaluate(() => {
      const m = (globalThis as unknown as { workerMap: Map }).workerMap;
      return m.getPaintProperty("project-room-boxes", "fill-extrusion-color");
    });
    expect(JSON.stringify(selectedFeatures)).toContain(
      data.records.find((r) => r.number === "05-247")!.key,
    );
    // 2D switches use the same prepared geometry and do not restart the worker.
    const before = workerURLs.length;
    await page.getByRole("button", { name: "2D rooms", exact: true }).click();
    await settle(page);
    expect(workerURLs.length).toBe(before);
    await page.getByRole("button", { name: "3D rooms", exact: true }).click();
    await settle(page);
    await page.screenshot({
      path: `docs/screenshots/unbc-floor-worker-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
    writeFileSync(
      `work/floor-worker/interaction-${mobile ? "mobile" : "desktop"}.json`,
      JSON.stringify(
        {
          switchingMs,
          workers: workerURLs.length,
          geometryMatches: true,
          manualFloorFitsCampus: true,
          selectionSurvivesFloorChanges: true,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
  });

test("worker startup failure shows retry and recovers without blocking the map", async ({
  page,
}) => {
  test.setTimeout(60_000);
  let blocked = true;
  await page.route("**/floor-presentation.worker.ts?*", (route) =>
    blocked ? route.abort() : route.continue(),
  );
  await instrument(page);
  await expect(page.getByRole("alert")).toContainText(
    "Couldn’t prepare this floor",
    { timeout: 30_000 },
  );
  await page
    .getByRole("button", { name: "Open level selector", exact: true })
    .click();
  await expect(
    page.getByRole("menuitemradio", { name: "Floor 4", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Close floor selector" }).click();
  blocked = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await settle(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
