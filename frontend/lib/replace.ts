import type { Cover, TextEdit, TextStyle } from "./edits";
import { faceFor } from "./fonts";
import { maxSize, minSize } from "./formatting";
import type { Rect, TextLine } from "./text-lines";

/** The area a replacement covers: the line's ascent to descent, plus a margin for glyphs that reach beyond them. */
export function coverArea(line: TextLine): Rect {
  const margin = 0.1 * line.size;
  return { x: line.x - margin, y: line.top - margin, width: line.width + 2 * margin, height: line.bottom - line.top + 2 * margin };
}

/** Whether a line has been replaced already: an edit covers exactly its area. */
export function isReplaced(line: TextLine, edits: TextEdit[]): boolean {
  const area = coverArea(line);
  return edits.some((edit) => edit.cover && Math.abs(edit.cover.x - area.x) < 0.01 && Math.abs(edit.cover.y - area.y) < 0.01);
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * Colours around and in a line, from the page's pixels (RGBA, row by row). The background is the median of a band
 * around `rect`, so a neighbouring line reaching into the band doesn't change it. The text colour is the pixel in
 * `rect` furthest from the background: the middle of a stroke, not its anti-aliased edge.
 */
export function sampleColors(
  image: { data: Uint8ClampedArray; width: number; height: number },
  rect: Rect,
  band: number,
): { background: string; text: string } {
  const inside = (x: number, y: number, r: Rect) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
  const outer = { x: rect.x - band, y: rect.y - band, width: rect.width + 2 * band, height: rect.height + 2 * band };
  const channels: number[][] = [[], [], []];
  for (let y = Math.max(0, Math.floor(outer.y)); y < Math.min(image.height, outer.y + outer.height); y++) {
    for (let x = Math.max(0, Math.floor(outer.x)); x < Math.min(image.width, outer.x + outer.width); x++) {
      if (!inside(x, y, rect)) {
        channels.forEach((channel, c) => channel.push(image.data[(y * image.width + x) * 4 + c]));
      }
    }
  }
  const background = channels.map((channel) => channel.sort((p, q) => p - q)[Math.floor(channel.length / 2)] ?? 255);

  let text = background;
  let furthest = -1;
  for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(image.height, rect.y + rect.height); y++) {
    for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(image.width, rect.x + rect.width); x++) {
      const pixel = [0, 1, 2].map((c) => image.data[(y * image.width + x) * 4 + c]);
      const distance = pixel.reduce((sum, value, c) => sum + (value - background[c]) ** 2, 0);
      if (distance > furthest) {
        furthest = distance;
        text = pixel;
      }
    }
  }
  return { background: hex(background[0], background[1], background[2]), text: hex(text[0], text[1], text[2]) };
}

/**
 * A replacement for a line: a text box with the line's text in the closest font, size and colour, its baseline on
 * the original's, and a cover in the background colour over the original.
 */
export function replacementFor(line: TextLine, colors: { background: string; text: string }): Omit<TextEdit, "id" | "page"> {
  const size = Math.min(maxSize, Math.max(minSize, Math.round(line.size * 10) / 10));
  const cover: Cover = { ...coverArea(line), color: colors.background };
  const style: TextStyle = { font: line.font, size, bold: line.bold, italic: line.italic, underline: line.underline, color: colors.text, align: "left" };
  const pdfFont = line.pdfFont && { name: line.pdfFont.name, bold: line.bold, italic: line.italic };
  return { x: line.x, y: line.baseline - faceFor(style).ascent * size, lines: [line.text], style, cover, ...(pdfFont && { pdfFont }) };
}
