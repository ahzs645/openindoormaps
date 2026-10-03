import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import type { ProjectRoute } from "../../app/indoor-project/routing";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectFloorName } from "../../app/indoor-project/navigation-steps";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
test.skip(
  !data ||
    !(data as IndoorDataset & { preparedRouting?: unknown }).preparedRouting,
  "Set INDOOR_PROJECT_ZIP to a routing-prepared campus ZIP.",
);
for (const mobile of [false, true])
  test(`prepared routes and floor following on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [],
      timings = [],
      geometry = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Observe real route-worker replies without changing their data or scheduling.
    await page.addInitScript(() => {
      const Original = globalThis.Worker;
      const state = globalThis as unknown as {
        preparedRouteReplies: unknown[];
      };
      state.preparedRouteReplies = [];
      globalThis.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener("message", (event) => {
            if (event.data?.value?.route)
              state.preparedRouteReplies.push(event.data.value.route);
          });
        }
      };
    });
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 980 },
    );
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    for (const [from, to] of [
      ["06-260", "07-240"],
      ["05-113", "07-148A"],
      ["07-148A", "10-4544"],
    ]) {
      await page.getByLabel("Search indoor map", { exact: true }).fill(to);
      await page.getByRole("button", { name: new RegExp(`${to} ·`) }).click();
      await page
        .getByRole("button", { name: "Directions", exact: true })
        .click();
      const started = Date.now();
      await page.getByLabel("Route start", { exact: true }).fill(from);
      await page.getByRole("option", { name: new RegExp(`${from} ·`) }).click();
      await expect(
        page.getByRole("button", { name: "Preview directions", exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      timings.push({ from, to, uiMilliseconds: Date.now() - started });
      const actual = await page.evaluate(
        () =>
          (
            globalThis as unknown as { preparedRouteReplies: ProjectRoute[] }
          ).preparedRouteReplies.at(-1)!,
      );
      const a = data!.records.find((r) => r.number === from)!,
        b = data!.records.find((r) => r.number === to)!;
      const expected = findProjectRoute(data!, a.key, b.key)!;
      expect(actual.edges.map((e) => e.id)).toEqual(
        expected.edges.map((e) => e.id),
      );
      writeFileSync(
        `work/prepared-routing/browser-geometry-${mobile ? "mobile" : "desktop"}-${from}.json`,
        JSON.stringify({ actual: actual.paths, expected: expected.paths }),
      );
      const segmentDistance = (p: number[], a: number[], b: number[]) => {
        const delta = a.map((v, k) => b[k] - v),
          l2 = delta.reduce((n, v) => n + v * v, 0);
        const t = Math.max(
          0,
          Math.min(
            1,
            p.reduce((n, v, k) => n + (v - a[k]) * delta[k], 0) / (l2 || 1),
          ),
        );
        return Math.hypot(...p.map((v, k) => v - a[k] - t * delta[k]));
      };
      const deviation = (points: number[][], guide: number[][]) =>
        Math.max(
          ...points.map((p) =>
            Math.min(
              ...guide.slice(1).map((b, j) => segmentDistance(p, guide[j], b)),
            ),
          ),
        );
      expect(actual.paths).toHaveLength(expected.paths.length);
      for (let i = 0; i < expected.paths.length; i++) {
        expect(actual.paths[i].edgeIds).toEqual(expected.paths[i].edgeIds);
        expect(
          deviation(actual.paths[i].pointsFeet, expected.paths[i].pointsFeet),
        ).toBeLessThan(0.6);
        expect(
          deviation(expected.paths[i].pointsFeet, actual.paths[i].pointsFeet),
        ).toBeLessThan(0.6);
      }
      geometry.push({
        start: a.key,
        end: b.key,
        edgeIds: actual.edges.map((e) => e.id),
        paths: actual.paths.filter(
          (p) => p.centered || p.sourceReason === "validated-source",
        ),
      });
      expect(actual.paths.some((p) => p.preparedGuideUsed)).toBe(true);
      await page
        .getByRole("button", { name: "Preview directions", exact: true })
        .click();
      if (from === "06-260") {
        await expect(
          page.getByRole("progressbar", { name: /^Preparing / }),
        ).toBeHidden({ timeout: 60_000 });
        await page.screenshot({
          path: `docs/screenshots/unbc-prepared-routing-${mobile ? "mobile" : "desktop"}.png`,
        });
      }
      const progress = page.getByRole("progressbar", {
        name: "Route progress",
        exact: true,
      });
      const last = Number(await progress.getAttribute("aria-valuemax"));
      for (let i = 0; i < last; i++)
        await page
          .getByRole("button", { name: "Next step", exact: true })
          .click();
      await expect(progress).toHaveAttribute("aria-valuenow", String(last));
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toContainText(projectFloorName(data!, b.levelId));
      await (
        mobile
          ? expect(page.getByTestId("mobile-current-instruction"))
          : expect(
              page
                .getByTestId("hospital-step-list")
                .getByRole("button", { name: /Arrive at/ }),
            )
      ).toContainText(to);
      await page
        .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
        .filter({ visible: true })
        .click();
      await page
        .getByRole("button", { name: "Back", exact: true })
        .filter({ visible: true })
        .click();
    }
    expect(errors).toEqual([]);
    writeFileSync(
      `work/prepared-routing/ui-${mobile ? "mobile" : "desktop"}.json`,
      JSON.stringify({ timings, geometry }, null, 2),
    );
  });
