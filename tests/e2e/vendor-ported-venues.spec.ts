import { expect, test } from "@playwright/test";

interface VenueCase {
  slug: string;
  search: string;
  totem: string;
  origin?: string;
  routeHint: RegExp;
}

const venues: VenueCase[] = [
  {
    slug: "city-mall",
    search: "Zara Home",
    totem: "Primark",
    // Totem is Primark (level 0); Zara Home is level 1 -> cross-floor route
    // over the vendor's real escalator graph.
    routeHint: /Take the (escalator|stairs|elevator) up to 1st Floor/i,
  },
  {
    slug: "harrods",
    search: "Sushi by Masa",
    totem: "Louis Vuitton",
    // Both destinations have source-backed walkable attachments. Fine Watch
    // Room's imported centroid is blocked and is checked separately below.
    origin: "Abercrombie & Kent",
    routeHint: /Take the escalator up to Ground Floor/i,
  },
  {
    slug: "mappedin-mall",
    search: "Swatch",
    totem: "Lululemon",
    routeHint: /Take the (escalator|stairs|elevator) (up|down)/i,
  },
];

for (const venue of venues) {
  test(`${venue.slug} renders vendor-ported venue shell`, async ({ page }) => {
    await page.goto(`/${venue.slug}`);

    await expect(
      page.getByPlaceholder("Search indoor locations..."),
    ).toBeVisible();
    await expect(page.getByTestId("map-canvas-root")).toBeVisible();
    await expect(page.locator(".maplibregl-canvas")).toBeVisible();
    await page.waitForFunction(() => {
      const canvas =
        document.querySelector<HTMLCanvasElement>(".maplibregl-canvas");

      return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
    });
  });

  test(`${venue.slug} finds ported store and routes to it`, async ({
    page,
  }) => {
    await page.goto(`/${venue.slug}`);

    await page
      .getByPlaceholder("Search indoor locations...")
      .fill(venue.search);
    const suggestion = page.getByRole("button", { name: venue.search });
    await expect(suggestion.first()).toBeVisible();
    await suggestion.first().dispatchEvent("mousedown");

    await expect(
      page.getByRole("heading", { name: venue.search }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Directions" }).click();

    // The manual flow starts with an empty origin: set it explicitly
    // (defaults to the totem).
    const origin = page.getByPlaceholder("Choose starting point");
    await origin.click();
    await origin.fill(venue.origin ?? venue.totem);
    await page
      .getByText(venue.origin ?? venue.totem, { exact: true })
      .first()
      .click();

    // Turn-by-turn instructions render once the route resolves, including
    // the cross-floor step.
    await expect(page.getByText(venue.routeHint).first()).toBeVisible({
      timeout: 15_000,
    });
  });
}

test("harrods rejects a destination inside source obstacle material", async ({
  page,
}) => {
  await page.goto("/harrods?from=37&to=3");
  await expect(page.getByPlaceholder("Choose starting point")).toHaveValue(
    "Harrods Technology",
    { timeout: 20_000 },
  );
  await expect(
    page.getByText("No route found between these locations.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview route", exact: true }),
  ).toHaveCount(0);
});

test("harrods counts multi-floor rides and switches to elevator-only navigation", async ({
  page,
}) => {
  await page.goto("/harrods?from=37&to=10");
  await expect(page.getByTestId("route-summary")).toContainText(
    "2 floor changes",
    {
      timeout: 20_000,
    },
  );
  await expect(
    page.getByRole("button", {
      name: "Take the elevator down 5 floors to Ground Floor",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Take the escalator down to Lower Ground",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accessible route" }).click();
  await expect(page.getByTestId("route-summary")).toContainText(
    "1 floor change",
  );
  const ride = page.getByRole("button", {
    name: "Take the elevator down 6 floors to Lower Ground",
    exact: true,
  });
  await expect(ride).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Take the (stairs|escalator)/ }),
  ).toHaveCount(0);
});

test("harrods previews stairs at the boarding floor and continues on the arrival floor", async ({
  page,
}) => {
  await page.goto("/harrods?from=862&to=35");
  const stairs = page.getByRole("button", {
    name: "Take the stairs up to Ground Floor",
    exact: true,
  });
  await expect(stairs).toBeVisible({ timeout: 20_000 });
  await stairs.click();
  await expect(
    page.getByRole("combobox", { name: "Select floor" }),
  ).toHaveValue("-1");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Select floor" }),
  ).toHaveValue("0");
  await page
    .getByRole("button", { name: "Accessible route", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Take the (stairs|escalator)/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Take the elevator up to Ground Floor/ }),
  ).toBeVisible();
});
