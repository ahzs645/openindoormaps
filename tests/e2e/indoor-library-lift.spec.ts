import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { findProjectRoute } from "../../app/indoor-project/routing";
import { projectNavigationSteps } from "../../app/indoor-project/navigation-steps";
const zip = process.env.INDOOR_PROJECT_ZIP;
const data: IndoorDataset | undefined =
  zip && existsSync(zip)
    ? JSON.parse(strFromU8(unzipSync(readFileSync(zip))["viewer/indoor.json"]))
    : undefined;
for (const mobile of [false, true])
  test(`Library elevator and public corridor on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.skip(
      !data?.connectors?.some((c) => c.id === "unbc-library-lift"),
      "Set INDOOR_PROJECT_ZIP to a regenerated Library elevator project.",
    );
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.goto("/projects/indoor");
    await page.locator('input[type="file"]').setInputFiles(zip!);
    await expect(page.locator(".project-status")).toContainText("Loaded", {
      timeout: 45_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByLabel("Find project area", { exact: true }).fill("07-113A");
    await page
      .getByRole("button", { name: "07-113A · Corridor · #311", exact: true })
      .click();
    await expect(page.getByLabel("Area access", { exact: true })).toHaveValue(
      "public",
    );
    await expect(
      page.getByRole("button", { name: "Use as start", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText(
        "Native floor and wall circulation boundary · navigation regenerated",
        { exact: true },
      ),
    ).toBeVisible();
    const c = data!.connectors!.find((c) => c.id === "unbc-library-lift")!;
    expect(c.entrances).toHaveLength(4);
    for (const [a, b] of [
      [c.entrances[0], c.entrances.at(-1)!],
      [c.entrances.at(-1)!, c.entrances[0]],
    ]) {
      await page
        .getByLabel("Route start", { exact: true })
        .selectOption(a.roomKey);
      await page
        .getByLabel("Route destination", { exact: true })
        .selectOption(b.roomKey);
      await expect(page.getByTestId("project-route-result")).not.toContainText(
        "No verified route",
      );
      await page
        .getByRole("button", { name: "Explore map", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Get directions", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Preview directions", exact: true })
        .click();
      const route = findProjectRoute(data!, a.roomKey, b.roomKey)!;
      expect(
        route.edges.some((e) => e.connectorId === "unbc-library-lift"),
      ).toBe(true);
      const steps = projectNavigationSteps(
        data!,
        route,
        "Departure",
        "Destination",
      );
      const index = steps.findIndex((s) => s.networkType === "elevator");
      expect(index).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < index; i++)
        await page
          .getByRole("button", { name: "Next step", exact: true })
          .click();
      await expect(page.getByTestId("project-navigation")).toContainText(
        steps[index].message,
      );
      await expect(
        page.getByRole("button", { name: "Open level selector", exact: true }),
      ).toContainText(
        data!.floors.find((f) => f.levelIds.includes(b.levelId))!.name,
        { timeout: 30_000 },
      );
      if (mobile)
        await expect(page.getByTestId("mobile-current-instruction")).toHaveText(
          steps[index].message,
        );
      await page.screenshot({
        path: `${process.env.INDOOR_SCREENSHOT_DIR ?? "docs/screenshots"}/unbc-library-lift-${a.levelId}-${b.levelId}-${mobile ? "mobile" : "desktop"}.png`,
      });
      await page
        .getByRole("button", { name: mobile ? "Close" : "Back", exact: true })
        .filter({ visible: true })
        .click();
      await page
        .getByRole("button", { name: "Review project", exact: true })
        .click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
