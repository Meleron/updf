import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { fixture, openInEditor, pageImage } from "./helpers";
import { readText } from "./pdf";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";

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

export async function openAt100Percent(page: Page) {
  await openInEditor(page, "simple.pdf");
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "100%", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zoom: 100%" })).toBeVisible();
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

/**
 * Adds a box about x by y CSS pixels from the first page's corner, clicking on whole pixels as mouse events do, and
 * returns the edit's position in points, worked out as the editor does. The page must be at 100% zoom.
 */
export async function addBoxAt(page: Page, x: number, y: number) {
  const pageBox = (await pageImage(page, 1, 1).boundingBox())!;
  const click = { x: Math.ceil(pageBox.x) + x, y: Math.ceil(pageBox.y) + y };
  await tool(page, "Add text").click();
  await page.mouse.click(click.x, click.y);
  await expect(textBoxInput(page)).toBeFocused();
  return { x: (click.x - pageBox.x) / pixelsPerPoint, y: (click.y - pageBox.y) / pixelsPerPoint };
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

export type Edit = { x: number; y: number; lines: string[]; style: TextStyle };

/**
 * Exports simple.pdf with text edits on its first page and returns that page's text. F-012 sends the editor's edits
 * with the Download button; until then tests send the same edits to the export API.
 */
export async function exportText(request: APIRequestContext, edits: Edit[]) {
  const response = await request.post(`${backendUrl}/api/pdf/export`, {
    multipart: {
      file: { name: "simple.pdf", mimeType: "application/pdf", buffer: readFileSync(fixture("simple.pdf")) },
      edits: JSON.stringify({ version: 1, edits: edits.map((edit) => ({ id: randomUUID(), page: 0, ...edit })) }),
    },
  });
  expect(response.status()).toBe(200);
  return readText(await response.body(), 1);
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
