import { expect, it } from "vitest";
import { fixture } from "@/test-utils/pdf";
import { checkPdf } from "./pdf-check";
import { groupLines, readLines, similarFamily, type TextLine } from "./text-lines";

/** The lines of a fixture page, after drawing the page's operators so its fonts are loaded, as on screen. */
async function lines(name: string, pageNumber = 1): Promise<TextLine[]> {
  const result = await checkPdf(fixture(name));
  if (!("document" in result)) throw new Error(result.error);
  try {
    const page = await result.document.getPage(pageNumber);
    await page.getOperatorList();
    return await readLines(page);
  } finally {
    await result.document.loadingTask.destroy();
  }
}

it("finds each line with its text, position, size and font", async () => {
  const found = await lines("simple.pdf");

  expect(found.map((line) => line.text)).toEqual([
    "Quarterly report",
    "This is a simple one-page document.",
    "It has a few lines of text to edit.",
  ]);
  expect(found[1]).toMatchObject({ x: 72, baseline: 118, size: 14, font: "Noto Sans", bold: false, italic: false });
  expect(found[1].width).toBeCloseTo(240.04, 1);
  expect(found[1].top).toBeCloseTo(118 - 1.069 * 14);
  expect(found[1].bottom).toBeCloseTo(118 + 0.293 * 14);
});

it("matches serif, mono, bold and italic from the font", async () => {
  const found = await lines("styles.pdf");

  expect(found.slice(0, 3)).toMatchObject([
    { text: "Serif bold italic", size: 12, font: "Noto Serif", bold: true, italic: true },
    { text: "Mono regular", size: 10, font: "Noto Sans Mono", bold: false, italic: false },
    { text: "Sans bold", size: 16, font: "Noto Sans", bold: true, italic: false },
  ]);
});

it("joins a line drawn in pieces and splits columns", async () => {
  const texts = (await lines("styles.pdf")).map((line) => line.text);

  expect(texts).toContain("Drawn word by word");
  expect(texts).toContain("Left column");
  expect(texts).toContain("Right column");
});

it("matches fonts in fonts/ by name", async () => {
  expect((await lines("fonts.pdf")).slice(0, 2)).toMatchObject([
    { text: "Arimo regular line", font: "Arimo", bold: false, italic: false },
    { text: "Tinos regular line", font: "Tinos", bold: false, italic: false },
  ]);
});

it.each([
  ["ABCDEF+ArialMT", "sans", "Arimo"],
  ["Arial-BoldItalicMT", "sans", "Arimo"],
  ["Arial,Bold", "sans", "Arimo"],
  ["Helvetica-Oblique", "sans", "Arimo"],
  ["Liberation Sans", "sans", "Arimo"],
  ["TimesNewRomanPSMT", "serif", "Tinos"],
  ["TimesNewRomanPS-BoldItalicMT", "serif", "Tinos"],
  ["Times-Roman", "serif", "Tinos"],
  ["LiberationSerif-Bold", "serif", "Tinos"],
  ["CourierNewPSMT", "mono", "Cousine"],
  ["Calibri", "sans", "Carlito"],
  ["Cambria-Bold", "serif", "Caladea"],
  ["Georgia", "serif", "Gelasio"],
  ["OpenSans-SemiBold", "sans", "Open Sans"],
  ["SourceSansPro-Regular", "sans", "Source Sans 3"],
  ["IBMPlexMono-Italic", "mono", "IBM Plex Mono"],
  ["RobotoBold", "sans", "Roboto"],
  ["SegoeUI", "sans", "Noto Sans"],
  ["Garamond", "serif", "Noto Serif"],
] as const)("matches %s to %s", (name, kind, family) => {
  expect(similarFamily(name, kind)).toBe(family);
});

it("finds underlined lines from the rule drawn under them, but not from a rule further below", async () => {
  const found = await lines("fonts.pdf");

  expect(found.map(({ text, underline }) => ({ text, underline }))).toEqual([
    { text: "Arimo regular line", underline: false },
    { text: "Tinos regular line", underline: false },
    { text: "Underlined Arimo line", underline: true },
    { text: "Tinos word by word", underline: false },
    { text: "Text above a rule", underline: false },
  ]);
});

it("measures lines on cropped pages from the displayed corner", async () => {
  expect((await lines("cropped.pdf"))[0]).toMatchObject({ text: "This page is cropped.", x: 20, baseline: 60 });
});

it("finds upright text on a rotated page, and skips text the rotation turns sideways", async () => {
  expect(await lines("styles.pdf", 2)).toMatchObject([{ text: "Upright on a rotated page", x: 142, baseline: 100 }]);
  expect(await lines("rotated.pdf")).toEqual([]);
});

it("finds no lines on a scanned page", async () => {
  expect(await lines("scanned.pdf")).toEqual([]);
});

it("treats slanted text as italic, and fonts without a name by their family", () => {
  const run = { str: "Slanted", transform: [12, 0, 4, 12, 72, 700], width: 50, fontName: "f" };

  const [line] = groupLines([run], { f: { ascent: 0, descent: 0, fontFamily: "serif" } }, [1, 0, 0, -1, 0, 842], () => undefined);

  expect(line).toMatchObject({ text: "Slanted", font: "Noto Serif", italic: true, baseline: 142 });
  // Without metrics, an ascent of 0.9 and a descent of 0.25 em are assumed.
  expect(line.top).toBeCloseTo(142 - 0.9 * 12);
  expect(line.bottom).toBeCloseTo(142 + 0.25 * 12);
});

it("keeps a line together when a run in another column sits a fraction of a point lower", () => {
  const style = { f: { ascent: 1, descent: -0.25, fontFamily: "sans-serif" } };
  const run = (str: string, x: number, baseline: number, width: number) => ({ str, transform: [12, 0, 0, 12, x, 842 - baseline], width, fontName: "f" });

  const found = groupLines(
    [run("Left", 72, 100, 24), run("Right column", 340, 100.1, 70), run("side", 99, 100.3, 25)],
    style,
    [1, 0, 0, -1, 0, 842],
    () => undefined,
  );

  expect(found.map((line) => line.text)).toEqual(["Left side", "Right column"]);
});
