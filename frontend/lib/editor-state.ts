import type { TextEdit, TextStyle } from "./edits";

export type Tool = "select" | "text";

/** The editor's state. Every change goes through `editorReducer`, so undo, redo and autosave can build on it. */
export interface EditorState {
  edits: TextEdit[];
  tool: Tool;
  /** The id of the selected text box, which the formatting bar formats. */
  selected: string | null;
  /** The id of the text box being typed in. It is always the selected one. */
  editing: string | null;
  /** The style used last, given to new text boxes. */
  style: TextStyle;
}

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "addText"; id: string; page: number; x: number; y: number }
  | { type: "addReplacement"; edit: TextEdit }
  | { type: "select"; id: string }
  | { type: "edit"; id: string }
  | { type: "changeText"; id: string; lines: string[] }
  | { type: "setStyle"; style: Partial<TextStyle> }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "finishEditing" }
  | { type: "deselect" }
  | { type: "delete"; id: string };

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

export const initialState: EditorState = { edits: [], tool: "select", selected: null, editing: null, style: defaultStyle };

/** Ends typing in a box, which stays selected. A box left empty is discarded. */
function finishEditing(state: EditorState): EditorState {
  const edit = state.edits.find((e) => e.id === state.editing);
  if (!edit) {
    return state;
  }
  const empty = edit.lines.every((line) => line.trim() === "");
  return {
    ...state,
    edits: empty ? state.edits.filter((e) => e !== edit) : state.edits,
    selected: empty ? null : state.selected,
    editing: null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setTool":
      return { ...state, tool: action.tool };
    case "addText": {
      const { id, page, x, y } = action;
      const edit = { id, page, x, y, lines: [""], style: state.style };
      const finished = finishEditing(state);
      // Placing a box goes back to Select, so clicking outside it finishes the edit instead of adding another box.
      return { ...finished, edits: [...finished.edits, edit], tool: "select", selected: id, editing: id };
    }
    case "addReplacement": {
      // A replacement has the style of the text it replaces, which isn't a style the user chose.
      const finished = finishEditing(state);
      return { ...finished, edits: [...finished.edits, action.edit], selected: action.edit.id, editing: action.edit.id };
    }
    case "select":
      if (action.id === state.selected) {
        return state;
      }
      return { ...finishEditing(state), selected: action.id };
    case "edit":
      if (action.id === state.editing) {
        return state;
      }
      return { ...finishEditing(state), selected: action.id, editing: action.id };
    case "changeText":
      return {
        ...state,
        edits: state.edits.map((edit) => (edit.id === action.id ? { ...edit, lines: action.lines } : edit)),
      };
    case "setStyle": {
      // Formats the selected box, and new boxes take its style.
      const edit = state.edits.find((e) => e.id === state.selected);
      if (!edit) {
        return state;
      }
      const style = { ...edit.style, ...action.style };
      return { ...state, edits: state.edits.map((e) => (e === edit ? { ...e, style } : e)), style };
    }
    case "move":
      // Only the text moves: a replacement's cover stays over the original.
      return {
        ...state,
        edits: state.edits.map((edit) => (edit.id === action.id ? { ...edit, x: action.x, y: action.y } : edit)),
      };
    case "finishEditing":
      return finishEditing(state);
    case "deselect":
      return { ...finishEditing(state), selected: null };
    case "delete":
      return {
        ...state,
        edits: state.edits.filter((edit) => edit.id !== action.id),
        selected: state.selected === action.id ? null : state.selected,
        editing: state.editing === action.id ? null : state.editing,
      };
  }
}
