import { expect, test, type Page } from "@playwright/test";
import { openInEditor, pageImage } from "./helpers";
import { textBoxInput } from "./text-boxes";

test.use({ locale: "en-US" });

// fonts.pdf: 12 pt lines at x = 72 pt, on these baselines.
const lines = [
  { text: "Arimo regular line", baseline: 96 },
  { text: "Tinos regular line", baseline: 124 },
  { text: "Underlined Arimo line", baseline: 152 },
  { text: "Tinos word by word", baseline: 180 },
  { text: "Text above a rule", baseline: 208 },
];

/** CSS pixels per point at 200% zoom, where differences of a fraction of a point show. */
const scale = 2 * (96 / 72);

function bar(page: Page) {
  return page.getByRole("toolbar", { name: "Formatting" });
}

async function openFontsPdf(page: Page) {
  await openInEditor(page, "fonts.pdf");
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "200%", exact: true }).click();
  // Zooming keeps the middle of the view in place, and the lines start near the page's left edge.
  await page.getByTestId("pages").evaluate((element) => element.scrollTo({ left: 0 }));
  await expect(pageImage(page, 1, 1)).toHaveAttribute("aria-busy", "false");
}

/**
 * The ink of a line's area as shown, pdf.js's drawing and the edits above it alike: the bounds of the dark pixels, their
 * total darkness, and the rows dark across most of the line (an underline). `width` limits the area, in pixels.
 */
async function ink(page: Page, baseline: number, width = 200 * scale) {
  const pageBox = (await pageImage(page, 1, 1).boundingBox())!;
  const clip = { x: pageBox.x + 66 * scale, y: pageBox.y + (baseline - 14) * scale, width, height: 19 * scale };
  const png = (await page.screenshot({ clip })).toString("base64");
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data: pixels, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const darkness = (x: number, y: number) => 255 - (pixels[(y * width + x) * 4] + pixels[(y * width + x) * 4 + 1] + pixels[(y * width + x) * 4 + 2]) / 3;
    let [left, right, top, bottom, total] = [width, -1, height, -1, 0];
    const rowInk: number[] = [];
    for (let y = 0; y < height; y++) {
      rowInk.push(0);
      for (let x = 0; x < width; x++) {
        total += darkness(x, y);
        if (darkness(x, y) > 128) {
          [left, right, top, bottom] = [Math.min(left, x), Math.max(right, x), Math.min(top, y), Math.max(bottom, y)];
          rowInk[y]++;
        }
      }
    }
    const ruled = rowInk.flatMap((count, y) => (count > 0.7 * (right - left) ? [y] : []));
    return { left, right, top, bottom, total, ruled };
  }, png);
}

// An unchanged line shows the PDF itself, so each line gets a letter that its font has ("e"), and the part of the line
// before it must look as it did.
test("an edited line keeps the look of its text: font, size, width, position and underline", async ({ page }) => {
  await openFontsPdf(page);
  await page.mouse.move(0, 0);
  const before = await Promise.all(lines.map((line) => ink(page, line.baseline)));
  expect(before[2].ruled.length).toBeGreaterThan(0);
  expect(before.filter((_, i) => i !== 2).every((line) => line.ruled.length === 0)).toBe(true);

  for (const [i, line] of lines.entries()) {
    await pageImage(page, 1, 1).click({ position: { x: 80 * scale, y: (line.baseline - 3) * scale } });
    await expect(textBoxInput(page)).toHaveValue(line.text);
    await expect(bar(page).getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", String(i === 2));
    await page.keyboard.type("e");
    // Finish typing, then deselect, so neither the outline nor the bar is in the picture.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeHidden();
  }
  await page.mouse.move(0, 0);
  // Up to the original right edge, and a pixel more, since the new letter may start right there.
  const after = await Promise.all(lines.map((line, i) => ink(page, line.baseline, before[i].right + 2)));

  for (const [i, line] of lines.entries()) {
    const [was, is] = [before[i], after[i]];
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      expect(Math.abs(is[edge] - was[edge]), `${line.text}: ${edge}`).toBeLessThanOrEqual(1);
    }
    // Browsers draw text a little lighter than pdf.js's canvas (about 3%) and round an underline to whole pixels.
    expect(Math.abs(is.total - was.total) / was.total, `${line.text}: ink`).toBeLessThan(0.06);
    expect(is.ruled.length, `${line.text}: underline rows`).toBe(was.ruled.length);
    if (was.ruled.length > 0) {
      expect(Math.abs(is.ruled[0] - was.ruled[0]), `${line.text}: underline position`).toBeLessThanOrEqual(1);
    }
  }
});

test("a replacement keeps its original font until a character or style needs another", async ({ page }) => {
  await openFontsPdf(page);
  const fontFamily = () => page.getByTestId("text-box").locator("div").first().evaluate((element) => getComputedStyle(element).fontFamily);

  await pageImage(page, 1, 1).click({ position: { x: 80 * scale, y: 93 * scale } });
  // The font isn't a choice for a replacement.
  await expect(bar(page).getByRole("button", { name: /^Font: / })).toHaveCount(0);
  expect(await fontFamily()).toMatch(/^"?updf-/);

  // Characters the original font has keep it.
  await page.keyboard.type(" mine");
  expect(await fontFamily()).toMatch(/^"?updf-/);

  // "Z" isn't in the PDF's subset of Arimo: the box switches to the similar font.
  await page.keyboard.type(" Z");
  expect(await fontFamily()).toMatch(/^"?Arimo"?$/);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  expect(await fontFamily()).toMatch(/^"?updf-/);

  // So does bold, which the PDF has no face for.
  await bar(page).getByRole("button", { name: "Bold" }).click();
  expect(await fontFamily()).toMatch(/^"?Arimo"?$/);
});
