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
