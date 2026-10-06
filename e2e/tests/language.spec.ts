import { expect, test } from "@playwright/test";

const english = { name: "Edit the text in your PDF" };
const polish = { name: "Edytuj tekst w pliku PDF" };

test.describe("with a Polish browser", () => {
  test.use({ locale: "pl-PL" });

  test("defaults to Polish", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", polish)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  });
});

test.describe("with an English browser", () => {
  test.use({ locale: "en-US" });

  test("defaults to English", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", english)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the switch changes the language and remembers it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Language EN" }).click();
    await page.getByRole("menuitemradio", { name: "Polski" }).click();
    await expect(page.getByRole("heading", polish)).toBeVisible();
    await expect(page.getByRole("button", { name: "Język PL" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", polish)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  });
});
