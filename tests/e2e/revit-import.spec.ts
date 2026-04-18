import { expect, test } from "@playwright/test";

test("renders the AHSZ Revit import diagnostics", async ({ page }) => {
  await page.goto("/imports/revit/ahsz");

  await expect(
    page.getByRole("heading", { name: "AHSZ Revit Import" }),
  ).toBeVisible();
  await expect(page.getByText("Metadata only")).toBeVisible();
  await expect(page.getByText("20240516_1515(x64)")).toBeVisible();
  await expect(page.getByText("40,880")).toBeVisible();
  await expect(page.getByText("1,548")).toBeVisible();
  await expect(page.getByAltText("AHSZ Revit Import preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Task List" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Export RVT to IFC" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { exact: true, name: "3D Model" }),
  ).toBeVisible();
  await expect(page.getByText("3D GLB model")).toBeVisible();
  await expect(page.getByText("public/revit/ahsz.glb").first()).toBeVisible();
});
