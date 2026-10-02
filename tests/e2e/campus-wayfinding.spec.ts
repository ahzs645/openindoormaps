import { expect, test } from "@playwright/test";

// POI ids from app/data/campus/pois.geojson (scripts/generate-campus-fixture.py).
const CHEMISTRY_LAB = 2; // Science Hall, Ground Floor
const OBSERVATORY = 11; // Science Hall, Level 4
const LIBRARY_CAFE = 17; // Library, Ground Floor
const READING_ROOM = 18; // Library, Level 2
const FOOD_COURT = 29; // Student Union, Ground Floor
const FITNESS_CENTRE = 32; // Student Union, Level 2

test("campus routes between buildings over the outdoor walkways", async ({
  page,
}) => {
  await page.goto(`/campus?from=${FOOD_COURT}&to=${LIBRARY_CAFE}`);

  await expect(page.getByText("Exit Student Union").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Enter Library").first()).toBeVisible();
});

test("campus prefers the Level 2 skybridge between Science Hall and the Library", async ({
  page,
}) => {
  await page.goto(`/campus?from=${CHEMISTRY_LAB}&to=${READING_ROOM}`);

  await expect(
    page.getByText("Take the Science–Library Skybridge").first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Enter Library").first()).toBeVisible();
  await expect(page.getByText("Exit Science Hall")).toHaveCount(0);
});

test("campus combines floor changes in two buildings with an outdoor leg", async ({
  page,
}) => {
  await page.goto(
    `/campus?from=${FITNESS_CENTRE}&to=${OBSERVATORY}&accessible=1`,
  );

  await expect(
    page.getByText("Take the elevator down to Ground Floor").first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Exit Student Union").first()).toBeVisible();
  await expect(page.getByText("Enter Science Hall").first()).toBeVisible();
  await expect(
    page.getByText("Take the elevator up 3 floors to Level 4").first(),
  ).toBeVisible();
});

// Real two-building site from the Pointr capture: the store and the
// Harrods Car Park across the street (scripts/port-pointr-harrods.py).
const SUSHI_BY_MASA = 678; // Harrods, Ground Floor
const HARRODS_TECHNOLOGY = 37; // Harrods, Fifth Floor
const CAR_PARK_ROW_A1 = 880; // Harrods Car Park
const BUS_STOP_KB = 70; // Harrods (Stop KB), outdoors

test("harrods routes from the store to the separate car park building", async ({
  page,
}) => {
  await page.goto(`/harrods?from=${SUSHI_BY_MASA}&to=${CAR_PARK_ROW_A1}`);

  await expect(page.getByText("Exit Harrods").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Enter Harrods Car Park").first()).toBeVisible();
});

test("harrods routes from an upper floor out to a bus stop", async ({
  page,
}) => {
  await page.goto(`/harrods?from=${HARRODS_TECHNOLOGY}&to=${BUS_STOP_KB}`);

  await expect(
    page.getByText(/Take the (elevator|stairs).*to Ground Floor/).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Exit Harrods").first()).toBeVisible();
});

// Real campus from Mappedin's MVF bundle (scripts/port-mappedin-mvf.py):
// the vendor's own navigation graph, doors, stairs and elevators.
const BOWIE_BOOK_STORE = 714; // Student Center, Floor 1
const BOWIE_CS_316 = 300; // Computer Science Building, Floor 3
const BOWIE_RH_101 = 1118; // Charlotte Robinson Hall, Floor 2

test("bowie state routes across campus into another building's upper floor", async ({
  page,
}) => {
  await page.goto(`/bowie-state?from=${BOWIE_BOOK_STORE}&to=${BOWIE_CS_316}`);

  await expect(page.getByText("Exit Student Center").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText("Enter Computer Science Building").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Take the elevator up 2 floors to Floor 3").first(),
  ).toBeVisible();
});

test("bowie state hillside door enters a building on its second floor", async ({
  page,
}) => {
  await page.goto(`/bowie-state?from=${BOWIE_BOOK_STORE}&to=${BOWIE_RH_101}`);

  await expect(
    page.getByText("Enter Charlotte Robinson Hall (Floor 2)").first(),
  ).toBeVisible({ timeout: 30_000 });
});

// CF Toronto Eaton Centre from its Mappedin MVF bundle (same importer).
const EATON_URBAN_EATERY = 82; // Urban Eatery (lowest floor)
const EATON_ZARA = 40; // Level 4, escalators only in the vendor graph
const EATON_APPLE = 81; // Level 2

test("eaton centre climbs four floors by escalator from the Urban Eatery", async ({
  page,
}) => {
  await page.goto(`/eaton-centre?from=${EATON_URBAN_EATERY}&to=${EATON_ZARA}`);

  await expect(
    page.getByText("Take the escalator up to Level 4").first(),
  ).toBeVisible({ timeout: 30_000 });
});

test("eaton centre reports that Level 4 has no accessible route", async ({
  page,
}) => {
  await page.goto(
    `/eaton-centre?from=${EATON_URBAN_EATERY}&to=${EATON_ZARA}&accessible=1`,
  );

  await expect(page.getByText("No accessible route found.")).toBeVisible({
    timeout: 30_000,
  });
});

test("eaton centre location card carries Mappedin tenant data", async ({
  page,
}) => {
  await page.goto(`/eaton-centre?poi=${EATON_APPLE}`);

  await expect(page.getByRole("heading", { name: "Apple" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Level 2").first()).toBeVisible();
});

test("turning on accessible-only never keeps showing the previous stairs route", async ({
  page,
}) => {
  await page.goto(`/eaton-centre?from=${EATON_URBAN_EATERY}&to=${EATON_ZARA}`);
  await expect(
    page.getByText("Take the escalator up to Level 4").first(),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Accessible route" }).click();

  await expect(page.getByText("No accessible route found.")).toBeVisible();
  await expect(page.getByText("Take the escalator up to Level 4")).toHaveCount(
    0,
  );
});
