import { expect, test, type Locator, type Page } from "@playwright/test";
import { pageImage } from "./helpers";
import { addBox, openAt100Percent, pixelsPerPoint, textBoxInput } from "./text-boxes";

test.use({ locale: "en-US" });

function boxes(page: Page) {
  return page.getByTestId("text-box");
}

/** The element a box draws its text in, which has its font. */
function text(box: Locator) {
  return box.locator("div").first();
}

function button(page: Page, name: "Undo" | "Redo") {
  return page.getByRole("banner").getByRole("button", { name });
}

/** Adds a finished box with the given text, and leaves it selected. */
async function addFinishedBox(page: Page, text: string, y = 120) {
  await addBox(page, 100, y);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

test("the shortcuts undo and redo a new box, and the buttons are disabled at either end", async ({ page }) => {
  await openAt100Percent(page);
  await expect(button(page, "Undo")).toBeDisabled();
  await expect(button(page, "Redo")).toBeDisabled();

  await addFinishedBox(page, "Hello");
  await expect(button(page, "Undo")).toBeEnabled();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(boxes(page)).toHaveCount(0);
  await expect(button(page, "Undo")).toBeDisabled();
  await expect(button(page, "Redo")).toBeEnabled();
  // The focus doesn't fall back to the start of the document with the box gone.
  await expect(page.getByTestId("pages")).toBeFocused();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(boxes(page)).toHaveText("Hello");
  await expect(button(page, "Redo")).toBeDisabled();

  // The button disabled by its own last step hands the focus to the pages.
  await button(page, "Undo").focus();
  await page.keyboard.press("Enter");
  await expect(button(page, "Undo")).toBeDisabled();
  await expect(page.getByTestId("pages")).toBeFocused();
});

test("the shortcut does nothing while a menu is open", async ({ page }) => {
  await openAt100Percent(page);
  await addFinishedBox(page, "Kept");
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await expect(page.getByRole("menu")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");

  await expect(boxes(page)).toHaveText("Kept");
});

test("the buttons undo and redo a style change, a move and a delete, one step each", async ({ page }) => {
  await openAt100Percent(page);
  await addFinishedBox(page, "Kept");
  await addFinishedBox(page, "Changed", 260);
  const changed = boxes(page).last();
  const start = (await changed.boundingBox())!;

  await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" }).click();
  await expect(text(changed)).toHaveCSS("font-weight", "700");
  await changed.focus();
  await page.mouse.move(start.x + 10, start.y + 5);
  await page.mouse.down();
  await page.mouse.move(start.x + 70, start.y + 45, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await changed.boundingBox())!.x).toBeCloseTo(start.x + 60, 0);
  await page.keyboard.press("Delete");
  await expect(boxes(page)).toHaveCount(1);

  await button(page, "Undo").click();
  await expect(boxes(page)).toHaveCount(2);
  await expect.poll(async () => (await changed.boundingBox())!.x).toBeCloseTo(start.x + 60, 0);

  await button(page, "Undo").click();
  await expect.poll(async () => (await changed.boundingBox())!.x).toBeCloseTo(start.x, 0);
  await expect(text(changed)).toHaveCSS("font-weight", "700");

  await button(page, "Undo").click();
  await expect(text(changed)).toHaveCSS("font-weight", "400");

  for (let i = 0; i < 3; i++) {
    await button(page, "Redo").click();
  }
  await expect(boxes(page)).toHaveText(["Kept"]);
  await expect(button(page, "Redo")).toBeDisabled();
});

test("arrow presses in a row are one step", async ({ page }) => {
  await openAt100Percent(page);
  await addFinishedBox(page, "Nudged");
  const box = boxes(page);
  await box.focus();
  const start = (await box.boundingBox())!;

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect.poll(async () => (await box.boundingBox())!.x).toBeGreaterThan(start.x + 5);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await box.boundingBox())!.x).toBeCloseTo(start.x, 1);
  await expect(box).toHaveText("Nudged");
});

test("while typing, the shortcut undoes typing in the box, not the edits before it", async ({ page }) => {
  await openAt100Percent(page);
  await addFinishedBox(page, "Earlier");
  await addBox(page, 100, 260);
  await page.keyboard.type("Typing");

  await page.keyboard.press("ControlOrMeta+z");

  await expect(textBoxInput(page)).not.toHaveValue("Typing");
  await expect(textBoxInput(page)).toBeFocused();
  await expect(boxes(page).first()).toHaveText("Earlier");
});

test("undoing a replacement brings the original line back", async ({ page }) => {
  await openAt100Percent(page);
  // On the first line of simple.pdf.
  await pageImage(page, 1, 1).click({ position: { x: 100 * pixelsPerPoint, y: 113 * pixelsPerPoint } });
  await expect(textBoxInput(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Replaced");
  await page.keyboard.press("Escape");
  await expect(boxes(page)).toHaveText("Replaced");

  await button(page, "Undo").click();

  await expect(boxes(page)).toHaveCount(0);
  await expect(page.getByTestId("cover")).toHaveCount(0);
});
