import type { TextStyle } from "./edits";
import faces from "./font-faces.json";

/** A face in fonts/: its family, metrics per em (from the hhea table, as the backend reads them) and code point ranges. */
export type Face = (typeof faces)[keyof typeof faces];

/** The fonts new text boxes can use, by their message keys. Replacements use the font of the text they replace. */
export const boxFonts = { sans: "Noto Sans", serif: "Noto Serif", mono: "Noto Sans Mono" } as const;

/**
 * The face that draws a style, picked as the backend picks it: the family without spaces, then the style. A family
 * without italic faces (Noto Sans Mono) is slanted, by the browser and the backend alike.
 *
 * Text boxes set the face's line spacing (ascent + descent + line gap) explicitly, because browsers round
 * `line-height: normal` to whole pixels and may read other tables.
 */
export function faceFor(style: Pick<TextStyle, "font" | "bold" | "italic">): Face {
  const name = (slant: string) => `${style.font.replaceAll(" ", "")}-${(style.bold ? "Bold" : "") + slant || "Regular"}`;
  const italic = name("Italic");
  return faces[(style.italic && italic in faces ? italic : name("")) as keyof typeof faces];
}
