import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const fonts = join(__dirname, "..", "..", "fonts");

/** The code points a font maps to a glyph, from its Unicode cmap subtables (formats 4 and 12), as the backend reads them. */
function codePoints(font: Buffer): Set<number> {
  const tables = new Map(
    Array.from({ length: font.readUInt16BE(4) }, (_, i) => {
      const record = 12 + 16 * i;
      return [font.toString("latin1", record, record + 4), font.readUInt32BE(record + 8)];
    }),
  );
  const cmap = tables.get("cmap")!;
  const points = new Set<number>();
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const record = cmap + 4 + 8 * i;
    const [platform, encoding] = [font.readUInt16BE(record), font.readUInt16BE(record + 2)];
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) {
      continue;
    }
    const table = cmap + font.readUInt32BE(record + 4);
    const format = font.readUInt16BE(table);
    if (format === 4) {
      const segments = font.readUInt16BE(table + 6) / 2;
      const ends = table + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const rangeOffsets = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const [start, end] = [font.readUInt16BE(starts + s * 2), font.readUInt16BE(ends + s * 2)];
        const [delta, rangeOffset] = [font.readUInt16BE(deltas + s * 2), font.readUInt16BE(rangeOffsets + s * 2)];
        for (let c = start; c <= end && c !== 0xffff; c++) {
          const glyph = rangeOffset === 0 ? c + delta : font.readUInt16BE(rangeOffsets + s * 2 + rangeOffset + (c - start) * 2);
          if ((glyph & 0xffff) !== 0) {
            points.add(c);
          }
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < font.readUInt32BE(table + 12); g++) {
        const group = table + 16 + 12 * g;
        for (let c = font.readUInt32BE(group); c <= font.readUInt32BE(group + 4); c++) {
          points.add(c);
        }
      }
    }
  }
  return points;
}

function ranges(points: Set<number>): [number, number][] {
  const result: [number, number][] = [];
  for (const point of [...points].sort((a, b) => a - b)) {
    const last = result.at(-1);
    if (last && last[1] === point - 1) {
      last[1] = point;
    } else {
      result.push([point, point]);
    }
  }
  return result;
}

// font-coverage.json is generated from the fonts by this test: run `npx vitest run lib/font-coverage.test.ts -u` after
// changing fonts/. The backend reads the same files, so both sides agree on which characters are supported.
it("lists the characters each font face supports", async () => {
  const faces = readdirSync(fonts)
    .filter((file) => file.endsWith(".ttf"))
    .sort()
    .map((file) => `  ${JSON.stringify(file.replace(".ttf", ""))}: ${JSON.stringify(ranges(codePoints(readFileSync(join(fonts, file)))))}`);

  await expect(`{\n${faces.join(",\n")}\n}\n`).toMatchFileSnapshot("./font-coverage.json");
});
