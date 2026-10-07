import { expect, test } from "@playwright/test";

// The page background comes from the bg token: #FAFAFA in light, #09090B in dark.
const lightBackground = "rgb(250, 250, 250)";
const darkBackground = "rgb(9, 9, 11)";

test.describe("with a dark system theme", () => {
  test.use({ colorScheme: "dark" });

  test("uses the dark theme", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.locator("body")).toHaveCSS("background-color", darkBackground);
  });
});

test.describe("with a light system theme", () => {
  test.use({ colorScheme: "light" });

  test("uses the light theme", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await expect(page.locator("body")).toHaveCSS("background-color", lightBackground);
  });

  test("the toggle fades to the other theme and remembers it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Toggle theme" }).click();

    await expect(page.locator("html")).toHaveClass(/\btheme-fade\b/);
    await expect(page.locator("body")).toHaveCSS("transition-duration", /^0\.5s/);
    await expect(page.locator("body")).toHaveCSS("background-color", darkBackground);
    // The choice is saved when the fade ends.
    await expect(page.locator("html")).not.toHaveClass(/\btheme-fade\b/);

    await page.reload();
    await expect(page.locator("body")).toHaveCSS("background-color", darkBackground);

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect(page.locator("body")).toHaveCSS("background-color", lightBackground);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("the theme switches at once, without the fade", async ({ page }) => {
      await page.goto("/");

      await page.getByRole("button", { name: "Toggle theme" }).click();

      await expect(page.locator("body")).toHaveCSS("background-color", darkBackground);
      await expect(page.locator("html")).not.toHaveClass(/\btheme-fade\b/);
    });
  });
});
