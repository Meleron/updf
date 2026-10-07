import type { TextStyle } from "./edits";
import coverage from "./font-coverage.json";

export const minSize = 6;
export const maxSize = 72;

// Colours of the text in the PDF, not interface colours. Names are message keys.
export const palette = [
  { name: "black", color: "#000000" },
  { name: "gray", color: "#666666" },
  { name: "red", color: "#C62828" },
  { name: "orange", color: "#E65100" },
  { name: "green", color: "#2E7D32" },
  { name: "blue", color: "#1565C0" },
  { name: "purple", color: "#6A1B9A" },
  { name: "white", color: "#FFFFFF" },
] as const;

const families = { sans: "NotoSans", serif: "NotoSerif", mono: "NotoSansMono" };

/** The font file the backend draws a style with. Noto Sans Mono has no italic, so italic mono is slanted regular. */
export function fontFace(style: TextStyle): keyof typeof coverage {
  const weight = style.bold ? "Bold" : "";
  const slant = style.italic && style.font !== "mono" ? "Italic" : "";
  return `${families[style.font]}-${weight + slant || "Regular"}` as keyof typeof coverage;
}

/** Control characters (C0, DEL and C1) are never drawn, as on the backend. */
function isControl(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0);
}

/** The characters in the lines that the style's font can't show, once each. Emoji and other astral characters count whole. */
export function unsupportedCharacters(lines: string[], style: TextStyle): string[] {
  const ranges = coverage[fontFace(style)];
  const unsupported = new Set<string>();
  for (const character of lines.join("")) {
    const codePoint = character.codePointAt(0)!;
    if (isControl(codePoint) || !ranges.some(([start, end]) => codePoint >= start && codePoint <= end)) {
      unsupported.add(character);
    }
  }
  return [...unsupported];
}
