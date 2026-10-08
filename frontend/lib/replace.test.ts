import { describe, expect, it } from "vitest";
import { faceFor } from "./fonts";
import { coverArea, isReplaced, replacementFor, sampleColors } from "./replace";
import type { TextLine } from "./text-lines";

const line: TextLine = {
  text: "Quarterly report",
  x: 72,
  width: 108,
  baseline: 96,
  top: 96 - 1.069 * 14,
  bottom: 96 + 0.293 * 14,
  size: 14,
  font: "Noto Serif",
  bold: true,
  italic: false,
  underline: false,
};

/** A 40 by 20 pixel image in one colour, with a rectangle of another. */
function image(background: number[], paint: { x: number; y: number; width: number; height: number; color: number[] }[]) {
  const [width, height] = [40, 20];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = paint.find((p) => x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height)?.color ?? background;
      data.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

const rect = { x: 10, y: 5, width: 20, height: 10 };

describe("sampleColors", () => {
  it("finds black text on white", () => {
    const page = image([255, 255, 255], [{ x: 12, y: 7, width: 2, height: 6, color: [0, 0, 0] }, { x: 15, y: 7, width: 2, height: 6, color: [128, 128, 128] }]);

    expect(sampleColors(page, rect, 3)).toEqual({ background: "#FFFFFF", text: "#000000" });
  });

  it("finds white text on a coloured background", () => {
    const page = image([0x1e, 0x3a, 0x8a], [{ x: 14, y: 8, width: 3, height: 4, color: [255, 255, 255] }]);

    expect(sampleColors(page, rect, 3)).toEqual({ background: "#1E3A8A", text: "#FFFFFF" });
  });

  it("isn't thrown off by a neighbouring line reaching into the band", () => {
    const page = image([0xfe, 0xf3, 0xc7], [{ x: 10, y: 2, width: 20, height: 2, color: [0, 0, 0] }]);

    expect(sampleColors(page, rect, 3).background).toBe("#FEF3C7");
  });

  it("samples only what is on the page at its edges", () => {
    const page = image([250, 250, 250], []);

    expect(sampleColors(page, { x: -5, y: -5, width: 10, height: 10 }, 3)).toEqual({ background: "#FAFAFA", text: "#FAFAFA" });
  });
});

describe("replacementFor", () => {
  it("puts the new baseline on the original's, in the closest style, with a cover over the line", () => {
    const edit = replacementFor(line, { background: "#FEF3C7", text: "#1E3A8A" });

    expect(edit).toMatchObject({ x: 72, lines: ["Quarterly report"] });
    expect(edit.y + faceFor(edit.style).ascent * 14).toBeCloseTo(96);
    expect(edit.style).toEqual({ font: "Noto Serif", size: 14, bold: true, italic: false, underline: false, color: "#1E3A8A", align: "left" });
    expect(edit.cover).toEqual({ ...coverArea(line), color: "#FEF3C7" });
    expect(edit.cover!.y).toBeLessThan(line.top);
    expect(edit.cover!.y + edit.cover!.height).toBeGreaterThan(line.bottom);
  });

  it("keeps an underlined line underlined", () => {
    expect(replacementFor({ ...line, underline: true }, { background: "#FFFFFF", text: "#000000" }).style.underline).toBe(true);
  });

  it("keeps the size within 6 to 72 pt", () => {
    expect(replacementFor({ ...line, size: 4 }, { background: "#FFFFFF", text: "#000000" }).style.size).toBe(6);
    expect(replacementFor({ ...line, size: 90 }, { background: "#FFFFFF", text: "#000000" }).style.size).toBe(72);
  });
});

it("knows a line is replaced by its cover", () => {
  const edit = { id: "a", page: 0, ...replacementFor(line, { background: "#FFFFFF", text: "#000000" }) };

  expect(isReplaced(line, [edit])).toBe(true);
  expect(isReplaced({ ...line, baseline: 118, top: 118 - 15, bottom: 122 }, [edit])).toBe(false);
});
