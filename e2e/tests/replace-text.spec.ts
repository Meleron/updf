import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { fixture, openInEditor, pageImage, pick } from "./helpers";
import { readText } from "./pdf";
import {
  addBox,
  expectExportedAsPreviewed,
  notoAscent,
  openAt100Percent,
  pixelsPerPoint,
  textBoxInput,
  tool,
} from "./text-boxes";

test.use({ locale: "en-US" });

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";
const hint = "Replaced text is hidden, not removed. Don't use this to remove sensitive information.";

function bar(page: Page) {
  return page.getByRole("toolbar", { name: "Formatting" });
}

/** Opens a fixture at 100% zoom, so a point is 4/3 of a CSS pixel. */
async function openFixtureAt100Percent(page: Page, name: string, total = 1) {
  await openInEditor(page, name);
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "100%", exact: true }).click();
  await expect(pageImage(page, 1, total)).toHaveAttribute("aria-busy", "false");
}

/** The position, in CSS pixels on the page at 100% zoom, of a point given in points. */
function at(x: number, y: number) {
  return { x: x * pixelsPerPoint, y: y * pixelsPerPoint };
}

/** Clicks a line of a fixture, given a point on it in points. */
async function replaceAt(page: Page, x: number, y: number, total = 1) {
  await pageImage(page, 1, total).click({ position: at(x, y) });
  await expect(textBoxInput(page)).toBeFocused();
}

test("hovering a line in Select shows a faint outline, but not with Add text", async ({ page }) => {
  await openAt100Percent(page);
  const outline = page.getByTestId("line-outline");

  await pageImage(page, 1, 1).hover({ position: at(100, 113) });
  await expect(outline).toBeVisible();
  const box = (await outline.boundingBox())!;
  const pageBox = (await pageImage(page, 1, 1).boundingBox())!;
  expect(box.x - pageBox.x).toBeLessThan(72 * pixelsPerPoint);
  expect(box.x + box.width - pageBox.x).toBeGreaterThan((72 + 240) * pixelsPerPoint);

  await pageImage(page, 1, 1).hover({ position: at(100, 400) });
  await expect(outline).toBeHidden();

  await tool(page, "Add text").click();
  await pageImage(page, 1, 1).hover({ position: at(100, 113) });
  await expect(outline).toBeHidden();
});

test("clicking a line replaces it: the original text in its own font and size, over a cover", async ({ page }) => {
  await openAt100Percent(page);

  await replaceAt(page, 100, 113);

  await expect(textBoxInput(page)).toHaveValue("This is a simple one-page document.");
  // A replacement keeps the original's font.
  await expect(bar(page).getByRole("button", { name: /^Font: / })).toHaveCount(0);
  await expect(bar(page).getByRole("spinbutton", { name: "Font size in points" })).toHaveValue("14");
  await expect(bar(page).getByRole("button", { name: "Colour: Black" })).toBeVisible();
  // Until it changes, the line shows as it is in the PDF.
  await expect(page.getByTestId("cover")).toHaveCount(0);
  // The cursor starts after the text.
  await page.keyboard.type(" Edited.");
  await expect(textBoxInput(page)).toHaveValue("This is a simple one-page document. Edited.");
  await expect(page.getByTestId("cover")).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("text-box")).toHaveText("This is a simple one-page document. Edited.");
  // A replaced line can't be replaced again.
  await pageImage(page, 1, 1).hover({ position: at(60, 113) });
  await expect(page.getByTestId("line-outline")).toBeHidden();
});

test("the style and colours come from the original line", async ({ page }) => {
  await openFixtureAt100Percent(page, "styles.pdf", 2);

  await replaceAt(page, 80, 92, 2);
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page).getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page).getByRole("spinbutton", { name: "Font size in points" })).toHaveValue("12");
  await page.keyboard.press("Escape");

  await replaceAt(page, 80, 116, 2);
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");

  // White text on a blue band: the text is white, and the cover is the band's blue.
  await replaceAt(page, 80, 178, 2);
  await expect(textBoxInput(page)).toHaveValue("White on blue");
  await expect(bar(page).getByRole("button", { name: "Colour: White" })).toBeVisible();
  await page.keyboard.type("!");
  await expect(page.getByTestId("cover")).toHaveCSS("background-color", "rgb(30, 58, 138)");
});

test("the cover takes the colour around the line", async ({ page }) => {
  await openFixtureAt100Percent(page, "coloured-background.pdf");

  await replaceAt(page, 100, 91);
  await page.keyboard.type("!");

  await expect(page.getByTestId("cover")).toHaveCSS("background-color", "rgb(254, 243, 199)");
});

