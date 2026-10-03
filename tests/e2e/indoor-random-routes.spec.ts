import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { calculateRoute } from "../../app/indoor-project/route-calculation";

type Sample = {
  mode: "public" | "accessible";
  status: string;
  start: string;
  end: string;
  graphReachable: boolean;
  calculationMs: number;
};
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
const report: { rows: Sample[] } = JSON.parse(
  readFileSync(
    new URL("../../docs/unbc-random-routing-audit.json", import.meta.url),
    "utf8",
  ),
);
const available = report.rows.filter(
  (r) => r.mode === "public" && r.status === "available",
);
const samples = [
  available[0],
  available[Math.floor(available.length / 2)],
  ...[...available]
    .sort((a, b) => b.calculationMs - a.calculationMs)
    .slice(0, 2),
  report.rows.find(
    (r) => r.mode === "public" && r.graphReachable && r.status === "blocked",
  )!,
  report.rows.find((r) => r.mode === "public" && !r.graphReachable)!,
];
test.skip(
  !data ||
    samples.some(
      (s) =>
        !data.records.some((r) => r.key === s.start) ||
        !data.records.some((r) => r.key === s.end),
    ),
  "Provide the UNBC master with the sampled source endpoints.",
);
for (const mobile of [false, true])
  test(`seeded multifloor samples match worker results on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    const timings: {
      start: string;
      end: string;
      mode: string;
      elapsedMs: number;
    }[] = [];
    for (const sample of [
      ...samples,
      { ...samples[0], mode: "accessible" as const },
    ]) {
      const expected = calculateRoute(
        data!,
        sample.start,
        sample.end,
        sample.mode,
      );
      const began = Date.now();
      await page
        .getByLabel("Route start", { exact: true })
        .selectOption(sample.start);
      await page
        .getByLabel("Route destination", { exact: true })
        .selectOption(sample.end);
      await page
        .getByLabel("Route profile", { exact: true })
        .selectOption(sample.mode);
      await expect(page.getByTestId("project-route-calculating")).toHaveCount(
        0,
        { timeout: 30_000 },
      );
      const result = page.getByTestId("project-route-result");
      if (expected.route) {
        await expect(result).toContainText(
          `${expected.route.distanceMetres.toFixed(1)} m`,
        );
        await expect(result).toContainText(
          `${expected.route.edges.filter((e) => e.kind === "stairs" || e.kind === "local-steps").length} step/stair transitions`,
        );
      } else await expect(result).toContainText(expected.diagnostic!.message);
      timings.push({
        start: sample.start,
        end: sample.end,
        mode: sample.mode,
        elapsedMs: Date.now() - began,
      });
    }
    await test.info().attach("random-route-worker-timings", {
      body: JSON.stringify(timings),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  });
