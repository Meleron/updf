import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { notoAscent, notoLineHeight } from "./fonts";

const fonts = join(__dirname, "..", "..", "fonts");

/** Reads a font's vertical metrics per em from its OS/2 table, which browsers use when USE_TYPO_METRICS is set. */
function metrics(file: Buffer) {
  const tables = new Map(
    Array.from({ length: file.readUInt16BE(4) }, (_, i) => {
      const record = 12 + 16 * i;
      return [file.toString("latin1", record, record + 4), file.readUInt32BE(record + 8)];
    }),
  );
  const unitsPerEm = file.readUInt16BE(tables.get("head")! + 18);
  const os2 = tables.get("OS/2")!;
  const useTypoMetrics = (file.readUInt16BE(os2 + 62) & 0x80) !== 0;
  const [ascent, descent, lineGap] = [68, 70, 72].map((offset) => file.readInt16BE(os2 + offset));
  return { useTypoMetrics, ascent: ascent / unitsPerEm, lineHeight: (ascent - descent + lineGap) / unitsPerEm };
}

it.each(readdirSync(fonts).filter((f) => f.endsWith(".ttf")))("%s has the metrics text boxes use", (name) => {
  expect(metrics(readFileSync(join(fonts, name)))).toEqual({
    useTypoMetrics: true,
    ascent: notoAscent,
    lineHeight: notoLineHeight,
  });
});
