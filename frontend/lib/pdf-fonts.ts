import type { TextEdit } from "./edits";

/** A font embedded in the PDF that a replacement can keep drawing in. */
export interface PdfFont {
  /** The font's name in the PDF, as pdf.js reports it, which the backend finds the font by. */
  name: string;
  /** Each character drawn in the font on the page, and its character code in the font. */
  codes: Map<string, number>;
  /**
   * The PDF's kerning: pairs of characters (as one string) and how far the second moves back towards the first, in
   * thousandths of an em, as in a TJ array.
   */
  kerning: Map<string, number>;
  /** The CSS family of the preview's copy of the font. */
  family: string;
  /** The copy: the font as pdf.js loaded it, with a cmap from the characters to their glyphs and the kerning. */
  data: Uint8Array<ArrayBuffer>;
}

/** What pdf.js reports for a font, with `fontExtraProperties`, and for a glyph in a `showText` operator. */
export type FontObject = {
  name?: string;
  loadedName?: string;
  data?: Uint8Array;
  missingFile?: boolean;
  isType3Font?: boolean;
  vertical?: boolean;
  composite?: boolean;
};
export type Glyph = { originalCharCode: number; fontChar: string; unicode: string; isInFont: boolean };

type OperatorList = { fnArray: number[]; argsArray: unknown[][] };

/**
 * The embedded fonts a page draws text in, by pdf.js's id for each, with the characters drawn in them. Only fonts the
 * backend can write with are kept: embedded, not Type3, horizontal, and with one- or two-byte codes. A character is
 * kept when it has its own glyph (not part of a ligature).
 */
export function readPdfFonts(operators: OperatorList, ops: { setFont: number; showText: number }, fontOf: (id: string) => FontObject): Map<string, PdfFont> {
  const shownIn = new Map<string, Shown[]>();
  let current: Shown[] | undefined;
  for (const [i, fn] of operators.fnArray.entries()) {
    if (fn === ops.setFont) {
      const id = operators.argsArray[i][0] as string;
      current = shownIn.get(id) ?? [];
      shownIn.set(id, current);
    } else if (fn === ops.showText && current) {
      current.push(operators.argsArray[i][0] as Shown);
    }
  }

  const fonts = new Map<string, PdfFont>();
  for (const [id, shown] of shownIn) {
    const drawn = new Map(shown.flat().filter(isOwnGlyph).map((glyph) => [glyph.unicode, glyph]));
    const font = fontOf(id);
    const usable = font.name && font.data && !font.missingFile && !font.isType3Font && !font.vertical;
    if (!usable || drawn.size === 0 || [...drawn.values()].some((glyph) => glyph.originalCharCode > (font.composite ? 0xffff : 0xff))) {
      continue;
    }
    const data = font.data!;
    const toGlyph = new Map([...drawn].map(([text, glyph]) => [text.codePointAt(0)!, glyphId(data, glyph.fontChar.codePointAt(0)!)]));
    const kerning = kerningPairs(shown);
    const glyphOf = (character: string) => toGlyph.get(character.codePointAt(0)!)!;
    const glyphKerning = [...kerning].map(([pair, value]): [number, number, number] => {
      const [left, right] = [...pair];
      return [glyphOf(left), glyphOf(right), value];
    });
    fonts.set(id, {
      name: font.name!,
      codes: new Map([...drawn].map(([text, glyph]) => [text, glyph.originalCharCode])),
      kerning,
      family: `updf-${font.loadedName ?? id}`,
      data: withCmap(data, toGlyph, glyphKerning),
    });
  }
  return fonts;
}

type Shown = (Glyph | number | null)[];

/** A glyph of one character of its own (not part of a ligature) that the font has. */
function isOwnGlyph(glyph: Glyph | number | null): glyph is Glyph {
  return !!glyph && typeof glyph === "object" && glyph.isInFont && [...glyph.unicode].length === 1;
}

/** Kerning goes from moving a letter a quarter of an em closer to a tenth further, beyond which it's positioning. */
const kerningRange = { min: -100, max: 250 };

/**
 * The kerning in a font's shown text: the adjustment between two characters, from the numbers between glyphs in TJ
 * arrays. A pair is kept only if it's the same each time, since justification and word positioning vary. Pairs with a
 * space are left out: justification widens spaces, and browsers shape words separately, so they never kern a space.
 */
