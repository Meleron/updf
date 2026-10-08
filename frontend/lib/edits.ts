/** The edit model shared with the backend and autosave (see specs/SPEC-1.md). Coordinates are in points. */
export interface EditDocument {
  version: 1;
  edits: TextEdit[];
}

export interface TextEdit {
  id: string;
  page: number;
  x: number;
  y: number;
  lines: string[];
  style: TextStyle;
  cover?: Cover;
  /**
   * Only on replacements: the original font, by its name in the PDF, with the original's bold and italic. The box is
   * drawn in it while bold and italic are unchanged and every character is in it. The export adds each line's
   * character codes in it and the PDF's kerning after each character (thousandths of an em, as in TJ), and leaves it
   * out when the box isn't drawn in it.
   */
  pdfFont?: { name: string; bold: boolean; italic: boolean; codes?: number[][]; kerning?: number[][] };
}

export interface TextStyle {
  /** A font family in fonts/. */
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: "left" | "center" | "right";
}

export interface Cover {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}
