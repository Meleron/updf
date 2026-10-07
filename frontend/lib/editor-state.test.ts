import { describe, expect, it } from "vitest";
import { defaultStyle, editorReducer, initialState, type EditorState } from "./editor-state";

function addText(state: EditorState = initialState, id = "a") {
  return editorReducer(state, { type: "addText", id, page: 1, x: 72, y: 96 });
}

describe("editorReducer", () => {
  it("starts with the Select tool and no edits", () => {
    expect(initialState).toMatchObject({ edits: [], tool: "select", editing: null });
  });

  it("switches the tool", () => {
    expect(editorReducer(initialState, { type: "setTool", tool: "text" }).tool).toBe("text");
  });

  it("adds an empty box in the style used last, ready to type, and goes back to Select", () => {
    const style = { ...defaultStyle, font: "serif" as const, size: 20 };
    const state = addText({ ...initialState, tool: "text", style });

    expect(state.edits).toEqual([{ id: "a", page: 1, x: 72, y: 96, lines: [""], style }]);
    expect(state.editing).toBe("a");
    expect(state.tool).toBe("select");
  });

  it("changes the text of one box", () => {
    const state = editorReducer(addText(addText(), "b"), { type: "changeText", id: "a", lines: ["Zażółć", "gęślą jaźń"] });

    expect(state.edits.map((edit) => edit.lines)).toEqual([["Zażółć", "gęślą jaźń"], [""]]);
  });

  it("keeps a box with text when the edit finishes", () => {
    const typed = editorReducer(addText(), { type: "changeText", id: "a", lines: ["", "Text"] });

    const state = editorReducer(typed, { type: "finishEditing" });

    expect(state.edits).toHaveLength(1);
    expect(state.editing).toBeNull();
  });

  it.each([[[""]], [["", ""]], [["  ", "\t"]]])("discards a box left empty (%j) when the edit finishes", (lines) => {
    const typed = editorReducer(addText(addText(), "b"), { type: "changeText", id: "b", lines });
    const withText = editorReducer(typed, { type: "changeText", id: "a", lines: ["Kept"] });

    const state = editorReducer(withText, { type: "finishEditing" });

    expect(state.edits.map((edit) => edit.id)).toEqual(["a"]);
  });

  it("formats the box being edited, and new boxes take its style", () => {
    const first = editorReducer(addText(), { type: "changeText", id: "a", lines: ["First"] });

    const formatted = editorReducer(first, { type: "setStyle", style: { font: "serif", bold: true, color: "#C62828" } });
    const style = { ...defaultStyle, font: "serif", bold: true, color: "#C62828" };
    expect(formatted.edits[0].style).toEqual(style);
    expect(formatted.style).toEqual(style);

    const next = addText(editorReducer(formatted, { type: "finishEditing" }), "b");
    expect(next.edits[1].style).toEqual(style);
    expect(next.edits[0].style).toEqual(style);
  });

  it("formats only the box being edited", () => {
    const state = addText(editorReducer(addText(), { type: "changeText", id: "a", lines: ["Kept"] }), "b");

    const formatted = editorReducer(state, { type: "setStyle", style: { size: 30 } });

    expect(formatted.edits.map((edit) => edit.style.size)).toEqual([12, 30]);
  });

  it("ignores formatting when no box is being edited", () => {
    expect(editorReducer(initialState, { type: "setStyle", style: { size: 30 } })).toBe(initialState);
  });
});
