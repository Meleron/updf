import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

test("an unknown address shows the header and a way back", async ({ page }) => {
  await page.goto("/does-not-exist");

  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "uPdf" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Language EN" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Toggle theme" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open a PDF" })).toBeVisible();
});
