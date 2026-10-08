import { readFile } from "node:fs/promises";
import { expect, type Locator, type Page } from "@playwright/test";
import { openInEditor, pageImage, pick } from "./helpers";
import type { readText } from "./pdf";

/** CSS pixels per point at 100% zoom. */
export const pixelsPerPoint = 96 / 72;
/** Noto's ascent and line spacing (ascent + descent + line gap) per em, which the backend uses too. */
export const notoAscent = 1.069;
export const notoLineHeight = 1.362;

export type TextStyle = {
  font: "Noto Sans" | "Noto Serif" | "Noto Sans Mono";
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: "left" | "center" | "right";
};

export const defaultStyle: TextStyle = {
  font: "Noto Sans",
  size: 12,
  bold: false,
  italic: false,
  underline: false,
  color: "#000000",
  align: "left",
};

/** Mouse events land on whole pixels, so a click can be up to a pixel from the requested position. */
export function expectNear(actual: number, expected: number, tolerance = 1) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

export function tool(page: Page, name: "Select" | "Add text") {
  return page.getByRole("group", { name: "Tools" }).getByRole("button", { name });
}

export function textBoxInput(page: Page) {
  return page.getByRole("textbox", { name: "Text box" });
}

async function zoomTo100Percent(page: Page) {
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "100%", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zoom: 100%" })).toBeVisible();
}

export async function openAt100Percent(page: Page) {
  await openInEditor(page, "simple.pdf");
  await zoomTo100Percent(page);
}

/**
 * Opens a downloaded copy of simple.pdf, in place of the autosaved original, in the editor at 100% zoom, and returns its page's canvas once it's drawn at
 * that size, where a point is 4/3 of a canvas pixel.
 */
export async function openDownloaded(page: Page, file: { name: string; pdf: Buffer }) {
  await page.goto("/");
  await pick(page, { name: file.name, mimeType: "application/pdf", buffer: file.pdf });
  // The edited document replaces the autosaved one, which asks first if its edits were saved by now.
  const replace = page.getByRole("alertdialog").getByRole("button", { name: "Replace" });
  await expect(replace.or(page.getByTestId("pages"))).toBeVisible();
  if (await replace.isVisible()) {
    await replace.click();
  }
  await expect(page).toHaveURL("/edit");
  await zoomTo100Percent(page);
  const canvas = pageImage(page, 1, 1).locator("canvas");
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBe(Math.floor(595 * pixelsPerPoint));
  return canvas;
}

/** Clicks the first page at a position in CSS pixels from its top-left corner. */
export async function clickPage(page: Page, x: number, y: number) {
  await pageImage(page, 1, 1).click({ position: { x, y } });
}

export async function addBox(page: Page, x = 100, y = 120) {
  await tool(page, "Add text").click();
  await clickPage(page, x, y);
  await expect(textBoxInput(page)).toBeFocused();
}

/** Where the preview draws each line of a finished text box, in points from the page's top-left corner, at 100% zoom. */
export async function previewLines(page: Page, box: Locator) {
  const pageBox = (await pageImage(page, 1, 1).boundingBox())!;
  const lines = await box.evaluate((element) => {
    const text = element.firstElementChild!.lastChild!;
    const marker = document.createElement("span");
    marker.style.display = "inline-block";
    text.parentNode!.insertBefore(marker, text);
    const firstBaseline = marker.getBoundingClientRect().top;
    marker.remove();
    const range = document.createRange();
    let start = 0;
    const rects = text.textContent!.split("\n").map((line) => {
      range.setStart(text, start);
      range.setEnd(text, start + line.length);
      start += line.length + 1;
      return { text: line, rect: range.getClientRects()[0] };
    });
    return rects.map(({ text, rect }) => ({
      text,
      left: rect.left,
      // Each line's box sits one line pitch below the one before, and so does its baseline.
      baseline: firstBaseline + rect.top - rects[0].rect.top,
      width: rect.width,
    }));
  });
  return lines.map((line) => ({
    text: line.text,
    x: (line.left - pageBox.x) / pixelsPerPoint,
    baseline: (line.baseline - pageBox.y) / pixelsPerPoint,
    width: line.width / pixelsPerPoint,
  }));
}

/** Downloads the edited PDF with the Download button, and returns its name and contents. */
export async function download(page: Page) {
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const file = await saved;
  return { name: file.suggestedFilename(), pdf: await readFile(await file.path()) };
}

/** Checks that every line of a finished box is in the exported text where the preview draws it, within 0.25 pt. */
export async function expectExportedAsPreviewed(page: Page, box: Locator, exported: Awaited<ReturnType<typeof readText>>) {
  for (const line of await previewLines(page, box)) {
    const pdf = exported.find((text) => text.text === line.text);
    expect(pdf, line.text).toBeDefined();
    expectNear(pdf!.x, line.x, 0.25);
    expectNear(pdf!.baseline, line.baseline, 0.25);
    expectNear(pdf!.width, line.width, 0.25);
  }
}
