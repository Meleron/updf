import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { pageImage } from "./helpers";
import { addBox, expectNear, openAt100Percent, pixelsPerPoint, textBoxInput } from "./text-boxes";

test.use({ locale: "en-US" });

function bar(page: Page) {
  return page.getByRole("toolbar", { name: "Formatting" });
}

function boxes(page: Page) {
  return page.getByTestId("text-box");
}

/** A box's position on its page in CSS pixels, from its style, so dragging and keys can be measured exactly. */
function position(box: Locator) {
  return box.evaluate((element: HTMLElement) => ({ left: parseFloat(element.style.left), top: parseFloat(element.style.top) }));
}

/** Adds finished boxes with the given text, each 80 points below the one before, and leaves none selected. */
async function addBoxes(page: Page, ...texts: string[]) {
  for (const [i, text] of texts.entries()) {
    await addBox(page, 100, 160 + i * 80 * pixelsPerPoint);
    await page.keyboard.type(text);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
  await expect(bar(page)).toBeHidden();
}

test("a box is selected with a click, and edited with another", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "Select me");
  const box = boxes(page);

  await box.click();
  await expect(box).toBeFocused();
  await expect(bar(page)).toBeVisible();
  await expect(textBoxInput(page)).toBeHidden();

  await box.click();
  await expect(textBoxInput(page)).toBeFocused();
  await expect(textBoxInput(page)).toHaveValue("Select me");
});

test("Tab selects the boxes in turn, with a visible focus ring", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "First", "Second");
  await page.getByRole("button", { name: "Page 1", exact: true }).focus();

  await page.keyboard.press("Tab");
  await expect(boxes(page).first()).toBeFocused();
  await expect(boxes(page).first()).toHaveCSS("outline-width", "2px");
  await expect(bar(page)).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(boxes(page).last()).toBeFocused();
  await expect(boxes(page).last()).toHaveAccessibleName("Second");
  await expect(boxes(page).last()).toHaveAccessibleDescription(/^Enter edits the text\./);
});

test("the arrow keys move the selected box by a point, or ten with Shift", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "Arrows");
  const box = boxes(page);
  await box.click();
  const start = await position(box);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");

  const end = await position(box);
  expectNear(end.left - start.left, pixelsPerPoint, 0.01);
  expectNear(end.top - start.top, 10 * pixelsPerPoint, 0.01);
  // Moving is not editing.
  await expect(textBoxInput(page)).toBeHidden();
});

test("dragging moves a box, and it can't leave its page", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "Drag me");
  const box = boxes(page);
  const start = await position(box);
  const { x, y, width, height } = (await box.boundingBox())!;

  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await page.mouse.move(x + width / 2 + 60, y + height / 2 + 30, { steps: 5 });
  await page.mouse.up();

  const moved = await position(box);
  expectNear(moved.left - start.left, 60, 0.01);
  expectNear(moved.top - start.top, 30, 0.01);
  // A drag selects the box but doesn't start editing it.
  await expect(box).toBeFocused();
  await expect(textBoxInput(page)).toBeHidden();

  const pageBox = (await pageImage(page, 1, 1).boundingBox())!;
  const now = (await box.boundingBox())!;
  await page.mouse.move(now.x + 5, now.y + 5);
  await page.mouse.down();
  await page.mouse.move(pageBox.x - 200, pageBox.y - 200, { steps: 5 });
  await page.mouse.up();
  expect((await position(box)).left).toBe(0);
  const clamped = (await box.boundingBox())!;
  expect(clamped.y).toBeGreaterThanOrEqual(pageBox.y - 2);
});

test("Delete removes the selected box and selects the next, then the pages get the focus", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "First", "Second");
  await boxes(page).first().click();

  await page.keyboard.press("Delete");
  await expect(boxes(page)).toHaveCount(1);
  await expect(boxes(page)).toHaveText("Second");
  await expect(boxes(page)).toBeFocused();

  await page.keyboard.press("Backspace");
  await expect(boxes(page)).toHaveCount(0);
  await expect(bar(page)).toBeHidden();
  await expect(page.getByTestId("pages")).toBeFocused();
});

test("Esc on an empty new box discards it and puts the focus on the pages", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);

  await page.keyboard.press("Escape");

  await expect(boxes(page)).toHaveCount(0);
  await expect(page.getByTestId("pages")).toBeFocused();
});

test("only a replacement's text moves: the cover stays over the original", async ({ page }) => {
  await openAt100Percent(page);
  await pageImage(page, 1, 1).click({ position: { x: 100 * pixelsPerPoint, y: 113 * pixelsPerPoint } });
  // An unchanged replacement is discarded when its edit finishes.
  await page.keyboard.type("!");
  await page.keyboard.press("Escape");
  const cover = page.getByTestId("cover");
  const coverAt = await position(cover);
  const textAt = await position(boxes(page));

  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");

  expectNear((await position(boxes(page))).top - textAt.top, 20 * pixelsPerPoint, 0.01);
  expect(await position(cover)).toEqual(coverAt);
});

test("a box can't be resized: its size follows its text", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Short");
  const short = (await boxes(page).boundingBox())!;
  await expect(textBoxInput(page)).toHaveCSS("resize", "none");

  await page.keyboard.type(" and now much longer");
  await page.keyboard.press("Enter");
  await page.keyboard.type("with a second line");

  const long = (await boxes(page).boundingBox())!;
  expect(long.width).toBeGreaterThan(short.width * 2);
  expectNear(long.height, short.height * 2, 1);
});

test("everything works from the keyboard alone", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "Keys");
  await page.getByRole("button", { name: "Page 1", exact: true }).focus();

  // Tab to the box, Enter to edit it, then Esc back to the box.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(textBoxInput(page)).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" only");
  await page.keyboard.press("Escape");
  await expect(boxes(page)).toBeFocused();
  await expect(boxes(page)).toHaveCSS("outline-width", "2px");
  await expect(boxes(page)).toHaveText("Keys only");

  const start = await position(boxes(page));
  await page.keyboard.press("ArrowLeft");
  expectNear((await position(boxes(page))).left - start.left, -pixelsPerPoint, 0.01);

  // Esc deselects, and the box is still reachable.
  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
  await boxes(page).focus();
  await page.keyboard.press("Delete");
  await expect(boxes(page)).toHaveCount(0);
});

test("the editor with a selected box passes an accessibility check", async ({ page }) => {
  await openAt100Percent(page);
  await addBoxes(page, "Accessible");
  await boxes(page).click();
  await expect(bar(page)).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`)).toEqual([]);
});
