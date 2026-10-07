import type { TextEdit, TextStyle } from "./edits";

export type Tool = "select" | "text";

/** The editor's state. Every change goes through `editorReducer`, so undo, redo and autosave can build on it. */
export interface EditorState {
  edits: TextEdit[];
  tool: Tool;
  /** The id of the text box being typed in. */
  editing: string | null;
  /** The style used last, given to new text boxes. */
  style: TextStyle;
}

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "addText"; id: string; page: number; x: number; y: number }
  | { type: "changeText"; id: string; lines: string[] }
  | { type: "setStyle"; style: Partial<TextStyle> }
  | { type: "finishEditing" };

// The colour of the text in the PDF, not an interface colour.
export const defaultStyle: TextStyle = {
  font: "sans",
  size: 12,
  bold: false,
  italic: false,
  underline: false,
  color: "#000000",
  align: "left",
};

export const initialState: EditorState = { edits: [], tool: "select", editing: null, style: defaultStyle };

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setTool":
      return { ...state, tool: action.tool };
    case "addText": {
      const { id, page, x, y } = action;
      // Placing a box goes back to Select, so clicking outside it finishes the edit instead of adding another box.
      const edit = { id, page, x, y, lines: [""], style: state.style };
      return { ...state, edits: [...state.edits, edit], tool: "select", editing: id };
    }
    case "changeText":
      return {
        ...state,
        edits: state.edits.map((edit) => (edit.id === action.id ? { ...edit, lines: action.lines } : edit)),
      };
    case "setStyle": {
      // Formats the box being edited, and new boxes take its style.
      const edit = state.edits.find((e) => e.id === state.editing);
      if (!edit) {
        return state;
      }
      const style = { ...edit.style, ...action.style };
      return { ...state, edits: state.edits.map((e) => (e === edit ? { ...e, style } : e)), style };
    }
    case "finishEditing":
      return {
        ...state,
        edits: state.edits.filter((edit) => edit.id !== state.editing || edit.lines.some((line) => line.trim() !== "")),
        editing: null,
      };
  }
}
