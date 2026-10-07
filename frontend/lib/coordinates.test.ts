import { expect, it } from "vitest";
import { fixture } from "@/test-utils/pdf";
import { canvasPixelRatio, currentPage, displaySize, maxCanvasPixels, pageAt, toPixels, toPoints } from "./coordinates";
import { checkPdf } from "./pdf-check";

it.each([0.5, 1, 1.25, 2])("converts points to screen pixels and back at %s zoom", (zoom) => {
  expect(toPixels(72, zoom)).toBeCloseTo(96 * zoom);
  expect(toPoints(toPixels(123.4, zoom), zoom)).toBeCloseTo(123.4);
});

// Sizes as a standard viewer shows them (pdfinfo reports the same).
it.each([
  ["simple.pdf", 595, 842],
  ["rotated.pdf", 842, 595],
  ["cropped.pdf", 395, 642],
])("gives %s its displayed size in points", async (name, width, height) => {
  const result = await checkPdf(fixture(name));
  if (!("document" in result)) throw new Error(result.error);

  expect(displaySize(await result.document.getPage(1))).toEqual({ width, height });
  await result.document.loadingTask.destroy();
});

it.each([
  [0, 0],
  [99, 0],
  [100, 1],
  [250, 2],
  [10_000, 2],
])("finds the page at offset %s", (offset, page) => {
  expect(pageAt([0, 100, 200], offset)).toBe(page);
});

it("draws canvases at the screen's pixel density", () => {
  expect(canvasPixelRatio(793, 1123, 1)).toBe(1);
  expect(canvasPixelRatio(793, 1123, 2)).toBe(2);
});

it("lowers the density when a canvas would exceed what mobile browsers can draw", () => {
  // An A4 page at 200% on a phone with three device pixels per CSS pixel.
  const ratio = canvasPixelRatio(1587, 2245, 3);

  expect(ratio).toBeLessThan(3);
  expect(1587 * ratio * 2245 * ratio).toBeLessThanOrEqual(maxCanvasPixels);
  expect(1587 * ratio * 2245 * ratio).toBeGreaterThan(maxCanvasPixels * 0.99);
});

it("takes the page a third of the way down the view as the current page", () => {
  expect(currentPage([0, 600, 1200], { top: 400, height: 900, scrollHeight: 3000 })).toBe(1);
});

it("takes the last page as current when scrolled to the bottom", () => {
  // The last page's top never reaches a third of the way down when pages are shorter than two thirds of the view.
  expect(currentPage([0, 600, 1200, 1800], { top: 1500, height: 900, scrollHeight: 2400 })).toBe(3);
});
