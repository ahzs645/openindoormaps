import { sourceStairKind } from "../../app/indoor-project/source-stairs";
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { Map } from "maplibre-gl";
import type { IndoorDataset } from "../../app/indoor-project/contract";
import { geographicPoint } from "../../app/indoor-project/routing";
const zip = process.env.INDOOR_STAIR_CONTACTS_ZIP;
test.skip(
  !zip || !existsSync(zip),
  "Provide the complete native staircase project.",
);
for (const mobile of [false, true])
  test(`inspect stair endpoints and special contexts on ${mobile ? "mobile" : "desktop"}`, async ({
    page,
  }) => {
    test.setTimeout(480_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/projects/indoor?view=relative");
    await expect(
      page.getByRole("heading", {
        name: "Indoor project workspace",
        exact: true,
      }),
    ).toBeVisible();
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType("resource")
        .map((r) => r.name)
        .find((n) => n.includes("/deps/maplibre-gl.js?"))!;
      const { default: lib } = await import(path),
        add = lib.Map.prototype.addSource;
      lib.Map.prototype.addSource = function (
        this: Map,
        ...args: Parameters<Map["addSource"]>
      ) {
        if (args[0] === "project-areas")
          (globalThis as unknown as { stairMap: Map }).stairMap = this;
        return add.apply(this, args);
      };
    });
    await page.locator("input[type=file]").setInputFiles(zip!);
    await expect(page.getByRole("status")).toContainText("Loaded", {
      timeout: 60_000,
    });
    await page
      .getByRole("button", { name: "Review project", exact: true })
      .click();
    await page.getByText(/^82 stairs · \d+ connection reviews$/).click();
    const d: IndoorDataset = JSON.parse(
      strFromU8(unzipSync(readFileSync(zip!))["viewer/indoor.json"]),
    );
    const stairs = d.stairDisplay!.sourceFlights!.filter((s) =>
      [
        1_588_220, 1_620_957, 2_140_032, 2_474_568, 1_842_431, 1_460_777,
        1_801_478, 1_779_473,
      ].includes(s.stairElementId),
    );
    const floorFor = (s: (typeof stairs)[number]) =>
      d.floors.find((f) => f.levelIds.includes(s.levelIds[0])) ??
      d.floors.find((f) => f.levelIds.some((id) => s.levelIds.includes(id)))!;
    for (const stair of [...stairs].sort((a, b) =>
      floorFor(a).id.localeCompare(floorFor(b).id),
    )) {
      await page
        .getByRole("button", {
          name: `Show native stair #${stair.stairElementId}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: `Source ${sourceStairKind(stair).toLowerCase()} #${stair.stairElementId}`,
          exact: true,
        }),
      ).toBeVisible();
      const points = stair.treads.flatMap((t) => t.ringFeet),
        center = geographicPoint(d, [
          (Math.min(...points.map((p) => p[0])) +
            Math.max(...points.map((p) => p[0]))) /
            2,
          (Math.min(...points.map((p) => p[1])) +
            Math.max(...points.map((p) => p[1]))) /
            2,
        ]);
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ center, id }) => {
                const m = (globalThis as unknown as { stairMap: Map }).stairMap,
                  c = m.getCenter(),
                  source = m.getStyle().sources["project-native-stairs"];
                const count =
                  source.type === "geojson" && typeof source.data !== "string"
                    ? (
                        source.data as import("geojson").FeatureCollection
                      ).features.filter(
                        (f) => f.properties?.stairElementId === id,
                      ).length
                    : 0;
                return (
                  count > 0 &&
                  Math.abs(c.lng - center[0]) + Math.abs(c.lat - center[1]) <
                    1e-7
                );
              },
              { center, id: stair.stairElementId },
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
      await expect(
        page.locator(`[data-stair-element-id="${stair.stairElementId}"]`),
      ).toHaveCount(1);
      if (stair.context === "tiered-seating")
        await expect(
          page.getByText("Stepped seating platforms inside the lecture hall.", {
            exact: false,
          }),
        ).toBeVisible();
      if (stair.context === "outdoor")
        await expect(
          page.getByText("Outdoor staircase.", { exact: false }),
        ).toBeVisible();
      await page.locator("canvas.maplibregl-canvas").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `node_modules/.cache/indoor-editor-tests/stair-contact-${stair.stairElementId}-${mobile ? "mobile" : "desktop"}.png`,
      });
      const blocked = d
        .stairDisplay!.flights.filter(
          (f) =>
            f.stairElementId === stair.stairElementId &&
            !f.displayOnly &&
            floorFor(stair).levelIds.includes(f.levelId),
        )
        .map((f) => f.roomKey);
      expect(
        await page.evaluate((keys) => {
          const m = (globalThis as unknown as { stairMap: Map }).stairMap;
          const src = m.getStyle().sources["project-room-blocks"];
          return src?.type === "geojson" && typeof src.data !== "string"
            ? (src.data as import("geojson").FeatureCollection).features.filter(
                (f) => keys.includes(String(f.properties?.key)),
              ).length
            : 0;
        }, blocked),
      ).toBe(0);
    }
    await page
      .getByLabel("Find native stairs", { exact: true })
      .fill("1588220");
    await expect(
      page.getByRole("button", { name: /Show native stair #/ }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "Show native stair #1588220", exact: true })
      .click();
    await expect(
      page.getByText(
        "Entrance connection needs review before directions are available. Stairs are excluded from wheelchair paths.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await page.goto("about:blank");
  });
