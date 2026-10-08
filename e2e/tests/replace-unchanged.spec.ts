import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixture, openInEditor, pageImage } from "./helpers";
import { readText } from "./pdf";
import { textBoxInput } from "./text-boxes";

test.use({ locale: "en-US" });
// At 200% a phone's canvas would pass the size mobile browsers can draw, so it's drawn smaller than the screen, and
// these checks need it at full size. Desktop Chromium runs the same engine.
test.skip(({ isMobile }) => isMobile, "The canvas is capped below full size on phones at 200%.");

/** CSS pixels per point at 200% zoom, where a fraction of a point shows. */
const scale = 2 * (96 / 72);

/** kerned.pdf's lines: LibreOffice Writer's kerning, a justified line and an underline, all 12 pt. */
async function lines() {
  const byBaseline = new Map<number, { text: string; x: number; right: number; baseline: number }>();
  for (const text of await readText(readFileSync(fixture("kerned.pdf")), 1)) {
    const key = Math.round(text.baseline);
    const line = byBaseline.get(key) ?? { text: "", x: text.x, right: text.x + text.width, baseline: text.baseline };
    byBaseline.set(key, { ...line, text: line.text + text.text, x: Math.min(line.x, text.x), right: Math.max(line.right, text.x + text.width) });
  }
  return [...byBaseline.values()];
}

/** The line's own area, inside its text box, so the box's outline isn't in it. */
function shot(page: Page, line: { x: number; right: number; baseline: number }, pageBox: { x: number; y: number }) {
  return page.screenshot({
    clip: {
      x: pageBox.x + line.x * scale,
      y: pageBox.y + (line.baseline - 10.5) * scale,
      width: (line.right - line.x) * scale,
      height: 13 * scale,
    },
  });
}

/** Opens kerned.pdf at 200%, scrolled to the top left, with the replacement hint already seen and no blinking caret. */
async function openKerned(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("updf.replaceHint", "shown"));
  await openInEditor(page, "kerned.pdf");
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "200%", exact: true }).click();
  await page.getByTestId("pages").evaluate((element) => element.scrollTo({ left: 0, top: 0 }));
  // The page is drawn again at the new zoom, into a canvas as large as the page.
  await expect
    .poll(() => pageImage(page, 1, 1).evaluate((element) => (element.querySelector("canvas")?.width ?? 0) >= element.clientWidth * devicePixelRatio - 2))
    .toBe(true);
  await page.addStyleTag({ content: "textarea { caret-color: transparent !important; }" });
  await page.mouse.move(0, 0);
  return (await pageImage(page, 1, 1).boundingBox())!;
}

/** The horizontal bounds of a line's text in pixels: its dark grey pixels, not the box's blue outline. */
async function textBounds(page: Page, line: { x: number; right: number; baseline: number }, pageBox: { x: number; y: number }) {
  const png = (await shot(page, { ...line, right: line.right + 20 }, pageBox)).toString("base64");
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data: pixels, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let [left, right] = [width, -1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (pixels[i] < 128 && pixels[i + 2] < 128) {
          [left, right] = [Math.min(left, x), Math.max(right, x)];
        }
      }
    }
    return { left, right };
  }, png);
}

test("clicking a line and leaving it unchanged changes nothing, and leaves nothing to undo", async ({ page }) => {
  const pageBox = await openKerned(page);

  for (const line of await lines()) {
    const before = await shot(page, line, pageBox);

    await pageImage(page, 1, 1).click({ position: { x: (line.x + 3) * scale, y: (line.baseline - 3) * scale } });
    await expect(textBoxInput(page)).toBeFocused();
    await page.mouse.move(0, 0);
    expect(await shot(page, line, pageBox), `open at ${line.baseline}`).toEqual(before);

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    expect(await shot(page, line, pageBox), `finished at ${line.baseline}`).toEqual(before);
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  }
});

test("typing in a kerned line keeps its letters where they were", async ({ page }) => {
  const pageBox = await openKerned(page);
  // "Yo" is kerned, and the other line has no kerned pairs. Browsers don't kern a space, so the other lines, with kerned
  // spaces, move by about 0.2 pt per space.
  const kerned = (await lines()).filter((line) => ["You can edit these lines", "minimum illumination without kerning pairs"].includes(line.text));
  expect(kerned).toHaveLength(2);

  for (const line of kerned) {
    const before = await textBounds(page, line, pageBox);
    await pageImage(page, 1, 1).click({ position: { x: (line.x + 3) * scale, y: (line.baseline - 3) * scale } });
    // A trailing space changes the line without adding ink.
    await page.keyboard.type(" ");
    await page.mouse.move(0, 0);

    const after = await textBounds(page, line, pageBox);
    expect(Math.abs(after.left - before.left), `left at ${line.baseline}`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.right - before.right), `right at ${line.baseline}`).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
});
