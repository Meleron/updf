import { devices, expect, test, type Page } from "@playwright/test";
import { openInEditor, pageImage, pick, recordZoomLabels, zoomLabels, showThumbnails } from "./helpers";


function thumbnails(page: Page) {
  return page.getByRole("navigation", { name: "Page thumbnails" });
}

async function expectWidth(page: Page, number: number, total: number, width: number) {
  await expect.poll(async () => (await pageImage(page, number, total).boundingBox())?.width).toBeCloseTo(width, 0);
}

async function chooseZoom(page: Page, option: string) {
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: option, exact: true }).click();
}

/** A PDF that opens, but whose only page points to an object that doesn't exist. */
function pdfWithBrokenPage(): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"];
  let pdf = "%PDF-1.7\n";
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test.use({ locale: "en-US" });

test("pages are drawn when they come into view and freed when far away", async ({ page }) => {
  await openInEditor(page, "pages-100.pdf");
  await expect(pageImage(page, 1, 100)).toHaveAttribute("aria-busy", "false");
  await expect(pageImage(page, 60, 100).locator("canvas")).toHaveCount(0);

  await pageImage(page, 60, 100).scrollIntoViewIfNeeded();

  await expect(pageImage(page, 60, 100)).toHaveAttribute("aria-busy", "false");
  await expect(pageImage(page, 60, 100).locator("canvas")).toHaveCount(1);
  await expect(pageImage(page, 1, 100).locator("canvas")).toHaveCount(0);
});

test("clicking a thumbnail scrolls to its page and marks it as current", async ({ page }) => {
  await openInEditor(page, "pages-100.pdf");
  await showThumbnails(page);
  await expect(thumbnails(page).getByRole("button")).toHaveCount(100);
  const thumbnail = thumbnails(page).getByRole("button", { name: "Page 42", exact: true });

  await thumbnail.click();

  await expect(pageImage(page, 42, 100)).toBeInViewport();
  // On phones choosing a page closes the panel.
  await showThumbnails(page);
  await expect(thumbnail).toHaveAttribute("aria-current", "page");
});

test("thumbnails work from the keyboard", async ({ page }) => {
  await openInEditor(page, "pages-100.pdf");
  await showThumbnails(page);

  await thumbnails(page).getByRole("button", { name: "Page 7", exact: true }).focus();
  await page.keyboard.press("Enter");

  await expect(pageImage(page, 7, 100)).toBeInViewport();
});