test("deleting a replacement brings the original line back", async ({ page }) => {
  await openAt100Percent(page);
  await replaceAt(page, 100, 113);

  await bar(page).getByRole("button", { name: "Delete text box" }).click();

  await expect(page.getByTestId("cover")).toHaveCount(0);
  await expect(page.getByTestId("text-box")).toHaveCount(0);
  await pageImage(page, 1, 1).hover({ position: at(100, 113) });
  await expect(page.getByTestId("line-outline")).toBeVisible();

  // Emptying a replacement deletes it too.
  await replaceAt(page, 100, 113);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cover")).toHaveCount(0);
});

test("the delete button removes a new text box too", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page, 100, 400);
  await page.keyboard.type("Gone");

  await bar(page).getByRole("button", { name: "Delete text box" }).click();

  await expect(page.getByTestId("text-box")).toHaveCount(0);
});

test("the first replacement shows a hint once, and dismissing it keeps the edit", async ({ page }) => {
  await openAt100Percent(page);

  await replaceAt(page, 100, 113);
  const status = page.getByRole("status").filter({ hasText: hint });
  await expect(status).toBeVisible();
  await status.getByRole("button", { name: "Got it" }).click();
  await expect(status).toBeHidden();
  await expect(textBoxInput(page)).toBeFocused();
  await page.keyboard.press("Escape");

  await replaceAt(page, 100, 135);
  await expect(status).toBeHidden();
});

test("a scanned page says only adding text is available", async ({ page }) => {
  await openInEditor(page, "scanned.pdf");

  const hint = page.getByText("No text to replace on this page. Use Add text to write on it.");
  await expect(hint).toBeVisible();

  await tool(page, "Add text").click();
  await expect(hint).toBeHidden();
});

test("pages with text don't show the scanned page hint", async ({ page }) => {
  await openAt100Percent(page);
  await expect(page.getByTestId("line-outline")).toHaveCount(0);
  await pageImage(page, 1, 1).hover({ position: at(100, 113) });
  await expect(page.getByTestId("line-outline")).toBeVisible();

  await expect(page.getByText("No text to replace on this page.", { exact: false })).toBeHidden();
});

test("the exported PDF has the new text where the preview shows it, and the original covered", async ({ page, request }) => {
  await openAt100Percent(page);
  await replaceAt(page, 100, 113);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Shorter.");
  await page.keyboard.press("Escape");

  // The edit as the editor made it: the box's baseline on the original's (118 pt), and the cover from the preview.
  const cover = await page.getByTestId("cover").evaluate((element: HTMLElement) => ({
    x: parseFloat(element.style.left),
    y: parseFloat(element.style.top),
    width: parseFloat(element.style.width),
    height: parseFloat(element.style.height),
  }));
  const edit = {
    id: crypto.randomUUID(),
    page: 0,
    x: 72,
    y: 118 - notoAscent * 14,
    lines: ["Shorter."],
    style: { font: "Noto Sans", size: 14, bold: false, italic: false, underline: false, color: "#000000", align: "left" },
    cover: {
      x: cover.x / pixelsPerPoint,
      y: cover.y / pixelsPerPoint,
      width: cover.width / pixelsPerPoint,
      height: cover.height / pixelsPerPoint,
      color: "#FFFFFF",
    },
  };
  const response = await request.post(`${backendUrl}/api/pdf/export`, {
    multipart: {
      file: { name: "simple.pdf", mimeType: "application/pdf", buffer: readFileSync(fixture("simple.pdf")) },
      edits: JSON.stringify({ version: 1, edits: [edit] }),
    },
  });
  expect(response.status()).toBe(200);
  const exported = await response.body();
  await expectExportedAsPreviewed(page, page.getByTestId("text-box"), await readText(exported, 1));

  // Open the export: past the new text, the original line's area is plain white.
  await page.goto("/");
  await pick(page, { name: "simple-edited.pdf", mimeType: "application/pdf", buffer: exported });
  await expect(page).toHaveURL("/edit");
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "100%", exact: true }).click();
  const canvas = pageImage(page, 1, 1).locator("canvas");
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBe(Math.floor(595 * pixelsPerPoint));
  const inked = await canvas.evaluate((c: HTMLCanvasElement, area) => {
    const { data } = c.getContext("2d")!.getImageData(area.x, area.y, area.width, area.height);
    return data.filter((value, i) => i % 4 !== 3 && value < 250).length;
  }, { x: Math.round(140 * pixelsPerPoint), y: Math.round(104 * pixelsPerPoint), width: Math.round(170 * pixelsPerPoint), height: Math.round(18 * pixelsPerPoint) });
  expect(inked).toBe(0);
  const png = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));
  expect(Buffer.from(png.split(",")[1], "base64")).toMatchSnapshot("replaced-line.png");
});
