import { describe, expect, it } from "vitest";
import { fixture } from "@/test-utils/pdf";
import { checkPdf } from "./pdf-check";
import { characterCodes, drawsInPdfFont, forExport, glyphId, kerningPairs, type Glyph, type PdfFont } from "./pdf-fonts";
import { loadPdfJs } from "./pdfjs";
import { readLines } from "./text-lines";

/** The lines of a fixture (fonts.pdf by default), and the PDF width (per 1000 em) of each character drawn on its page, by font name. */
async function fontsPdf(name = "fonts.pdf") {
  const result = await checkPdf(fixture(name));
  if (!("document" in result)) throw new Error(result.error);
  try {
    const page = await result.document.getPage(1);
    const { OPS } = await loadPdfJs();
    const operators = await page.getOperatorList();
    const widths = new Map<string, Map<string, number>>();
    let font = "";
    operators.fnArray.forEach((fn, i) => {
      if (fn === OPS.setFont) {
        font = (page.commonObjs.get(operators.argsArray[i][0]) as { name: string }).name;
        widths.set(font, widths.get(font) ?? new Map());
      } else if (fn === OPS.showText) {
        for (const glyph of operators.argsArray[i][0] as (Glyph & { width: number })[]) {
          widths.get(font)!.set(glyph.unicode, glyph.width);
        }
      }
    });
    return { lines: await readLines(page), widths };
  } finally {
    await result.document.loadingTask.destroy();
  }
}

/** A glyph's advance width per em, from the font's hmtx table. */
function advance(font: Uint8Array, glyph: number): number {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const table = (tag: string) => {
    for (let i = 0; i < view.getUint16(4); i++) {
      if (String.fromCharCode(...font.subarray(12 + 16 * i, 16 + 16 * i)) === tag) {
        return view.getUint32(12 + 16 * i + 8);
      }
    }
    throw new Error(tag);
  };
  const metrics = view.getUint16(table("hhea") + 34);
  return view.getUint16(table("hmtx") + 4 * Math.min(glyph, metrics - 1)) / view.getUint16(table("head") + 18);
}

const font: PdfFont = { name: "ABCDEF+Arimo", codes: new Map([["A", 3], ["b", 4]]), kerning: new Map([["Ab", 40]]), family: "f", data: new Uint8Array() };
const edit = { lines: ["Ab", "b A"], style: { font: "Arimo", size: 12, bold: false, italic: false, underline: false, color: "#000000", align: "left" as const } };

it("knows the embedded font each line starts in, and the character codes drawn in it", async () => {
  const { lines } = await fontsPdf();

  expect(lines.map((line) => line.pdfFont?.name)).toEqual([
    expect.stringMatching(/^[A-Z]{6}\+Arimo/),
    expect.stringMatching(/^[A-Z]{6}\+Tinos/),
    lines[0].pdfFont!.name,
    lines[1].pdfFont!.name,
    lines[0].pdfFont!.name,
  ]);
  // PDFsharp's fonts have no space glyph: it moves the text instead.
  expect([...lines[0].pdfFont!.codes.keys()].sort().join("")).toBe("ATUabdegilmnortuvx");
});

it("copies each font with a cmap from the characters to the glyphs the PDF draws, with the PDF's widths", async () => {
  const { lines, widths } = await fontsPdf();

  for (const pdfFont of new Set(lines.map((line) => line.pdfFont!))) {
    for (const character of pdfFont.codes.keys()) {
      const glyph = glyphId(pdfFont.data, character.codePointAt(0)!);
      expect(glyph, character).not.toBe(0);
      // PDF widths are rounded to whole thousandths of an em.
      expect(Math.abs(advance(pdfFont.data, glyph) - widths.get(pdfFont.name)!.get(character)! / 1000), character).toBeLessThanOrEqual(0.001);
    }
  }
});

