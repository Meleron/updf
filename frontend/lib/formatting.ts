import type { TextStyle } from "./edits";
import { faceFor } from "./fonts";

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

/** Control characters (C0, DEL and C1) are never drawn, as on the backend. */
function isControl(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0);
}

/** The characters in the lines that the style's font can't show, once each. Emoji and other astral characters count whole. */
export function unsupportedCharacters(lines: string[], style: TextStyle): string[] {
  const ranges = faceFor(style).coverage;
  const unsupported = new Set<string>();
  for (const character of lines.join("")) {
    const codePoint = character.codePointAt(0)!;
    if (isControl(codePoint) || !ranges.some(([start, end]) => codePoint >= start && codePoint <= end)) {
      unsupported.add(character);
    }
  }
  return [...unsupported];
}
