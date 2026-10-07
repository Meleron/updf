import { devices, expect, test, type Page } from "@playwright/test";
import { openInEditor, pageImage } from "./helpers";
import {
  addBox,
  addBoxAt,
  clickPage,
  defaultStyle,
  expectExportedAsPreviewed,
  expectNear,
  exportText,
  openAt100Percent,
  pixelsPerPoint,
  textBoxInput,
  tool,
  type Edit,
  type TextStyle,
} from "./text-boxes";

test.use({ locale: "en-US" });

function bar(page: Page) {
  return page.getByRole("toolbar", { name: "Formatting" });
}

function sizeField(page: Page) {
  return bar(page).getByRole("spinbutton", { name: "Font size in points" });
}

const fontNames = { sans: "Sans", serif: "Serif", mono: "Mono" };
const alignNames = { left: "Align left", center: "Centre", right: "Align right" };

/** Formats the box being edited through the bar, as a user would. Toggles are set to the given state. */
async function format(page: Page, style: Partial<TextStyle>) {
  if (style.font) {
    await bar(page).getByRole("button", { name: /^Font: / }).click();
    await page.getByRole("menuitemradio", { name: fontNames[style.font] }).click();
  }
  if (style.size) {
    await sizeField(page).fill(String(style.size));
    await sizeField(page).press("Enter");
  }
  for (const toggle of ["bold", "italic", "underline"] as const) {
    const button = bar(page).getByRole("button", { name: toggle[0].toUpperCase() + toggle.slice(1) });
    if (style[toggle] !== undefined && (await button.getAttribute("aria-pressed")) !== String(style[toggle])) {
      await button.click();
    }
  }
  if (style.color) {
    await bar(page).getByRole("button", { name: /^Colour: / }).click();
    await page.getByRole("menuitemradio", { name: { "#C62828": "Red", "#1565C0": "Blue", "#000000": "Black" }[style.color] }).click();
  }
  if (style.align) {
    await bar(page).getByRole("button", { name: alignNames[style.align] }).click();
  }
}