export function kerningPairs(shown: Shown[]): Map<string, number> {
  const seen = new Map<string, number | null>();
  for (const items of shown) {
    let previous: Glyph | null = null;
    let adjustment = 0;
    for (const item of items) {
      if (typeof item === "number") {
        adjustment += item;
        continue;
      }
      const glyph = isOwnGlyph(item) && item.unicode !== " " ? item : null;
      if (previous && glyph) {
        const pair = previous.unicode + glyph.unicode;
        const value = seen.get(pair);
        seen.set(pair, value === undefined || value === adjustment ? adjustment : null);
      }
      [previous, adjustment] = [glyph, 0];
    }
  }
  return new Map(
    [...seen].filter((entry): entry is [string, number] => {
      const value = entry[1];
      return value !== null && value !== 0 && value >= kerningRange.min && value <= kerningRange.max;
    }),
  );
}

/**
 * Whether a box is drawn in its original font: the font is known, bold and italic are unchanged, and every character
 * but the space is in it. A space the font lacks takes the box's `font`'s space, in the preview and the export alike.
 */
export function drawsInPdfFont(edit: Pick<TextEdit, "lines" | "style" | "pdfFont">, font: PdfFont | undefined): font is PdfFont {
  const original = edit.pdfFont;
  return (
    !!font &&
    !!original &&
    original.bold === edit.style.bold &&
    original.italic === edit.style.italic &&
    [...edit.lines.join("")].every((character) => character === " " || font.codes.has(character))
  );
}

/**
 * An edit as the export sends it: with each line's character codes and the kerning after each character when it's
 * drawn in its original font, else without the font.
 */
export function forExport(edit: TextEdit, font: PdfFont | undefined): TextEdit {
  const { pdfFont, ...rest } = edit;
  if (!drawsInPdfFont(edit, font)) {
    return rest;
  }
  const kerning = edit.lines.map((line) => [...line].map((character, i, characters) => font.kerning.get(character + (characters[i + 1] ?? "")) ?? 0));
  return { ...rest, pdfFont: { ...pdfFont!, codes: characterCodes(edit.lines, font), kerning } };
}

const addedFaces = new Set<string>();

/** Gives the preview's copies of the fonts to the browser, once each. */
export function addFontFaces(fonts: Iterable<PdfFont>) {
  for (const font of fonts) {
    if (!addedFaces.has(font.family)) {
      addedFaces.add(font.family);
      document.fonts.add(new FontFace(font.family, font.data));
    }
  }
}

/** Each line's character codes in the font, for the export. -1 is a space the font lacks. */
export function characterCodes(lines: string[], font: PdfFont): number[][] {
  return lines.map((line) => [...line].map((character) => font.codes.get(character) ?? -1));
}

/** The tables of an OpenType font, by tag. */
function tables(font: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const result = new Map<string, Uint8Array>();
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + 16 * i;
    const tag = String.fromCharCode(...font.subarray(record, record + 4));
    result.set(tag, font.subarray(view.getUint32(record + 8), view.getUint32(record + 8) + view.getUint32(record + 12)));
  }
  return result;
}

