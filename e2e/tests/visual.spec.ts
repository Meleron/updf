import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, openInEditor, pageImage, pick } from "./helpers";
import { addBox } from "./text-boxes";

// The key screens in both themes: an accessibility check, then a screenshot compared with a baseline made in the
// Playwright image (scripts/e2e.sh), where fonts render the same on every machine. The caret is hidden and animations
// are stopped by toHaveScreenshot; names that change between runs are masked.

test.use({ locale: "en-US" });

/** The file name in the top bar. */
function fileName(page: Page) {
  return page.getByRole("banner").getByRole("heading", { level: 1 });
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test("the empty dashboard", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Choose a PDF" })).toBeVisible();

      await expectNoAxeViolations(page);
      await expect(page).toHaveScreenshot(`dashboard-${colorScheme}.png`);
    });

    test("the dashboard with an upload error", async ({ page }) => {
      await page.goto("/");
      await pick(page, "not-a-pdf.pdf");
      await expect(page.getByText("This file isn't a PDF. Choose a PDF file.")).toBeVisible();

      await expectNoAxeViolations(page);
      await expect(page).toHaveScreenshot(`dashboard-error-${colorScheme}.png`);
    });

    test("the editor with edits", async ({ page }) => {
      // The replacement hint has been seen, so it doesn't cover the pages.
      await page.addInitScript(() => sessionStorage.setItem("updf.replaceHint", "shown"));
      await openInEditor(page, "simple.pdf");
      await expect(pageImage(page, 1, 1)).toHaveAttribute("aria-busy", "false");
      await addBox(page, 60, 240);
      await page.keyboard.type("New text\nZażółć gęślą jaźń");
      await page.keyboard.press("Escape");
      await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" }).click();
      await page.keyboard.press("Escape");
      const box = (await pageImage(page, 1, 1).boundingBox())!;
      const scale = box.width / 595;
      await pageImage(page, 1, 1).click({ position: { x: 100 * scale, y: 113 * scale } });
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("A replaced line");
      // Finish and deselect, so neither the box outline nor the formatting bar is in the picture.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeHidden();
      await page.mouse.move(0, 0);

      await expectNoAxeViolations(page);
      await expect(page).toHaveScreenshot(`editor-${colorScheme}.png`, { mask: [fileName(page)] });
    });
  });
}
