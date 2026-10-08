import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextStyle } from "./edits";
import faces from "./font-faces.json";
import { boxFonts } from "./fonts";
import { readPdfFonts, type FontObject, type PdfFont } from "./pdf-fonts";
import { loadPdfJs } from "./pdfjs";

/** A line of existing text on a page, in points on the page as displayed (top-left origin, after crop and rotation). */
export interface TextLine {
  text: string;
  x: number;
  width: number;
  baseline: number;
  /** The top and bottom of the font's ascent and descent. */
  top: number;
  bottom: number;
  size: number;
  font: TextStyle["font"];
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** The embedded font the line starts in, if replacements can draw in it. */
  pdfFont?: PdfFont;
}

/** What pdf.js reports for a run of text, and for its font. */
export type TextRun = { str: string; transform: number[]; width: number; fontName: string };
export type RunStyle = { ascent: number; descent: number; fontFamily: string };
export type RunFont = { name?: string; bold?: boolean; black?: boolean; italic?: boolean; isMonospace?: boolean; isSerifFont?: boolean };

type Placed = { str: string; x: number; right: number; baseline: number; size: number; fontName: string; slanted: boolean };

/** The product of two affine transforms [a, b, c, d, e, f], applying `inner` first. */
function multiply(outer: number[], inner: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = outer;
  const [a2, b2, c2, d2, e2, f2] = inner;
  return [a1 * a2 + c1 * b2, b1 * a2 + d1 * b2, a1 * c2 + c1 * d2, b1 * c2 + d1 * d2, a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1];
}

/** Open fonts in fonts/ with the same widths as common proprietary fonts (and older names of open ones), by normalised name. */
const similarFonts: Record<string, string> = {
  arial: "Arimo",
  helvetica: "Arimo",
  liberationsans: "Arimo",
  nimbussans: "Arimo",
  timesnewroman: "Tinos",
  times: "Tinos",
  liberationserif: "Tinos",
  nimbusroman: "Tinos",
  couriernew: "Cousine",
  courier: "Cousine",
  liberationmono: "Cousine",
  nimbusmono: "Cousine",
  calibri: "Carlito",
  cambria: "Caladea",
  georgia: "Gelasio",
  sourcesanspro: "Source Sans 3",
  sourceserifpro: "Source Serif 4",
};

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The families in fonts/, by normalised name. */
const families = new Map(Object.values(faces).map(({ family }) => [normalise(family), family]));

/**
 * The family in fonts/ closest to a PDF font's name: a metric-compatible one, the same family, or else Noto by kind.
 * Names may carry a subset prefix ("ABCDEF+"), the style after "-" or ",", "PS" and "MT" suffixes, or the style run on
 * ("ArialBold").
 */
export function similarFamily(name: string, kind: keyof typeof boxFonts): string {
  const family = normalise(name.replace(/^[A-Z]{6}\+/, "").split(/[-,]/)[0].replace(/(PS)?MT$|PS$/, "")).replace(
    /(bold|italic|oblique|regular|semibold|medium|light|black)+$/,
    "",
  );
  return similarFonts[family] ?? families.get(family) ?? boxFonts[kind];
}

/** The closest font in fonts/, bold and italic, from the font's name and flags. */
function matchFont(font: RunFont | undefined, family: string): Pick<TextLine, "font" | "bold" | "italic"> {
  const name = (font?.name ?? "").replace(/^[A-Z]{6}\+/, "");
  const mono = !!font?.isMonospace || family === "monospace" || /mono|courier|consol|menlo|code/i.test(name);
  const serif = !!font?.isSerifFont || family === "serif" || (/serif|times|roman|georgia|garamond|cambria|palatino|book/i.test(name) && !/sans/i.test(name));
  return {
    font: similarFamily(name, mono ? "mono" : serif ? "serif" : "sans"),
    bold: !!font?.bold || !!font?.black || /bold|black|heavy|semibold|demi/i.test(name),
    italic: !!font?.italic || /italic|oblique/i.test(name),
  };
}

/**
 * Groups runs of text into lines: runs on the same baseline, in the same size, with gaps under an em (wider gaps
 * separate columns). Only text that reads left to right, upright on the displayed page, is grouped: rotated text
 * isn't supported.
 */
