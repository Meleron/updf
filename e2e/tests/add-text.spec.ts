import { devices, expect, test, type Page } from "@playwright/test";
import { openInEditor, pageImage } from "./helpers";
import { readText } from "./pdf";
import {
  addBox,
  clickPage,
  download,
  expectExportedAsPreviewed,
  expectNear,
  notoAscent,
  notoLineHeight,
  openAt100Percent,
  pixelsPerPoint,
  tool,
} from "./text-boxes";

test.use({ locale: "en-US" });

/** The text box's left edge and first baseline, in CSS pixels from the page's top-left corner. */
async function offsetOnPage(page: Page) {
  const pageBox = (await pageImage(page, 1, 1).boundingBox())!;
  const textBox = (await page.getByTestId("text-box").boundingBox())!;
  const baseline = await page.getByTestId("text-box").evaluate((box) => {
    const marker = document.createElement("span");
    marker.style.display = "inline-block";
    box.firstElementChild!.prepend(marker);
    const top = marker.getBoundingClientRect().top;
    marker.remove();
    return top;
  });
  return { x: textBox.x - pageBox.x, baseline: baseline - pageBox.y };
}

test("Select is the default tool, and Add text is chosen from the toolbar or with T", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones have no room for the Select button: Add text switches back to it.");
  await openInEditor(page, "simple.pdf");
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  await expect(tool(page, "Add text")).toHaveAttribute("aria-pressed", "false");

  await tool(page, "Add text").click();
  await expect(tool(page, "Add text")).toHaveAttribute("aria-pressed", "true");
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "false");

  await tool(page, "Select").click();
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("t");
  await expect(tool(page, "Add text")).toHaveAttribute("aria-pressed", "true");

  // Pressing Add text again goes back to Select.
  await tool(page, "Add text").click();
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("t");

  await page.keyboard.press("Escape");
  await expect(tool(page, "Select")).toHaveAttribute("aria-pressed", "true");
});

test("adds multi-line Polish text where the page is clicked, in Noto with its line spacing", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  // Placing a box goes back to Select.
  await expect(tool(page, "Add text")).toHaveAttribute("aria-pressed", "false");

  // Typing "t" here doesn't choose the Add text tool.
  await page.keyboard.type("Zażółć gęślą jaźń");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Pchnąć w tę łódź jeża");
  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveValue("Zażółć gęślą jaźń\nPchnąć w tę łódź jeża");
  await expect(tool(page, "Add text")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveCount(0);
  const box = page.getByTestId("text-box");
  await expect(box).toHaveText("Zażółć gęślą jaźń\nPchnąć w tę łódź jeża", { useInnerText: true });
  const offset = await offsetOnPage(page);
  expectNear(offset.x, 100);
  // The PDF puts the first baseline one ascent below the box's top.
  expectNear(offset.baseline, 120 + notoAscent * 12 * pixelsPerPoint);
  expectNear((await box.boundingBox())!.height, 2 * notoLineHeight * 12 * pixelsPerPoint, 0.1);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family.replaceAll('"', "")),
  );
  expect(loaded).toContain("Noto Sans");
});

test("the downloaded PDF has the text where the preview shows it", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page, 100, 120);
  await page.keyboard.type(["Zażółć gęślą jaźń", "Pchnąć w tę łódź jeża", "WAVE AVAVAV Τέλος Конец"].join("\n"));
  await page.keyboard.press("Escape");

  const { pdf } = await download(page);

  await expectExportedAsPreviewed(page, page.getByTestId("text-box"), await readText(pdf, 1));
});

test("text boxes keep their place on the page when zooming", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Zoomed");
  await page.keyboard.press("Escape");
  const box = page.getByTestId("text-box");
  const before = await offsetOnPage(page);

  await page.getByRole("button", { name: "Zoom: 100%" }).click();
  await page.getByRole("menuitemradio", { name: "200%", exact: true }).click();

  await expect.poll(async () => (await box.boundingBox())!.height).toBeCloseTo(notoLineHeight * 12 * pixelsPerPoint * 2, 1);
  const after = await offsetOnPage(page);
  expectNear(after.x, 2 * before.x, 0.1);
  expectNear(after.baseline, 2 * before.baseline, 0.1);
});

test("clicking outside finishes the edit without adding another box", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  await page.keyboard.type("Finished");

  await clickPage(page, 300, 400);

  await expect(page.getByRole("textbox", { name: "Text box" })).toHaveCount(0);
  await expect(page.getByTestId("text-box")).toHaveCount(1);
  await expect(page.getByTestId("text-box")).toHaveText("Finished");
});

test("a box left empty is discarded with Esc or a click outside", async ({ page }) => {
  await openAt100Percent(page);

  await addBox(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("text-box")).toHaveCount(0);

  await addBox(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("  ");
  await clickPage(page, 300, 400);
  await expect(page.getByTestId("text-box")).toHaveCount(0);
});

test("a box discarded before its font loads doesn't fail when the font arrives", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  let releaseFonts = () => {};
  const fontsHeld = new Promise<void>((resolve) => (releaseFonts = resolve));
  await page.route("**/fonts/**", async (route) => {
    await fontsHeld;
    await route.continue();
  });
  await openAt100Percent(page);

  await addBox(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("text-box")).toHaveCount(0);
  releaseFonts();

  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
});

// Switching to another window blurs the text box too, which must not end the edit.
test("the edit continues after switching to another window and back", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page);
  const textBox = page.getByRole("textbox", { name: "Text box" });

  await textBox.evaluate((element) => {
    const hasFocus = document.hasFocus;
    document.hasFocus = () => false;
    element.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    document.hasFocus = hasFocus;
  });

  await expect(textBox).toBeVisible();
  await page.keyboard.type("Pasted");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("text-box")).toHaveText("Pasted");
});

test.describe("on a small phone", () => {
  const { defaultBrowserType: _, ...pixel } = devices["Pixel 7"];
  test.use({ ...pixel, viewport: { width: 360, height: 740 } });

  test("the top bar fits, and text is added with a tap", async ({ page }) => {
    await openInEditor(page, "simple.pdf");
    expect(await page.locator("header").evaluate((header) => header.scrollWidth <= header.clientWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Download" })).toBeInViewport({ ratio: 1 });

    await tool(page, "Add text").tap();
    await pageImage(page, 1, 1).tap({ position: { x: 40, y: 60 } });
    await expect(page.getByRole("textbox", { name: "Text box" })).toBeFocused();
    await page.keyboard.type("Zażółć");
    await page.getByRole("main").tap({ position: { x: 4, y: 4 } });

    await expect(page.getByTestId("text-box")).toHaveText("Zażółć");
  });
});
