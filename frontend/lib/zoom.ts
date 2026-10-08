import { toPixels } from "./coordinates";

export const minZoom = 0.5;
export const maxZoom = 2;
export const zoomSteps = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** The zoom at which a page fills the available width. Up to 200%, and below 50% on narrow screens. */
export function fitWidth(availablePixels: number, pageWidthPoints: number): number {
  return Math.min(maxZoom, availablePixels / toPixels(pageWidthPoints, 1));
}

export function zoomIn(zoom: number): number {
  return zoomSteps.find((step) => step > zoom + 0.001) ?? maxZoom;
}

export function zoomOut(zoom: number): number {
  return zoomSteps.findLast((step) => step < zoom - 0.001) ?? minZoom;
}

/**
 * The zoom after a Ctrl+wheel event with a vertical delta in pixels: about a fifth per mouse wheel notch (100 pixels),
 * and smoothly for the small deltas of a trackpad pinch.
 */
export function wheelZoom(zoom: number, deltaY: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom * Math.exp(-deltaY / 500)));
}
