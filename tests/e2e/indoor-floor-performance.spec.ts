import { expect, test } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import type { Map, GeoJSONSource } from "maplibre-gl";

const zip = process.env.INDOOR_PROJECT_ZIP;
test.skip(!zip || !existsSync(zip), "Provide the combined UNBC project.");

for (const mobile of [false, true]) {
  test(`revisited floors avoid geometry stalls on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').waitFor({ state: "attached" });
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(url);
      const original = lib.Map.prototype.fitBounds;
      lib.Map.prototype.fitBounds = function (
        this: Map,
        ...args: Parameters<Map["fitBounds"]>
      ) {
        (globalThis as unknown as { floorTestMap: Map }).floorTestMap = this;
        return original.apply(this, args);
      };
      const state = globalThis as unknown as { floorTasks: number[] };
      state.floorTasks = [];
      new PerformanceObserver((list) => {
        state.floorTasks.push(
          ...list.getEntries().map((entry) => entry.duration),
        );
      }).observe({ entryTypes: ["longtask"] });
    });
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText(/Loaded/, {
      timeout: 60_000,
    });
    const settle = async () => {
      await expect(page.getByTestId("floor-preparation")).toHaveCount(0, {
        timeout: 30_000,
      });
      return expect
        .poll(
          () =>
            page.evaluate(() => {
              const map = (globalThis as unknown as { floorTestMap: Map })
                .floorTestMap;
              return !!map && map.loaded() && !map.isMoving();
            }),
          { timeout: 30_000 },
        )
        .toBe(true);
    };
    await settle();
    const switchFloor = async (name: string) => {
      await page
        .getByRole("button", { name: "Open level selector", exact: true })
        .click();
      await page.evaluate(() => {
        (globalThis as unknown as { floorTasks: number[] }).floorTasks = [];
      });
      console.log("Switching", name);
      const start = Date.now();
      await page.getByRole("menuitemradio", { name, exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toContainText(name);
      await settle();
      const snapshot = await page.evaluate(async () => {
        const state = globalThis as unknown as {
          floorTestMap: Map;
          floorTasks: number[];
        };
        const data = await (
          state.floorTestMap.getSource("project-room-blocks") as GeoJSONSource
        ).getData();
        return {
          geometry: JSON.stringify(data),
          longestTaskMs: Math.max(0, ...state.floorTasks),
        };
      });
      return { ...snapshot, settledMs: Date.now() - start };
    };
    const names = [
      "Floor 4",
      "Campus Floor 3",
      "Floor 2",
      "Campus Floor 1",
      "Floor 0",
    ];
    type FloorRun = Awaited<ReturnType<typeof switchFloor>> & { floor: string };
    const cold: FloorRun[] = [],
      warm: FloorRun[] = [];
    for (const name of names)
      cold.push({ floor: name, ...(await switchFloor(name)) });
    for (const name of names)
      warm.push({ floor: name, ...(await switchFloor(name)) });
    for (let i = 0; i < names.length; i++)
      expect(warm[i].geometry).toBe(cold[i].geometry);
    expect(errors).toEqual([]);
    const summarize = ({ geometry, ...metrics }: (typeof cold)[number]) =>
      metrics;
    const results = { cold: cold.map(summarize), warm: warm.map(summarize) };
    writeFileSync(
      `${process.env.INDOOR_PERFORMANCE_OUTPUT ?? "docs/unbc-floor-switch"}-${mobile ? "mobile" : "desktop"}.json`,
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(mobile ? "mobile" : "desktop", results);
  });
}