test("the thumbnail panel can be hidden and shown", async ({ page, isMobile }) => {
  test.skip(isMobile, "On phones the panel starts closed, which the phone tests below cover.");
  await openInEditor(page, "simple.pdf");
  const toggle = page.getByRole("button", { name: "Page thumbnails" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await toggle.click();
  await expect(thumbnails(page)).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(thumbnails(page)).toBeVisible();
});

test("zoom fits the page width by default and stays within 50% to 200%", async ({ page, isMobile }) => {
  test.skip(isMobile, "Phones have no room for the zoom in and out buttons, only the zoom menu.");
  await openInEditor(page, "simple.pdf");
  const availableWidth = await page.getByTestId("pages").evaluate((pages) => pages.clientWidth - 48);
  await expectWidth(page, 1, 1, availableWidth);

  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  while (await zoomIn.isEnabled()) {
    await zoomIn.click();
  }
  await expect(page.getByRole("button", { name: "Zoom: 200%" })).toBeVisible();
  await expectWidth(page, 1, 1, (595 * 4) / 3 * 2);

  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  while (await zoomOut.isEnabled()) {
    await zoomOut.click();
  }
  await expect(page.getByRole("button", { name: "Zoom: 50%" })).toBeVisible();
  await expectWidth(page, 1, 1, (595 * 4) / 3 / 2);

  await page.getByRole("button", { name: "Zoom: 50%" }).click();
  await page.getByRole("menuitemradio", { name: "Fit width" }).click();
  await expectWidth(page, 1, 1, availableWidth);
});

test("the top bar has the file name and the editor's controls, with Download the only accent button", async ({ page }) => {
  await openInEditor(page, "simple.pdf");
  const bar = page.getByRole("banner");

  await expect(bar.getByRole("heading", { name: "simple.pdf" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Redo" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Zoom: \d+%$/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Language EN" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Toggle theme" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Download" })).toBeVisible();
  await expect(page.locator('[data-variant="default"]')).toHaveCount(1);
  await expect(page.locator('[data-variant="default"]')).toHaveAccessibleName("Download");
});

// Displayed sizes in points, as pdfinfo reports them. At 50% a point is 2/3 of a CSS pixel. The drawn canvas is compared
// with an image checked against pdftoppm's rendering, independent of where the page sits on screen.
for (const [name, width, height] of [
  ["rotated.pdf", 842, 595],
  ["cropped.pdf", 395, 642],
  ["form.pdf", 595, 842],
] as const) {
  test(`${name} displays as in a standard viewer`, async ({ page }) => {
    await openInEditor(page, name);
    await page.getByRole("button", { name: /^Zoom: / }).click();
    await page.getByRole("menuitemradio", { name: "50%", exact: true }).click();
    const image = pageImage(page, 1, 1);

    await expectWidth(page, 1, 1, (width * 2) / 3);
    const box = (await image.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(width / height, 2);
    const canvas = image.locator("canvas");
    const pixels = Math.floor(((width * 2) / 3) * (await page.evaluate(() => devicePixelRatio)));
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBe(pixels);
    const png = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL("image/png"));
    expect(Buffer.from(png.split(",")[1], "base64")).toMatchSnapshot(name.replace(".pdf", ".png"));
  });
}

test("the zoom shows the fitted value from the start", async ({ page }) => {
  await recordZoomLabels(page);

  await openInEditor(page, "pages-100.pdf");

  await expect(pageImage(page, 1, 100)).toHaveAttribute("aria-busy", "false");
  expect(await zoomLabels(page)).not.toContain("Zoom: 0%");
});

test("a page that can't be loaded shows a message instead of a blank editor", async ({ page }) => {
  await page.goto("/");

  await pick(page, { name: "broken-page.pdf", mimeType: "application/pdf", buffer: pdfWithBrokenPage() });

  await expect(page).toHaveURL("/edit");
  await expect(page.getByRole("alert").filter({ hasText: "This PDF is damaged and can't be opened." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open another PDF" })).toBeVisible();
});

test.describe("with a tall window", () => {
  test.use({ viewport: { width: 1280, height: 1000 } });

  test("the last page becomes current when its thumbnail is clicked", async ({ page }) => {
    await openInEditor(page, "pages-100.pdf");
    await chooseZoom(page, "50%");
    const last = thumbnails(page).getByRole("button", { name: "Page 100", exact: true });

    await last.click();

    await expect(last).toHaveAttribute("aria-current", "page");
  });
});

test.describe("with a very wide window", () => {
  test.use({ viewport: { width: 3400, height: 900 } });

  test("choosing the zoom already shown doesn't make a later resize jump back", async ({ page }) => {
    await openInEditor(page, "pages-100.pdf");
    await expect(page.getByRole("button", { name: "Zoom: 200%" })).toBeVisible();
    await chooseZoom(page, "200%");
    await chooseZoom(page, "Fit width");
    await thumbnails(page).getByRole("button", { name: "Page 60", exact: true }).click();
    await expect(pageImage(page, 60, 100)).toBeInViewport();

    await page.setViewportSize({ width: 1280, height: 900 });

    await expect(page.getByRole("button", { name: /^Zoom: 1\d\d%$/ })).toBeVisible();
    await expect(pageImage(page, 1, 100)).not.toBeInViewport();
  });
});

test.describe("on a high-density screen", () => {
  test.use({ deviceScaleFactor: 3 });

  test("page canvases stay within the size mobile browsers can draw", async ({ page }) => {
    await openInEditor(page, "simple.pdf");

    await chooseZoom(page, "200%");

    const canvas = pageImage(page, 1, 1).locator("canvas");
    await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(1587);
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width * c.height)).toBeLessThanOrEqual(4096 * 4096);
  });
});

test.describe("on a phone", () => {
  const { defaultBrowserType: _, ...pixel } = devices["Pixel 7"];
  test.use(pixel);

  test("the thumbnail panel starts collapsed and the pages fit the screen", async ({ page }) => {
    await openInEditor(page, "pages-100.pdf");

    await expect(thumbnails(page)).toBeHidden();
    await expect(pageImage(page, 1, 100)).toHaveAttribute("aria-busy", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.getByTestId("pages").evaluate((pages) => pages.scrollWidth <= pages.clientWidth)).toBe(true);
  });

  test("a thumbnail opened from the collapsed panel shows its page and closes the panel", async ({ page }) => {
    await openInEditor(page, "pages-100.pdf");

    await page.getByRole("button", { name: "Page thumbnails" }).click();
    await thumbnails(page).getByRole("button", { name: "Page 3", exact: true }).click();

    await expect(thumbnails(page)).toBeHidden();
    await expect(pageImage(page, 3, 100)).toBeInViewport();
  });
});