export function groupLines(
  runs: TextRun[],
  styles: Record<string, RunStyle>,
  viewportTransform: number[],
  fontOf: (fontName: string) => RunFont | undefined,
  pdfFonts = new Map<string, PdfFont>(),
): TextLine[] {
  const placed: Placed[] = [];
  for (const run of runs) {
    if (run.str.trim() === "") {
      continue;
    }
    const [a, b, c, d, e, f] = multiply(viewportTransform, run.transform);
    // Upright on the display: runs along +x, with the glyphs' tops towards -y.
    if (a <= 0 || d >= 0 || Math.abs(b) > 0.01 * a) {
      continue;
    }
    const size = -d;
    placed.push({ str: run.str, x: e, right: e + run.width, baseline: f, size, fontName: run.fontName, slanted: Math.abs(c) > 0.1 * size });
  }
  // Rows of runs sharing a baseline first, then each row left to right, split where the size changes or a gap of an
  // em or more separates columns. Sorting all runs by baseline alone would let another column's run, a fraction of a
  // point lower, fall between two runs of a line.
  placed.sort((p, q) => p.baseline - q.baseline);
  const rows: Placed[][] = [];
  for (const run of placed) {
    const row = rows.at(-1);
    if (row && Math.abs(run.baseline - row[0].baseline) < 0.2 * row[0].size) {
      row.push(run);
    } else {
      rows.push([run]);
    }
  }
  const groups: Placed[][] = [];
  for (const row of rows) {
    row.sort((p, q) => p.x - q.x);
    for (const run of row) {
      const last = groups.at(-1)?.at(-1);
      if (last && row.includes(last) && Math.abs(run.size - last.size) < 0.2 * last.size && run.x - last.right < last.size) {
        groups.at(-1)!.push(run);
      } else {
        groups.push([run]);
      }
    }
  }

  return groups.map((group) => {
    const first = group[0];
    const style = styles[first.fontName];
    let text = "";
    for (const [i, run] of group.entries()) {
      // A visible gap between runs is a space, unless one of them has it already.
      const gap = i > 0 && run.x - group[i - 1].right > 0.15 * run.size && !text.endsWith(" ") && !run.str.startsWith(" ");
      text += (gap ? " " : "") + run.str;
    }
    const match = matchFont(fontOf(first.fontName), style?.fontFamily ?? "");
    return {
      text: text.trim(),
      x: first.x,
      width: Math.max(...group.map((run) => run.right)) - first.x,
      baseline: first.baseline,
      top: first.baseline - (style?.ascent || 0.9) * first.size,
      bottom: first.baseline - (style?.descent || -0.25) * first.size,
      size: first.size,
      ...match,
      italic: match.italic || first.slanted,
      underline: false,
      pdfFont: pdfFonts.get(first.fontName),
    };
  });
}

/** A rectangle in points on the page as displayed. */
export type Rect = { x: number; y: number; width: number; height: number };

/** The operators pdf.js reports for a page, and the ones that matter for finding rules. */
type OperatorList = { fnArray: number[]; argsArray: unknown[][] };
type Ops = Record<"save" | "restore" | "transform" | "paintFormXObjectBegin" | "paintFormXObjectEnd" | "constructPath" | "endPath", number>;

/**
 * The bounds of every painted path that is wider than it is tall: candidates for underlines. PDFs draw underlines as
 * separate thin rectangles or lines, not as a property of the text.
 */
export function findRules(operators: OperatorList, ops: Ops, viewportTransform: number[]): Rect[] {
  const rules: Rect[] = [];
  const stack: number[][] = [];
  let transform = viewportTransform;
  for (const [i, fn] of operators.fnArray.entries()) {
    const args = operators.argsArray[i];
    if (fn === ops.save) {
      stack.push(transform);
    } else if (fn === ops.restore) {
      transform = stack.pop() ?? transform;
    } else if (fn === ops.transform) {
      transform = multiply(transform, args as number[]);
    } else if (fn === ops.paintFormXObjectBegin) {
      stack.push(transform);
      if (args[0]) {
        transform = multiply(transform, args[0] as number[]);
      }
    } else if (fn === ops.paintFormXObjectEnd) {
      transform = stack.pop() ?? transform;
    } else if (fn === ops.constructPath && args[0] !== ops.endPath && args[2]) {
      // The path's bounds in its own space, [minX, minY, maxX, maxY], mapped to the displayed page.
      const [minX, minY, maxX, maxY] = args[2] as number[];
      const corners = [
        [minX, minY],
        [maxX, maxY],
        [minX, maxY],
        [maxX, minY],
      ].map(([x, y]) => [transform[0] * x + transform[2] * y + transform[4], transform[1] * x + transform[3] * y + transform[5]]);
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      if (rect.width > rect.height) {
        rules.push(rect);
      }
    }
  }
  return rules;
}

/** Whether a rule underlines a line: thin, just under the baseline, and about as wide as the line. */
export function underlines(rule: Rect, line: TextLine): boolean {
  const middle = rule.y + rule.height / 2;
  return (
    rule.height <= 0.15 * line.size &&
    middle >= line.baseline &&
    middle <= line.baseline + 0.3 * line.size &&
    Math.abs(rule.x - line.x) <= 0.5 * line.size &&
    Math.abs(rule.x + rule.width - (line.x + line.width)) <= 0.5 * line.size
  );
}

/** The fonts replacements on a page are drawn in, by name. */
export function pdfFontsByName(lines: TextLine[]): Map<string, PdfFont> {
  return new Map(lines.flatMap((line) => (line.pdfFont ? [[line.pdfFont.name, line.pdfFont]] : [])));
}

/**
 * The lines of text on a page. Font names come from pdf.js's font objects, which exist once the page has been drawn
 * and the document was opened with `fontExtraProperties`.
 */
export async function readLines(page: PDFPageProxy): Promise<TextLine[]> {
  const { OPS } = await loadPdfJs();
  const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  const runs = content.items.filter((item) => "str" in item);
  const { transform } = page.getViewport({ scale: 1 });
  const pdfFonts = readPdfFonts(operators, OPS, (fontName) => page.commonObjs.get(fontName) as FontObject);
  const lines = groupLines(
    runs,
    content.styles,
    transform,
    (fontName) => (page.commonObjs.has(fontName) ? (page.commonObjs.get(fontName) as RunFont) : undefined),
    pdfFonts,
  );
  const rules = findRules(operators, OPS, transform);
  return lines.map((line) => ({ ...line, underline: rules.some((rule) => underlines(rule, line)) }));
}
