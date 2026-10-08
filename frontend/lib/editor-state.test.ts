import { describe, expect, it } from "vitest";
import { defaultStyle, editorReducer, initialState, type EditorAction, type EditorState } from "./editor-state";

function addText(state: EditorState = initialState, id = "a") {
  return editorReducer(state, { type: "addText", id, page: 1, x: 72, y: 96 });
}

function apply(state: EditorState, ...actions: EditorAction[]) {
  return actions.reduce(editorReducer, state);
}

/** Two finished boxes, "a" and "b", with nothing selected. */
function twoBoxes() {
  return apply(
    addText(),
    { type: "changeText", id: "a", lines: ["A"] },
    { type: "addText", id: "b", page: 1, x: 72, y: 200 },
    { type: "changeText", id: "b", lines: ["B"] },
    { type: "deselect" },
  );
}

const replacement = {
  id: "r",
  page: 0,
  x: 72,
  y: 81,
  lines: ["Original"],
  style: { ...defaultStyle, font: "Noto Serif", size: 14 },
  cover: { x: 70, y: 80, width: 100, height: 20, color: "#FEF3C7" },
};

describe("editorReducer", () => {
  it("starts with the Select tool and no edits", () => {
    expect(initialState).toMatchObject({ edits: [], tool: "select", selected: null, editing: null });
  });

  it("switches the tool", () => {
    expect(editorReducer(initialState, { type: "setTool", tool: "text" }).tool).toBe("text");
  });

  it("adds an empty box in the style used last, selected and ready to type, and goes back to Select", () => {
    const style = { ...defaultStyle, font: "Noto Serif", size: 20 };
    const state = addText({ ...initialState, tool: "text", style });

    expect(state.edits).toEqual([{ id: "a", page: 1, x: 72, y: 96, lines: [""], style }]);
    expect(state).toMatchObject({ selected: "a", editing: "a", tool: "select" });
  });

  it("changes the text of one box", () => {
    const state = editorReducer(twoBoxes(), { type: "changeText", id: "a", lines: ["Zażółć", "gęślą jaźń"] });

    expect(state.edits.map((edit) => edit.lines)).toEqual([["Zażółć", "gęślą jaźń"], ["B"]]);
  });

  it("keeps a box with text when the edit finishes, and keeps it selected", () => {
    const state = apply(addText(), { type: "changeText", id: "a", lines: ["", "Text"] }, { type: "finishEditing" });

    expect(state.edits).toHaveLength(1);
    expect(state).toMatchObject({ selected: "a", editing: null });
  });

  it.each([[[""]], [["", ""]], [["  ", "\t"]]])("discards a box left empty (%j) when the edit finishes", (lines) => {
    const state = apply(twoBoxes(), { type: "edit", id: "b" }, { type: "changeText", id: "b", lines }, { type: "finishEditing" });

    expect(state.edits.map((edit) => edit.id)).toEqual(["a"]);
    expect(state).toMatchObject({ selected: null, editing: null });
  });

  it("finishes the edit in progress when another box is added, selected or edited", () => {
    const empty = apply(twoBoxes(), { type: "edit", id: "a" }, { type: "changeText", id: "a", lines: [""] });

    for (const action of [
      { type: "addText", id: "c", page: 1, x: 0, y: 0 },
      { type: "select", id: "b" },
      { type: "edit", id: "b" },
    ] as const) {
      expect(editorReducer(empty, action).edits.map((edit) => edit.id)).not.toContain("a");
    }
  });

  it("selects a box, then edits it", () => {
    const selected = editorReducer(twoBoxes(), { type: "select", id: "b" });
    expect(selected).toMatchObject({ selected: "b", editing: null });

    expect(editorReducer(selected, { type: "edit", id: "b" })).toMatchObject({ selected: "b", editing: "b" });
  });

  it("deselects, finishing the edit", () => {
    const state = apply(twoBoxes(), { type: "edit", id: "a" }, { type: "deselect" });

    expect(state).toMatchObject({ selected: null, editing: null });
    expect(state.edits).toHaveLength(2);
  });

  it("formats the selected box, and new boxes take its style", () => {
    const formatted = apply(twoBoxes(), { type: "select", id: "a" }, { type: "setStyle", style: { font: "Noto Serif", bold: true, color: "#C62828" } });
    const style = { ...defaultStyle, font: "Noto Serif", bold: true, color: "#C62828" };

    expect(formatted.edits.map((edit) => edit.style)).toEqual([style, defaultStyle]);
    expect(formatted.style).toEqual(style);
    expect(addText(formatted, "c").edits[2].style).toEqual(style);
  });

  it("doesn't give new boxes a replacement's font, which can't be chosen", () => {
    const replaced = apply(initialState, { type: "addReplacement", edit: { ...replacement, style: { ...defaultStyle, font: "Arimo" } } });
    const formatted = editorReducer(replaced, { type: "setStyle", style: { bold: true } });

    expect(formatted.edits[0].style).toMatchObject({ font: "Arimo", bold: true });
    expect(formatted.style).toEqual({ ...defaultStyle, bold: true });
  });

  it("ignores formatting when no box is selected", () => {
    expect(editorReducer(initialState, { type: "setStyle", style: { size: 30 } })).toBe(initialState);
  });

  it("moves a box", () => {
    const state = editorReducer(twoBoxes(), { type: "move", id: "b", x: 100, y: 300 });

    expect(state.edits.map(({ x, y }) => [x, y])).toEqual([
      [72, 96],
      [100, 300],
    ]);
  });

  it("moves only the text of a replacement: the cover stays over the original", () => {
    const state = apply(initialState, { type: "addReplacement", edit: replacement }, { type: "move", id: "r", x: 90, y: 120 });

    expect(state.edits[0]).toMatchObject({ x: 90, y: 120, cover: replacement.cover });
  });

  it("adds a replacement selected and ready to edit, without changing the style for new boxes", () => {
    const state = editorReducer(initialState, { type: "addReplacement", edit: replacement });

    expect(state.edits).toEqual([replacement]);
    expect(state).toMatchObject({ selected: "r", editing: "r", style: defaultStyle });
  });

  it("deletes a box, and deselects it", () => {
    const state = editorReducer(twoBoxes(), { type: "edit", id: "b" });

    expect(editorReducer(state, { type: "delete", id: "b" })).toMatchObject({ edits: [{ id: "a" }], selected: null, editing: null });
    expect(editorReducer(state, { type: "delete", id: "a" })).toMatchObject({ edits: [{ id: "b" }], selected: "b", editing: "b" });
  });

  it("removes a replacement emptied of text, with its cover", () => {
    const state = apply(
      initialState,
      { type: "addReplacement", edit: replacement },
      { type: "changeText", id: "r", lines: [""] },
      { type: "finishEditing" },
    );

    expect(state.edits).toEqual([]);
  });
});