/** The kerning of a pair of glyphs in a font's kern table (format 0), in font units, or 0. */
function kern(font: Uint8Array, left: number, right: number): number {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) {
    if (String.fromCharCode(...font.subarray(12 + 16 * i, 16 + 16 * i)) === "kern") {
      const table = view.getUint32(12 + 16 * i + 8);
      for (let p = 0; p < view.getUint16(table + 10); p++) {
        const pair = table + 18 + 6 * p;
        if (view.getUint16(pair) === left && view.getUint16(pair + 2) === right) {
          return view.getInt16(pair + 4);
        }
      }
    }
  }
  return 0;
}

function unitsPerEm(font: Uint8Array): number {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) {
    if (String.fromCharCode(...font.subarray(12 + 16 * i, 16 + 16 * i)) === "head") {
      return view.getUint16(view.getUint32(12 + 16 * i + 8) + 18);
    }
  }
  throw new Error("head");
}

describe("kerning", () => {
  it("reads each font's kerning from the PDF's adjustments between letters, into the copy's kern table", async () => {
    const { lines } = await fontsPdf("kerned.pdf");
    const sans = lines[0].pdfFont!;
    const glyph = (character: string) => glyphId(sans.data, character.codePointAt(0)!);

    // LibreOffice moves V 73/1000 em towards A in Liberation Sans.
    expect(sans.kerning.get("AV")).toBe(73);
    expect(kern(sans.data, glyph("A"), glyph("V"))).toBe(Math.round((-73 * unitsPerEm(sans.data)) / 1000));
    // Lines without kerned pairs have none.
    expect(sans.kerning.get("mi")).toBeUndefined();
  });

  it("leaves out spaces, and pairs that change or move too far", () => {
    const glyph = (unicode: string, code: number): Glyph => ({ originalCharCode: code, fontChar: unicode, unicode, isInFont: true });
    const shown = [
      [glyph("A", 65), 70, glyph("V", 86), -50, glyph(" ", 32), -50, glyph("T", 84), 20, glyph("o", 111), glyph("w", 119), -300, glyph("e", 101)],
      [glyph("A", 65), 70, glyph("V", 86), glyph("T", 84), 30, glyph("o", 111), glyph(" ", 32), 17, glyph("Y", 89)],
    ];

    // Spaces are justified, and browsers don't kern across them.
    expect([...kerningPairs(shown)]).toEqual([["AV", 70]]);
  });
});

describe("drawsInPdfFont", () => {
  it("draws a box in its original font while every character is in it", () => {
    expect(drawsInPdfFont({ ...edit, pdfFont: { name: font.name, bold: false, italic: false } }, font)).toBe(true);
    expect(drawsInPdfFont({ ...edit, lines: ["Abc"], pdfFont: { name: font.name, bold: false, italic: false } }, font)).toBe(false);
  });

  it("uses the box's font once bold or italic changes, or without an original font", () => {
    expect(drawsInPdfFont({ ...edit, pdfFont: { name: font.name, bold: true, italic: false } }, font)).toBe(false);
    expect(drawsInPdfFont({ ...edit, pdfFont: { name: font.name, bold: false, italic: true } }, font)).toBe(false);
    expect(drawsInPdfFont(edit, font)).toBe(false);
    expect(drawsInPdfFont({ ...edit, pdfFont: { name: font.name, bold: false, italic: false } }, undefined)).toBe(false);
  });
});

it("gives each character its code, and -1 for a space the font lacks", () => {
  expect(characterCodes(edit.lines, font)).toEqual([
    [3, 4],
    [4, -1, 3],
  ]);
});

describe("forExport", () => {
  const replacement = { ...edit, id: "r", page: 0, x: 72, y: 81, pdfFont: { name: font.name, bold: false, italic: false } };

  it("adds the character codes and the kerning after each character when the box is drawn in its original font", () => {
    expect(forExport(replacement, font).pdfFont).toEqual({ ...replacement.pdfFont, codes: [[3, 4], [4, -1, 3]], kerning: [[40, 0], [0, 0, 0]] });
  });

  it("leaves the font out when the box is drawn in its own font", () => {
    expect(forExport({ ...replacement, lines: ["Abc"] }, font)).not.toHaveProperty("pdfFont");
    expect(forExport(replacement, undefined)).not.toHaveProperty("pdfFont");
  });
});
