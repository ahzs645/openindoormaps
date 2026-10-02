import { expect, test } from "@playwright/test";

test("hospital reproduces elevator descent and source building sequence", async ({
  page,
}) => {
  await page.goto("/bc-hospital?from=300&to=258&accessible=1");
  await expect(page.getByTestId("route-summary")).toContainText("4 min", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const ride = page.getByRole("button", {
    name: "Take the elevator down to Level 1",
    exact: true,
  });
  await expect(ride).toBeVisible();
  for (const building of [
    "Shaughnessy AB Block",
    "BC Women's Hospital",
    "BC Children's Hospital",
  ])
    await expect(
      page.getByRole("button", { name: `Enter ${building}`, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Exit Shaughnessy DEF/ }),
  ).toHaveCount(0);
  await ride.click();
  await expect(page.locator("button[data-current-floor]")).toHaveAttribute(
    "data-current-floor",
    "0",
  );
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("button[data-current-floor]")).toHaveAttribute(
    "data-current-floor",
    "0",
  );
});

test("hospital retains the reference's old clinic name as a search alias", async ({
  page,
}) => {
  await page.goto("/bc-hospital");
  await page
    .getByPlaceholder("Search the hospital...")
    .fill("Breast Health Imaging Center");
  const result = page.getByRole("button", {
    name: /Breast Health Clinic & Bone Density/,
  });
  await expect(result).toBeVisible({ timeout: 20_000 });
  await result.dispatchEvent("mousedown");
  await expect(page.getByTestId("location-subtitle")).toContainText(
    "Shaughnessy DEF Block",
  );
  await expect(page.getByTestId("location-subtitle")).toContainText("Level 2");
  await expect(page.locator("button[data-current-floor]")).toHaveAttribute(
    "data-current-floor",
    "1",
  );
});

