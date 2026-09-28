import { expect, test } from "@playwright/test";

// Vendor-parity features from the reference captures (Pointr/Mappedin/Situm):
// rich location card, keyword search, deep links, share, route summary and
// step-through directions. POI ids come from the ported fixtures
// (scripts/port-*.py are deterministic).

test("deep link opens a rich Pointr location card", async ({ page }) => {
  // Sushi by Masa: Pointr openHours + rating + price level + phone.
  await page.goto("/harrods?poi=678");

  await expect(
    page.getByRole("heading", { name: "Sushi by Masa" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("location-subtitle")).toHaveText(
    /Ground Floor/,
  );
  await expect(page.getByText("4.9", { exact: true })).toBeVisible();
  await expect(page.getByText("(9854)")).toBeVisible();
  await expect(page.getByText("$$$$")).toBeVisible();
  await expect(page.getByTestId("open-status")).toHaveText(
    /^(Open|Closing soon|Closed)/,
  );

  // The weekly table expands from the status row.
  await page.getByTestId("open-status").click();
  await expect(page.getByRole("cell", { name: "Monday" })).toBeVisible();
});

test("Mappedin location states render as badges", async ({ page }) => {
  await page.goto("/mappedin-mall?poi=3");

  await expect(
    page.getByRole("heading", { name: "The Body Shop" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Coming soon")).toBeVisible();
  await expect(page.getByTestId("location-subtitle")).toHaveText(/Lower Level/);
});

test("search matches venue tags, not only names", async ({ page }) => {
  await page.goto("/harrods");

  await page.getByPlaceholder("Search indoor locations...").fill("whisky");
  await expect(
    page.getByRole("button", { name: /Fine Wines & Spirits/ }).first(),
  ).toBeVisible();
});

test("selecting a POI updates the URL and share menu", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/city-mall");

  await page.getByPlaceholder("Search indoor locations...").fill("Zara Home");
  await page
    .getByRole("button", { name: /Zara Home/ })
    .first()
    .dispatchEvent("mousedown");
  await expect(page.getByRole("heading", { name: "Zara Home" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]poi=17\b/, { timeout: 20_000 });

  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("menuitem", { name: "Copy Link" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\/city-mall\?poi=17$/);

  await page.getByRole("button", { name: "Share" }).click();
  await page.getByRole("menuitem", { name: "QR Code" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Scan to open on your phone",
  });
  await expect(dialog.getByRole("img", { name: "QR code" })).toBeVisible();
  await expect(
    dialog.getByRole("img", { name: "QR code" }).locator("svg"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close QR code" }).click();
  await expect(dialog).toBeHidden();
});

test("directions deep link routes across floors with summary and steps", async ({
  page,
}) => {
  // Primark (Ground Floor) -> Zara Home (1st Floor).
  await page.goto("/city-mall?from=15&to=17");

  await expect(page.getByPlaceholder("Choose starting point")).toHaveValue(
    "Primark",
    { timeout: 20_000 },
  );
  await expect(page.getByPlaceholder("Choose destination")).toHaveValue(
    "Zara Home",
  );
  await expect(page.getByTestId("route-summary")).toContainText(/\d+ min/, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("route-summary")).toContainText(
    /1 floor change/,
  );
  await expect(
    page.getByText(/Take the (escalator|stairs|elevator) to 1st Floor/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Start steps" }).click();
  await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByText(/^Step 2 of \d+$/)).toBeVisible();

  // Swap re-routes in the other direction.
  await page
    .getByRole("button", { name: "Swap start and destination" })
    .click();
  await expect(page.getByPlaceholder("Choose starting point")).toHaveValue(
    "Zara Home",
  );
  await expect(page).toHaveURL(/from=17&to=15/);
  await expect(
    page.getByText(/Take the (escalator|stairs|elevator) to Ground Floor/),
  ).toBeVisible();
});

test("accessible deep link avoids stairs and escalators", async ({ page }) => {
  await page.goto("/city-mall?from=15&to=17&accessible=1");

  await expect(page.getByTestId("route-summary")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("button", { name: "Accessible route" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Take the elevator to 1st Floor/)).toBeVisible();
  await expect(page.getByText(/Take the (stairs|escalator)/)).toHaveCount(0);
});

test("route line is drawn above the floor plan", async ({ page }) => {
  // Regression: indoor layers are added asynchronously and used to be
  // appended on top of the route layers, hiding the path under the floor
  // fill and extrusions.
  await page.goto("/city-mall?from=15&to=17");
  await expect(page.getByTestId("route-summary")).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(3000); // let fitBounds settle

  const png = await page.locator(".maplibregl-canvas").screenshot();
  const routePixels = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    // Route color #3665ff = rgb(54, 101, 255).
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (
        Math.abs(data[index] - 54) < 40 &&
        Math.abs(data[index + 1] - 101) < 40 &&
        data[index + 2] > 215
      ) {
        count++;
      }
    }
    return count;
  }, png.toString("base64"));

  expect(routePixels).toBeGreaterThan(500);
});

test("multi-floor rides are one step and focus the boarding floor", async ({
  page,
}) => {
  // Harrods Technology (Fifth Floor) -> Abercrombie & Kent (Lower Ground):
  // a long ride, so the elevator (one wait + 15 s/floor) beats 6 flights.
  await page.goto("/harrods?from=37&to=10");
  await expect(page.getByTestId("route-summary")).toBeVisible({
    timeout: 20_000,
  });

  const rides = page.getByText(/^Take the /);
  await expect(rides).toHaveCount(1);
  await expect(rides).toHaveText(
    "Take the elevator down 6 floors to Lower Ground",
  );

  // Going down, the step shows where you board, not where you arrive.
  await rides.click();
  await expect(page.getByLabel("Select floor")).toHaveValue("5");
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.getByLabel("Select floor")).toHaveValue("-1");
});

test("one floor takes the stairs unless accessible", async ({ page }) => {
  // Toys (Fourth Floor) -> Harrods Technology (Fifth Floor).
  await page.goto("/harrods?from=29&to=37");
  await expect(page.getByText("Take the stairs to Fifth Floor")).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/harrods?from=29&to=37&accessible=1");
  await expect(page.getByText("Take the elevator to Fifth Floor")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Take the (stairs|escalator)/)).toHaveCount(0);
});

test("going down avoids the up-only escalator", async ({ page }) => {
  // Galleria: Pixel Toys (Level 2) -> Lumen Electronics (Level 1); the
  // central escalator only runs up.
  await page.goto("/galleria?from=8&to=1");
  await expect(page.getByTestId("route-summary")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Take the stairs to Level 1")).toBeVisible();
  await expect(page.getByText(/Take the escalator/)).toHaveCount(0);
  // The walk to and from the stairs counts, even when both ends snap
  // straight onto the staircase.
  await expect(page.getByTestId("route-summary")).not.toContainText("(0 m)");
});

test("connector marker on the map switches to the next floor", async ({
  page,
}) => {
  // Primark (Ground Floor) -> Zara Home (1st Floor) by escalator.
  await page.goto("/city-mall?from=15&to=17");
  await expect(page.getByTestId("route-summary")).toBeVisible({
    timeout: 20_000,
  });

  // Focusing the ride step centres the map on the "Up to 1st Floor" marker.
  await page.getByText("Take the escalator to 1st Floor").click();
  await expect(page.getByLabel("Select floor")).toHaveValue("0");
  await page.waitForTimeout(2000);
  const canvas = await page.locator(".maplibregl-canvas").boundingBox();
  // The camera can still be settling on slow (software-GL) renderers, so the
  // first click may land before the marker is centred; retry until it hits.
  await expect(async () => {
    await page.mouse.click(
      canvas!.x + canvas!.width / 2,
      canvas!.y + canvas!.height / 2,
    );
    await expect(page.getByLabel("Select floor")).toHaveValue("1", {
      timeout: 1500,
    });
  }).toPass({ timeout: 15_000 });
});

test("route preview walks the route across floors", async ({ page }) => {
  await page.goto("/city-mall?from=15&to=17");
  await expect(page.getByTestId("route-summary")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel("Select floor")).toHaveValue("0");

  await page.getByRole("button", { name: "Preview route" }).click();
  await expect(
    page.getByRole("button", { name: "Stop preview" }),
  ).toBeVisible();
  // The preview switches to the destination floor on its own...
  await expect(page.getByLabel("Select floor")).toHaveValue("1", {
    timeout: 20_000,
  });
  // ...and hands the button back when it reaches the destination.
  await expect(page.getByRole("button", { name: "Preview route" })).toBeVisible(
    { timeout: 20_000 },
  );
});

test("clicking a room opens a location on the visible floor", async ({
  page,
}) => {
  // Regression: rooms on other floors overlap in 2D, and POIs used to be
  // matched to the first containing room on any floor. Prada Caffè's
  // ground-floor room then opened the 4th-floor Women's Toilets.
  await page.goto("/harrods?poi=684");
  const heading = page.getByRole("heading", { name: "Prada Caffè" });
  await expect(heading).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500); // let flyTo settle on the POI

  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: box.width / 2, y: box.height / 2 },
  });

  await page.waitForTimeout(500);
  await expect(heading).toBeVisible();
  await expect(page.getByTestId("location-subtitle")).toHaveText(
    /Ground Floor/,
  );
});
