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
}

export interface TextStyle {
  font: "sans" | "serif" | "mono";
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
