import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const fonts = join(__dirname, "..", "..", "fonts");

function tables(font: Buffer): Map<string, number> {
  return new Map(
    Array.from({ length: font.readUInt16BE(4) }, (_, i) => {
      const record = 12 + 16 * i;
      return [font.toString("latin1", record, record + 4), font.readUInt32BE(record + 8)];
    }),
  );
}

/** The family name (name ID 1) in the Windows Unicode name record, which the backend finds the files by. */
function familyName(font: Buffer): string {
  const name = tables(font).get("name")!;
  const strings = name + font.readUInt16BE(name + 4);
  for (let i = 0; i < font.readUInt16BE(name + 2); i++) {
    const record = name + 6 + 12 * i;
    const [platform, encoding, , nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((field) => font.readUInt16BE(record + field));
    if (platform === 3 && encoding === 1 && nameId === 1) {
      return font.subarray(strings + offset, strings + offset + length).swap16().toString("utf16le");
    }
  }
  throw new Error("The font has no family name.");
}

/**
 * Metrics per em, as the backend reads them: the ascent and line spacing (ascent + descent + line gap) from the hhea
 * table, and the distance from the baseline down to the top of the underline and its thickness from the post table.
 */
function metrics(font: Buffer) {
  const all = tables(font);
  const unitsPerEm = font.readUInt16BE(all.get("head")! + 18);
  const [ascent, descent, lineGap] = [4, 6, 8].map((offset) => font.readInt16BE(all.get("hhea")! + offset));
  const [underlinePosition, underlineThickness] = [8, 10].map((offset) => font.readInt16BE(all.get("post")! + offset));
  return {
    ascent: ascent / unitsPerEm,
    lineHeight: (ascent - descent + lineGap) / unitsPerEm,
    underlineOffset: -underlinePosition / unitsPerEm,
    underlineThickness: underlineThickness / unitsPerEm,
  };
}

/** The code points a font maps to a glyph, from its Unicode cmap subtables (formats 4 and 12), as the backend reads them. */
function codePoints(font: Buffer): Set<number> {
  const cmap = tables(font).get("cmap")!;
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

const files = readdirSync(fonts)
  .filter((file) => file.endsWith(".ttf"))
  .sort();

// font-faces.json and app/fonts.css are generated from the fonts by these tests: run
// `npx vitest run lib/font-faces.test.ts -u` after changing fonts/. The backend reads the same files, so both sides agree
// on the faces, their metrics and the characters they support.
it("lists each face's family, metrics and supported characters", async () => {
  const faces = files.map((file) => {
    const font = readFileSync(join(fonts, file));
    // Face names are the family without spaces, then the style: the backend finds files by that rule.
    const face = file.replace(".ttf", "");
    const family = familyName(readFileSync(join(fonts, face.replace(/-.*/, "-Regular.ttf"))));
    expect(face.replace(/-.*/, "")).toBe(family.replaceAll(" ", ""));
    return `  ${JSON.stringify(face)}: ${JSON.stringify({ family, ...metrics(font), coverage: ranges(codePoints(font)) })}`;
  });

  await expect(`{\n${faces.join(",\n")}\n}\n`).toMatchFileSnapshot("./font-faces.json");
});

it("declares every face for the browser, which downloads only the faces in use", async () => {
  const rules = files.map((file) => {
    const face = file.replace(".ttf", "");
    const family = familyName(readFileSync(join(fonts, face.replace(/-.*/, "-Regular.ttf"))));
    return [
      "@font-face {",
      `  font-family: "${family}";`,
      `  src: url("/fonts/${file}") format("truetype");`,
      `  font-weight: ${face.includes("Bold") ? 700 : 400};`,
      `  font-style: ${face.includes("Italic") ? "italic" : "normal"};`,
      "  font-display: block;",
      "}",
    ].join("\n");
  });
  const header = "/* Generated by lib/font-faces.test.ts from fonts/, which predev and prebuild copy into public/fonts. */";

  await expect(`${header}\n${rules.join("\n")}\n`).toMatchFileSnapshot("../app/fonts.css");
});