test("hospital switches between exterior buildings and interior levels", async ({
  page,
}) => {
  await page.goto("/bc-hospital");
  await page.getByRole("button", { name: "Campus", exact: true }).click();
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  await page
    .getByRole("button", { name: /^BC Children's Hospital Buildings/ })
    .click();
  const floor = page.locator("button[data-current-floor]");
  await expect(floor).toHaveAttribute("data-current-floor", "-100", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("location-subtitle")).toContainText("Outdoors");
  await floor.click();
  await page
    .getByRole("menuitem", { name: "BC Children's Hospital", exact: true })
    .click();
  await page
    .getByRole("menuitemradio", { name: "Level 1", exact: true })
    .click();
  await expect(floor).toHaveAttribute("data-current-floor", "0");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});

test("hospital categories expose source details, phone and gallery", async ({
  page,
}) => {
  await page.goto("/bc-hospital");
  await page
    .getByRole("button", { name: "On-site Services", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retail Services", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Gift Shop Retail Services/ })
    .click();
  const card = page.getByTestId("location-detail");
  await expect(card).toContainText("Retail Services");
  await expect(card).toContainText("BC Children's Hospital");
  await expect(card.getByRole("link", { name: "604-875-3872" })).toBeVisible();
  const photo = card.getByRole("img", { name: "Gift Shop photo" });
  await expect(photo).toBeVisible();
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await card
    .getByRole("button", { name: "Retail Services", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Gift Shop Retail Services/ }),
  ).toBeVisible();
});

test("2D and 3D room views retain the floor, destination and route", async ({
  page,
}) => {
  await page.goto("/bc-hospital?from=300&to=258&accessible=1");
  await expect(page.getByTestId("route-summary")).toContainText("4 min", {
    timeout: 20_000,
  });
  const floor = page.locator("button[data-current-floor]");
  await expect(floor).toHaveAttribute("data-current-floor", "1");
  const flat = page.getByRole("button", { name: "2D rooms", exact: true });
  const raised = page.getByRole("button", { name: "3D rooms", exact: true });
  await flat.click();
  await expect(flat).toHaveAttribute("aria-pressed", "true");
  await expect(floor).toHaveAttribute("data-current-floor", "1");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Take the elevator down to Level 1",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(floor).toHaveAttribute("data-current-floor", "0");
  await raised.click();
  await expect(raised).toHaveAttribute("aria-pressed", "true");
  await expect(floor).toHaveAttribute("data-current-floor", "0");
  await expect(page.getByTestId("route-summary")).toContainText("4 min");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByPlaceholder("Choose destination")).toHaveValue(
    "Gift Shop",
  );
  await expect(page).toHaveURL(/from=300&to=258&accessible=1/);
});

test("hospital floor picker uses the selected building's source floor list", async ({
  page,
}) => {
  await page.goto("/bc-hospital?poi=118");
  const trigger = page.getByRole("button", { name: "Open level selector" });
  await expect(trigger).toHaveAttribute("title", "Teck Acute Care Centre", {
    timeout: 20_000,
  });
  await trigger.click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(10);
  await expect(
    page.getByRole("menuitemradio", { name: "Ground Level", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitemradio", { name: "Level 2", exact: true })
    .click();
  await expect(trigger).toContainText("Level 2");
  await expect(trigger).toHaveAttribute("data-current-floor", "1");
  await page.getByRole("button", { name: "2D rooms", exact: true }).click();
  await expect(trigger).toContainText("Level 2");
  await trigger.click();
  await expect(
    page.getByRole("menuitemradio", { name: "Level 2", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page
    .getByRole("menuitem", { name: "Change the currently selected building" })
    .click();
  for (const building of [
    "Ambulatory Care Building",
    "Healthy Minds Centre",
    "Shaughnessy C Block",
    "BC Women's Hospital",
  ])
    await expect(
      page.getByRole("menuitem", { name: building, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "BC Children's Hospital", exact: true })
    .click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(4);
  await expect(
    page.getByRole("menuitemradio", { name: "Level 8", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitemradio", { name: "Parking Garage", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("title", "BC Children's Hospital");
  await expect(trigger).toContainText("Level 1");
});

test("hospital desktop preview matches the orange step panel and keeps controls fixed", async ({
  page,
}) => {
  await page.goto("/bc-hospital?from=300&to=258&accessible=1");
  await expect(page.getByTestId("route-summary")).toContainText("4 min", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const panel = page.getByTestId("hospital-desktop-preview");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("route-summary")).toContainText(
    "4 minutes total",
  );
  const ride = page.getByRole("button", {
    name: "Take the elevator down to Level 1",
    exact: true,
  });
  await ride.click();
  await expect(ride).toHaveAttribute("aria-current", "step");
  await expect(ride).toHaveCSS("background-color", "rgb(250, 135, 21)");
  await expect(ride).toContainText("Less than a minute");
  await expect(panel.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    /[1-9]/,
  );
  const next = page.getByRole("button", { name: "Next step", exact: true });
  const before = await next.boundingBox();
  await panel.getByTestId("hospital-step-list").evaluate((list) => {
    list.scrollTop = list.scrollHeight;
  });
  const after = await next.boundingBox();
  expect(after?.y).toBe(before?.y);
  await page
    .getByRole("button", { name: "Route options", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Preview route", exact: true }),
  ).toBeVisible();
  await page.getByRole("menu").press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByPlaceholder("Choose destination")).toHaveValue(
    "Gift Shop",
  );
});

test("hospital mobile preview leaves the map between instruction and summary cards", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bc-hospital?from=300&to=258&accessible=1");
  await expect(page.getByTestId("route-summary")).toContainText("4 min", {
    timeout: 20_000,
  });
  // Expand the existing sheet to reach Start, then use the compact route view.
  await page
    .getByRole("button", { name: "Resize map panel", exact: true })
    .click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const mobile = page.getByTestId("hospital-mobile-preview");
  await expect(mobile).toBeVisible();
  await expect(page.getByTestId("hospital-desktop-preview")).toBeHidden();
  await expect(mobile).toContainText("4 minutes total");
  await expect(page.getByTestId("mobile-route-floor")).toContainText(
    "Shaughnessy DEF Block",
  );
  const initial = await page
    .getByTestId("mobile-current-instruction")
    .textContent();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.getByTestId("mobile-current-instruction")).not.toHaveText(
    initial!,
  );
  const top = await page
    .getByRole("region", { name: "Current direction" })
    .boundingBox();
  const bottom = await page
    .getByRole("region", { name: "Route summary and step controls" })
    .boundingBox();
  expect(bottom!.y - top!.y - top!.height).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "Route options", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Preview route", exact: true })
    .click();
  await expect(page.getByTestId("mobile-current-instruction")).toHaveText(
    "Arrive at Gift Shop",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("mobile-route-floor")).toContainText(
    "BC Children's Hospital",
  );
  await expect(page.getByTestId("mobile-route-floor")).toContainText("Level 1");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(mobile).toHaveCount(0);
  await expect(page.getByPlaceholder("Choose destination")).toHaveValue(
    "Gift Shop",
  );
});

for (const mobile of [false, true]) {
  test(`hospital ${mobile ? "mobile" : "desktop"} Next follows a ride onto its arrival floor and Previous returns upstairs`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/bc-hospital?from=1877&to=260&accessible=1");
    await expect(page.getByTestId("route-summary")).toContainText("3 min", {
      timeout: 20_000,
    });
    // Observe the actual MapLibre camera/layers without adding app test hooks.
    await page.evaluate(async () => {
      const modulePath = "/app/indoor-directions/directions/main.ts";
      const { default: Directions } = await import(modulePath);
      const original = Directions.prototype.setInstructionFocus;
      Directions.prototype.setInstructionFocus = function (
        this: { map: import("maplibre-gl").Map },
        ...args: Parameters<typeof original>
      ) {
        const observedWindow = globalThis as unknown as {
          hospitalFollowMap: import("maplibre-gl").Map;
        };
        observedWindow.hospitalFollowMap = this.map;
        return original.apply(this, args);
      };
    });
    if (mobile)
      await page
        .getByRole("button", { name: "Resize map panel", exact: true })
        .click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Go to step 4: Turn left and go ahead for 32 m",
        exact: true,
      })
      .click();
    const selected = mobile
      ? page.getByTestId("mobile-current-instruction")
      : page.locator('[aria-current="step"]');
    await expect(selected).toContainText("Turn left and go ahead for 32 m");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const observedWindow = globalThis as unknown as {
            hospitalFollowMap: import("maplibre-gl").Map;
          };
          const map = observedWindow.hospitalFollowMap;
          return Boolean(
            map &&
              !map.isMoving() &&
              map.queryRenderedFeatures({
                layers: ["maplibre-gl-indoor-directions-instruction"],
              }).length > 0,
          );
        }),
      )
      .toBe(true);
    const focus = await page.evaluate(async () => {
      const observedWindow = globalThis as unknown as {
        hospitalFollowMap: import("maplibre-gl").Map;
      };
      const map = observedWindow.hospitalFollowMap;
      const source = map.getSource(
        "maplibre-gl-indoor-directions",
      ) as import("maplibre-gl").GeoJSONSource;
      const data = (await source.getData()) as GeoJSON.FeatureCollection;
      const line = data.features.find(
        (feature) => feature.properties?.type === "INSTRUCTION",
      ) as GeoJSON.Feature<GeoJSON.LineString>;
      const layers = map.getStyle().layers.map((layer) => layer.id);
      const rect = map.getContainer().getBoundingClientRect();
      return {
        points: line.geometry.coordinates.map((coordinate) => {
          const point = map.project(coordinate as [number, number]);
          return { x: point.x + rect.left, y: point.y + rect.top };
        }),
        layerOrder:
          layers.indexOf("maplibre-gl-indoor-directions-instruction") >
          layers.indexOf("maplibre-gl-indoor-directions-routeline"),
      };
    });
    expect(focus.layerOrder).toBe(true);
    const canvas = (await page.getByTestId("map-canvas-root").boundingBox())!;
    const panel = mobile
      ? null
      : (await page.getByTestId("hospital-desktop-preview").boundingBox())!;
    const topCard = mobile
      ? (await page
          .getByRole("region", { name: "Current direction" })
          .boundingBox())!
      : null;
    const floorChip = mobile
      ? (await page.getByTestId("mobile-route-floor").boundingBox())!
      : null;
    for (const point of focus.points) {
      expect(point.x).toBeGreaterThan(panel ? panel.x + panel.width : canvas.x);
      expect(point.x).toBeLessThan(canvas.x + canvas.width);
      expect(point.y).toBeGreaterThan(
        topCard ? topCard.y + topCard.height : canvas.y,
      );
      expect(point.y).toBeLessThan(
        floorChip ? floorChip.y : canvas.y + canvas.height,
      );
    }
    const currentPathFits = () =>
      page.evaluate(async () => {
        const observer = globalThis as unknown as {
          hospitalFollowMap: import("maplibre-gl").Map;
        };
        const map = observer.hospitalFollowMap;
        if (map.isMoving()) return false;
        const source = map.getSource(
          "maplibre-gl-indoor-directions",
        ) as import("maplibre-gl").GeoJSONSource;
        const data = (await source.getData()) as GeoJSON.FeatureCollection;
        const path = data.features.find(
          (feature) => feature.properties?.type === "INSTRUCTION",
        ) as GeoJSON.Feature<GeoJSON.LineString>;
        const rect = map.getContainer().getBoundingClientRect();
        const desktop = document
          .querySelector('[data-testid="hospital-desktop-preview"]')!
          .getBoundingClientRect();
        const top = document
          .querySelector('[aria-label="Current direction"]')!
          .getBoundingClientRect();
        const bottom = document
          .querySelector('[data-testid="mobile-route-floor"]')!
          .getBoundingClientRect();
        return path.geometry.coordinates.every((coordinate) => {
          const point = map.project(coordinate as [number, number]);
          const x = point.x + rect.left;
          const y = point.y + rect.top;
          return (
            x > (desktop.width ? desktop.right : rect.left) &&
            x < rect.right &&
            y > (desktop.width ? rect.top : top.bottom) &&
            y < (desktop.width ? rect.bottom : bottom.top)
          );
        });
      });
    // Changing layout must fit with the map's updated internal viewport.
    await page.setViewportSize(
      mobile ? { width: 1280, height: 720 } : { width: 390, height: 844 },
    );
    await expect.poll(currentPathFits).toBe(true);
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    );
    await expect.poll(currentPathFits).toBe(true);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(selected).toContainText("Take the elevator down to Level 1");
    const floor = mobile
      ? page.getByTestId("mobile-route-floor")
      : page.getByRole("button", { name: "Open level selector" });
    await expect(floor).toContainText("Level 1");
    await page
      .getByRole("button", { name: "Previous step", exact: true })
      .click();
    await expect(selected).toContainText("Turn left and go ahead for 32 m");
    await expect(floor).toContainText("Level 2");
    // A rapid change must finish on the last requested floor/instruction.
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(selected).toContainText("Continue for 3 m");
    await expect(floor).toContainText("Level 1");
  });
}
