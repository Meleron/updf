import { expect, it } from "vitest";
import { fitWidth, maxZoom, minZoom, wheelZoom, zoomIn, zoomOut } from "./zoom";

it("fits an A4 page into the available width at actual size or larger", () => {
  // A4 is 595pt wide, which is 793.33 CSS pixels at 100%.
  expect(fitWidth(793.33, 595)).toBeCloseTo(1);
  expect(fitWidth(1190, 595)).toBeCloseTo(1.5);
});

it("never fits wider than 200%", () => {
  expect(fitWidth(5000, 595)).toBe(maxZoom);
});

it("fits below 50% on narrow screens, so the whole page width stays visible", () => {
  expect(fitWidth(327, 595)).toBeCloseTo(0.41, 2);
});

it.each([
  [0.5, 0.75],
  [0.87, 1],
  [1, 1.25],
  [1.5, 2],
  [0.41, 0.5],
])("zooms in from %s to %s", (from, to) => {
  expect(zoomIn(from)).toBe(to);
});

it.each([
  [2, 1.5],
  [1.06, 1],
  [1, 0.75],
  [0.75, 0.5],
])("zooms out from %s to %s", (from, to) => {
  expect(zoomOut(from)).toBe(to);
});

it("stays within 50% to 200%", () => {
  expect(zoomIn(maxZoom)).toBe(maxZoom);
  expect(zoomOut(minZoom)).toBe(minZoom);
  expect(zoomOut(0.41)).toBe(minZoom);
});

it("zooms by about a fifth per mouse wheel notch, in and out alike", () => {
  expect(wheelZoom(1, -100)).toBeCloseTo(1.22, 2);
  expect(wheelZoom(wheelZoom(1, -100), 100)).toBeCloseTo(1);
});

it("zooms a little for a pinch's small steps", () => {
  expect(wheelZoom(1, -2)).toBeCloseTo(1.004, 3);
});

it("keeps wheel zoom within 50% to 200%", () => {
  expect(wheelZoom(1.9, -1000)).toBe(maxZoom);
  expect(wheelZoom(0.6, 1000)).toBe(minZoom);
});
