import type { TextEdit, TextStyle } from "./edits";
import { boxFonts } from "./fonts";

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
  /** The edits before each step that can be undone, oldest first. */
  past: TextEdit[][];
  /** The edits after each step that can be redone, next first. */
  future: TextEdit[][];
  /** The edits as of the last step. They differ from `edits` while a box is being typed in. */
  lastStep: TextEdit[];
  /** The box the last step moved with the arrow keys, so the next press joins that step. */
  nudged: string | null;
  /**
   * A replacement as it was made, until its first edit finishes. While the box still equals it, the PDF shows instead
   * of the box, since the box can't place letters exactly as the PDF does (kerning, justified spacing). Finished
   * unchanged, it's discarded.
   */
  untouched: TextEdit | null;
}

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | { type: "addText"; id: string; page: number; x: number; y: number }
  | { type: "addReplacement"; edit: TextEdit }
  | { type: "select"; id: string }
  | { type: "edit"; id: string }
  | { type: "changeText"; id: string; lines: string[] }
  | { type: "setStyle"; style: Partial<TextStyle> }
  /** `nudge`: a move with the arrow keys. Presses in a row on one box are one step. */
  | { type: "move"; id: string; x: number; y: number; nudge?: boolean }
  | { type: "finishEditing" }
  | { type: "deselect" }
  | { type: "delete"; id: string }
  | { type: "undo" }
  | { type: "redo" };

// The colour of the text in the PDF, not an interface colour.
export const defaultStyle: TextStyle = {
  font: boxFonts.sans,
  size: 12,
  bold: false,
  italic: false,
  underline: false,
  color: "#000000",
  align: "left",
};

const noEdits: TextEdit[] = [];

export const initialState: EditorState = {
  edits: noEdits,
  tool: "select",
  selected: null,
  editing: null,
  style: defaultStyle,
  past: [],
  future: [],
  lastStep: noEdits,
  nudged: null,
  untouched: null,
};

/** Whether a box is a replacement still being typed in that equals the line it was made from. */
export function isUntouched(state: EditorState, id: string): boolean {
  const edit = state.edits.find((e) => e.id === id);
  return !!edit && state.untouched?.id === id && JSON.stringify(edit) === JSON.stringify(state.untouched);
}

/** Whether there's a step to undo, counting the edit in progress, which undo finishes first. */
export function canUndo(state: EditorState): boolean {
  return finishEditing(state).past.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

/**
 * Makes the edits a step that can be undone, if they changed since the last one. While a box is being typed in, the
 * step waits until the edit finishes, so typing and formatting during it are part of that step.
 */
function record(state: EditorState, joinLast = false): EditorState {
  if (state.editing !== null || state.edits === state.lastStep) {
    return state;
  }
  // Typing that ends with the text it started with isn't a step.
  if (JSON.stringify(state.edits) === JSON.stringify(state.lastStep)) {
    return { ...state, lastStep: state.edits };
  }
  return { ...state, past: joinLast ? state.past : [...state.past, state.lastStep], future: [], lastStep: state.edits };
}

/** Ends typing in a box, which stays selected, and records the edit. A box left empty or untouched is discarded. */
function finishEditing(state: EditorState): EditorState {
  const edit = state.edits.find((e) => e.id === state.editing);
  if (!edit) {
    return state;
  }
  const discard = edit.lines.every((line) => line.trim() === "") || isUntouched(state, edit.id);
  return record({
    ...state,
    edits: discard ? state.edits.filter((e) => e !== edit) : state.edits,
    selected: discard ? null : state.selected,
    editing: null,
    untouched: null,
  });
}

/** Shows the edits of another step. The selection stays only on a box that still exists. */
function restore(state: EditorState, edits: TextEdit[], past: TextEdit[][], future: TextEdit[][]): EditorState {
  const selected = edits.some((edit) => edit.id === state.selected) ? state.selected : null;
  return { ...state, edits, past, future, lastStep: edits, selected, nudged: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "undo" || action.type === "redo") {
    const finished = finishEditing(state);
    const { past, future, edits } = finished;
    if (action.type === "undo") {
      return past.length === 0 ? finished : restore(finished, past[past.length - 1], past.slice(0, -1), [edits, ...future]);
    }
    return future.length === 0 ? finished : restore(finished, future[0], [...past, edits], future.slice(1));
  }
  const next = apply(state, action);
  if (next === state) {
    return state;
  }
  const nudge = action.type === "move" && action.nudge ? action.id : null;
  return { ...record(next, nudge !== null && nudge === state.nudged), nudged: nudge };
}

function apply(state: EditorState, action: Exclude<EditorAction, { type: "undo" | "redo" }>): EditorState {
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
      return { ...finished, edits: [...finished.edits, action.edit], selected: action.edit.id, editing: action.edit.id, untouched: action.edit };
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
      // Formats the selected box, and new boxes take its style, but not a replacement's font, which they can't choose.
      const edit = state.edits.find((e) => e.id === state.selected);
      if (!edit) {
        return state;
      }
      const style = { ...edit.style, ...action.style };
      const font = Object.values<string>(boxFonts).includes(style.font) ? style.font : state.style.font;
      return { ...state, edits: state.edits.map((e) => (e === edit ? { ...e, style } : e)), style: { ...style, font } };
    }
    case "move":
      // An arrow press at the page's edge can't move the box, and isn't a step.
      if (state.edits.some((edit) => edit.id === action.id && edit.x === action.x && edit.y === action.y)) {
        return state;
      }
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
