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
    routeHint: /Take the (escalator|stairs|elevator) to 1st Floor/i,
  },
  {
    slug: "harrods",
    search: "Fine Watch Room",
    totem: "Louis Vuitton",
    // Abercrombie & Kent sits alone on level -1: routing to Fine Watch Room
    // (level 0) must ride the vendor's real up-only escalator.
    origin: "Abercrombie & Kent",
    routeHint: /Take the escalator to Ground Floor/i,
  },
  {
    slug: "mappedin-mall",
    search: "Swatch",
    totem: "Lululemon",
    routeHint: /Take the (escalator|stairs|elevator) to/i,
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