/** The glyph a font's Unicode cmap (format 4 or 12) maps a code point to, or 0. */
export function glyphId(font: Uint8Array, codePoint: number): number {
  const cmap = tables(font).get("cmap")!;
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  for (let i = 0; i < view.getUint16(2); i++) {
    const table = view.getUint32(4 + 8 * i + 4);
    const format = view.getUint16(table);
    if (format === 4) {
      const segments = view.getUint16(table + 6) / 2;
      const ends = table + 14;
      const starts = ends + 2 * segments + 2;
      const deltas = starts + 2 * segments;
      const rangeOffsets = deltas + 2 * segments;
      for (let s = 0; s < segments; s++) {
        const [start, end] = [view.getUint16(starts + 2 * s), view.getUint16(ends + 2 * s)];
        if (codePoint < start || codePoint > end) {
          continue;
        }
        const [delta, rangeOffset] = [view.getUint16(deltas + 2 * s), view.getUint16(rangeOffsets + 2 * s)];
        if (rangeOffset === 0) {
          return (codePoint + delta) & 0xffff;
        }
        const glyph = view.getUint16(rangeOffsets + 2 * s + rangeOffset + 2 * (codePoint - start));
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
    } else if (format === 12) {
      for (let g = 0; g < view.getUint32(table + 12); g++) {
        const group = table + 16 + 12 * g;
        if (codePoint >= view.getUint32(group) && codePoint <= view.getUint32(group + 4)) {
          return view.getUint32(group + 8) + codePoint - view.getUint32(group);
        }
      }
    }
  }
  return 0;
}

/**
 * A copy of a font whose only cmap is a Windows Unicode (format 4) one, mapping each code point to its glyph, and whose
 * kern table has the given pairs of glyphs with their TJ adjustments.
 */
export function withCmap(font: Uint8Array, toGlyph: Map<number, number>, kerning: [number, number, number][] = []): Uint8Array<ArrayBuffer> {
  const codePoints = [...toGlyph.keys()].filter((codePoint) => codePoint < 0xffff).sort((a, b) => a - b);
  // One segment per character, then the closing segment that format 4 requires.
  const segments = [...codePoints.map((codePoint) => [codePoint, (toGlyph.get(codePoint)! - codePoint) & 0xffff]), [0xffff, 1]];
  const subtableLength = 16 + 8 * segments.length;
  const cmap = new DataView(new ArrayBuffer(12 + subtableLength));
  cmap.setUint16(2, 1); // one subtable: platform 3 (Windows), encoding 1 (Unicode BMP), at offset 12
  cmap.setUint16(4, 3);
  cmap.setUint16(6, 1);
  cmap.setUint32(8, 12);
  const searchPower = 2 ** Math.floor(Math.log2(segments.length));
  [4, subtableLength, 0, 2 * segments.length, 2 * searchPower, Math.log2(searchPower), 2 * (segments.length - searchPower)].forEach(
    (value, i) => cmap.setUint16(12 + 2 * i, value),
  );
  const ends = 12 + 14;
  const starts = ends + 2 * segments.length + 2;
  segments.forEach(([codePoint, delta], s) => {
    cmap.setUint16(ends + 2 * s, codePoint);
    cmap.setUint16(starts + 2 * s, codePoint);
    cmap.setUint16(starts + 2 * segments.length + 2 * s, delta);
    // idRangeOffset stays 0: the glyph is the code point plus the delta.
  });

  const all = tables(font);
  all.set("cmap", new Uint8Array(cmap.buffer));
  all.delete("kern");
  if (kerning.length > 0) {
    const unitsPerEm = new DataView(all.get("head")!.buffer, all.get("head")!.byteOffset).getUint16(18);
    all.set("kern", kernTable(kerning, unitsPerEm));
  }
  return sfnt(new DataView(font.buffer, font.byteOffset).getUint32(0), all);
}

/** A kern table (version 0, one horizontal format 0 subtable) from pairs of glyphs and their TJ adjustments. */
function kernTable(kerning: [number, number, number][], unitsPerEm: number): Uint8Array {
  // Pairs must be sorted by glyphs, once each.
  const pairs = [...new Map(kerning.map(([left, right, value]) => [left * 0x10000 + right, value]))].sort(([a], [b]) => a - b);
  const view = new DataView(new ArrayBuffer(4 + 14 + 6 * pairs.length));
  const searchPower = 2 ** Math.floor(Math.log2(pairs.length));
  // Table version 0 with one subtable: version 0, its length, and coverage 1 (horizontal kerning, format 0).
  [0, 1, 0, 14 + 6 * pairs.length, 1, pairs.length, 6 * searchPower, Math.log2(searchPower), 6 * (pairs.length - searchPower)].forEach(
    (value, i) => view.setUint16(2 * i, value),
  );
  pairs.forEach(([glyphs, value], i) => {
    view.setUint32(18 + 6 * i, glyphs);
    // A positive TJ adjustment moves the next glyph back: negative kerning.
    view.setInt16(22 + 6 * i, Math.round((-value * unitsPerEm) / 1000));
  });
  return new Uint8Array(view.buffer);
}

/** An OpenType font file from its tables, each 4-byte aligned, with their checksums. */
function sfnt(version: number, tables: Map<string, Uint8Array>): Uint8Array<ArrayBuffer> {
  const tags = [...tables.keys()].sort();
  const padded = (length: number) => (length + 3) & ~3;
  const size = 12 + 16 * tags.length + tags.reduce((sum, tag) => sum + padded(tables.get(tag)!.length), 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const searchPower = 2 ** Math.floor(Math.log2(tags.length));
  view.setUint32(0, version);
  [tags.length, 16 * searchPower, Math.log2(searchPower), 16 * (tags.length - searchPower)].forEach((value, i) => view.setUint16(4 + 2 * i, value));
  let offset = 12 + 16 * tags.length;
  tags.forEach((tag, i) => {
    const table = tables.get(tag)!;
    bytes.set(table, offset);
    let checksum = 0;
    for (let at = offset; at < offset + padded(table.length); at += 4) {
      checksum = (checksum + view.getUint32(at)) >>> 0;
    }
    const record = 12 + 16 * i;
    [...tag].forEach((character, c) => view.setUint8(record + c, character.charCodeAt(0)));
    view.setUint32(record + 4, checksum);
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, table.length);
    offset += padded(table.length);
  });
  return bytes;
}