test("the formatting bar shows only while a text box is selected", async ({ page }) => {
  await openAt100Percent(page);
  await expect(bar(page)).toBeHidden();

  await addBox(page);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Font: Sans" })).toBeVisible();
  await expect(sizeField(page)).toHaveValue("12");

  await page.keyboard.type("Done");
  // Esc ends typing, and the box stays selected.
  await page.keyboard.press("Escape");
  await expect(textBoxInput(page)).toBeHidden();
  await expect(bar(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
});

test("every option shows in the preview, and typing goes on after each", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Zażółć");

  await format(page, { font: "serif", size: 20, bold: true, italic: true, underline: true, color: "#C62828", align: "center" });
  await expect(textBoxInput(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.type("gęślą jaźń");

  await expect(textBoxInput(page)).toHaveValue("Zażółć\ngęślą jaźń");
  for (const name of ["Bold", "Italic", "Underline", "Centre"]) {
    await expect(bar(page).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(bar(page).getByRole("button", { name: "Colour: Red" })).toBeVisible();
  await page.keyboard.press("Escape");

  const text = page.getByTestId("text-box").locator("div").first();
  await expect(text).toHaveCSS("font-family", '"Noto Serif"');
  // Firefox keeps font sizes in 1/64 px.
  expectNear(parseFloat(await text.evaluate((element) => getComputedStyle(element).fontSize)), 20 * pixelsPerPoint, 0.02);
  await expect(text).toHaveCSS("font-weight", "700");
  await expect(text).toHaveCSS("font-style", "italic");
  await expect(text).toHaveCSS("text-decoration-line", "underline");
  await expect(text).toHaveCSS("color", "rgb(198, 40, 40)");
  await expect(text).toHaveCSS("text-align", "center");
});

test("a custom colour is chosen with the colour picker", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Custom");

  await bar(page).getByRole("button", { name: /^Colour: / }).click();
  await page.getByRole("menuitem", { name: "Custom colour…" }).click();
  const picker = bar(page).getByLabel("Custom colour…");
  await expect(picker).toBeFocused();
  await picker.fill("#123abc");

  await expect(bar(page).getByRole("button", { name: "Colour: custom (#123ABC)" })).toBeVisible();
  await expect(textBoxInput(page)).toHaveCSS("color", "rgb(18, 58, 188)");
  // The edit is still going: the text box and the bar stay.
  await expect(textBoxInput(page)).toBeVisible();
});

test("the size is applied only from 6 to 72 pt", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Size");
  const fontSize = () => textBoxInput(page).evaluate((element) => getComputedStyle(element).fontSize);

  await sizeField(page).fill("100");
  expect(await fontSize()).toBe(`${12 * pixelsPerPoint}px`);
  await sizeField(page).fill("5");
  expect(await fontSize()).toBe(`${12 * pixelsPerPoint}px`);
  await sizeField(page).fill("6");
  expect(await fontSize()).toBe(`${6 * pixelsPerPoint}px`);
  await sizeField(page).fill("72");
  expect(await fontSize()).toBe(`${72 * pixelsPerPoint}px`);

  // Leaving the field shows the box's size again.
  await sizeField(page).fill("200");
  await sizeField(page).press("Enter");
  await expect(textBoxInput(page)).toBeFocused();
  await expect(sizeField(page)).toHaveValue("72");
});

test("new boxes take the style used last", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("First");
  await format(page, { font: "mono", bold: true, color: "#1565C0" });
  await page.keyboard.press("Escape");

  await addBox(page, 100, 300);

  await expect(bar(page).getByRole("button", { name: "Font: Mono" })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page).getByRole("button", { name: "Colour: Blue" })).toBeVisible();
});

test("the exported PDF has every style where the preview shows it", async ({ page, request }) => {
  await openAt100Percent(page);
  const boxes: { at: [number, number]; lines: string[]; style: Partial<TextStyle> }[] = [
    { at: [60, 140], lines: ["Zażółć gęślą jaźń", "Centred"], style: { font: "serif", size: 20, bold: true, italic: true, align: "center" } },
    { at: [60, 260], lines: ["Right aligned mono", "Съешь"], style: { font: "mono", size: 9, italic: true, align: "right" } },
    { at: [60, 340], lines: ["Duży Ξ"], style: { size: 36, bold: true, underline: true, color: "#C62828" } },
    { at: [60, 440], lines: ["Tiny serif text"], style: { font: "serif", size: 6 } },
  ];
  const edits: Edit[] = [];
  for (const box of boxes) {
    const position = await addBoxAt(page, ...box.at);
    await page.keyboard.type(box.lines.join("\n"));
    await format(page, box.style);
    await page.keyboard.press("Escape");
    // Each box starts in the style used last, so the edit starts from the box before.
    const style: TextStyle = { ...(edits.at(-1)?.style ?? defaultStyle), ...box.style };
    edits.push({ ...position, lines: box.lines, style });
  }

  const exported = await exportText(request, edits);

  for (const [i] of boxes.entries()) {
    await expectExportedAsPreviewed(page, page.getByTestId("text-box").nth(i), exported);
  }
});

test("characters the fonts can't show get a warning on the text box", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);

  await page.keyboard.type("Zażółć Съешь Ξεσκεπάζω");
  await expect(page.getByRole("status")).toHaveCount(0);

  await page.keyboard.type(" 😀 你好");
  const warning = page.getByTestId("text-box").getByRole("status");
  await expect(warning).toHaveText("The PDF fonts can't show: 😀 你 好");
  await expect(textBoxInput(page)).toHaveAccessibleDescription("The PDF fonts can't show: 😀 你 好");

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Backspace");
  }
  await expect(warning).toBeHidden();
});

test("the bar works from the keyboard, and Esc finishes the edit", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Keys");

  // Tab goes from the text box to the bar: the font menu, the size, then bold.
  await page.keyboard.press("Tab");
  await expect(bar(page).getByRole("button", { name: "Font: Sans" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "Sans" })).toBeVisible();
  // Esc closes only the menu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(bar(page)).toBeVisible();

  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Space");
  await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await expect(textBoxInput(page)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(bar(page)).toBeHidden();
  await expect(page.getByTestId("text-box")).toHaveText("Keys");
  await expect(page.getByTestId("text-box").locator("div").first()).toHaveCSS("font-weight", "700");
});

// Menus jump to an item by its first letter, which must not choose a tool.
test("typing in a menu or the bar doesn't trigger editor shortcuts", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Menu");

  await bar(page).getByRole("button", { name: "Font: Sans" }).click();
  await page.keyboard.press("t");
  await page.keyboard.press("Escape");
  await bar(page).getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("t");

  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
});

test("clicking outside while in the bar finishes the edit", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Outside");
  await sizeField(page).click();

  await clickPage(page, 300, 500);

  await expect(bar(page)).toBeHidden();
  await expect(page.getByTestId("text-box")).toHaveText("Outside");
});

test.describe("on a small phone", () => {
  const { defaultBrowserType: _, ...pixel } = devices["Pixel 7"];
  test.use({ ...pixel, viewport: { width: 360, height: 740 } });

  test("the bar fits the screen, and tapping it keeps the edit", async ({ page }) => {
    await openInEditor(page, "simple.pdf");
    await page.getByRole("group", { name: "Tools" }).getByRole("button", { name: "Add text" }).tap();
    await pageImage(page, 1, 1).tap({ position: { x: 40, y: 200 } });
    await page.keyboard.type("Tap");

    const box = (await bar(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await bar(page).getByRole("button", { name: "Bold" }).tap();

    await expect(bar(page).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    await expect(textBoxInput(page)).toBeFocused();
  });
});
