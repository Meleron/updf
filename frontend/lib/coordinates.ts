import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Edit-model coordinates are points (1/72 inch) from the top-left corner of the page as displayed, after cropping and
 * rotation. At 100% zoom a point is 96/72 CSS pixels, so pages appear at their actual size, as in standard viewers.
 */
export const cssPixelsPerPoint = 96 / 72;

export function toPixels(points: number, zoom: number): number {
  return points * cssPixelsPerPoint * zoom;
}

export function toPoints(pixels: number, zoom: number): number {
  return pixels / (cssPixelsPerPoint * zoom);
}

/** The page's displayed size in points. pdf.js applies the crop box and /Rotate, like the backend. */
export function displaySize(page: PDFPageProxy): { width: number; height: number } {
  const { width, height } = page.getViewport({ scale: 1 });
  return { width, height };
}

/** The index of the page at a vertical offset, given each page's top offset in order. */
export function pageAt(pageTops: number[], offset: number): number {
  const index = pageTops.findLastIndex((top) => top <= offset);
  return Math.max(index, 0);
}

/** The current page: the one a third of the way down the view, or the last one when scrolled to the bottom. */
export function currentPage(pageTops: number[], view: { top: number; height: number; scrollHeight: number }): number {
  if (view.top + view.height >= view.scrollHeight - 1) {
    return pageTops.length - 1;
  }
  return pageAt(pageTops, view.top + view.height / 3);
}

/** Mobile Safari doesn't draw canvases over 16,777,216 pixels. pdf.js's own viewer has a similar cap. */
export const maxCanvasPixels = 4096 * 4096;

/** Device pixels per CSS pixel for a page canvas: the screen's density, lowered when the canvas would be too big. */
export function canvasPixelRatio(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio, Math.sqrt(maxCanvasPixels / (cssWidth * cssHeight)));
}
