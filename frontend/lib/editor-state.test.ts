import { describe, expect, it } from "vitest";
import { canRedo, canUndo, defaultStyle, editorReducer, initialState, isUntouched, type EditorAction, type EditorState } from "./editor-state";

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

  it("discards a replacement left as it was made when its edit finishes, recording nothing", () => {
    const opened = editorReducer(twoBoxes(), { type: "addReplacement", edit: replacement });
    expect(isUntouched(opened, "r")).toBe(true);

    for (const finish of [{ type: "finishEditing" }, { type: "deselect" }, { type: "select", id: "a" }] as const) {
      const finished = editorReducer(opened, finish);
      expect(finished.edits.map((edit) => edit.id), finish.type).toEqual(["a", "b"]);
    }
    const finished = editorReducer(opened, { type: "finishEditing" });
    expect(finished.past).toEqual(twoBoxes().past);
    expect(finished.selected).toBeNull();
    // Undo then takes back the step before it.
    expect(editorReducer(opened, { type: "undo" }).edits.map((edit) => edit.id)).toEqual(["a"]);
    // Typing and deleting it again leaves it as it was.
    const retyped = apply(opened, { type: "changeText", id: "r", lines: ["Originals"] }, { type: "changeText", id: "r", lines: ["Original"] });
    expect(isUntouched(retyped, "r")).toBe(true);
    expect(editorReducer(retyped, { type: "finishEditing" }).edits).toHaveLength(2);
  });

  it("keeps a replacement changed in text or style", () => {
    const opened = editorReducer(initialState, { type: "addReplacement", edit: replacement });

    const changes: EditorAction[] = [
      { type: "changeText", id: "r", lines: ["Changed"] },
      { type: "setStyle", style: { bold: true } },
    ];
    for (const change of changes) {
      const changed = editorReducer(opened, change);
      expect(isUntouched(changed, "r")).toBe(false);
      expect(editorReducer(changed, { type: "finishEditing" }).edits, change.type).toHaveLength(1);
    }
  });

  it("treats only a replacement in its first edit as untouched", () => {
    const kept = apply(initialState, { type: "addReplacement", edit: replacement }, { type: "changeText", id: "r", lines: ["Changed"] }, { type: "finishEditing" });
    const changedBack = apply(kept, { type: "edit", id: "r" }, { type: "changeText", id: "r", lines: ["Original"] });

    expect(isUntouched(changedBack, "r")).toBe(false);
    expect(isUntouched(addText(), "a")).toBe(false);
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

describe("undo and redo", () => {
  const lines = (state: EditorState) => state.edits.map((edit) => edit.lines.join("\n"));
  const undo = { type: "undo" } as const;
  const redo = { type: "redo" } as const;

  it("undoes and redoes a new box with its text, as one step once the edit finishes", () => {
    const typed = apply(addText(), { type: "changeText", id: "a", lines: ["A"] }, { type: "changeText", id: "a", lines: ["Ab"] }, { type: "finishEditing" });

    const undone = editorReducer(typed, undo);
    expect(undone.edits).toEqual([]);
    expect(lines(editorReducer(undone, redo))).toEqual(["Ab"]);
  });

  it("undoes a later edit of a box's text as its own step", () => {
    const edited = apply(twoBoxes(), { type: "edit", id: "a" }, { type: "changeText", id: "a", lines: ["A2"] }, { type: "deselect" });

    expect(lines(edited)).toEqual(["A2", "B"]);
    expect(lines(editorReducer(edited, undo))).toEqual(["A", "B"]);
    expect(lines(apply(edited, undo, undo))).toEqual(["A"]);
  });

  it("undoes a style change, a move and a delete, each as one step", () => {
    const changed = apply(
      twoBoxes(),
      { type: "select", id: "a" },
      { type: "setStyle", style: { bold: true } },
      { type: "move", id: "a", x: 10, y: 20 },
      { type: "delete", id: "b" },
    );

    const steps = [changed, editorReducer(changed, undo), apply(changed, undo, undo), apply(changed, undo, undo, undo)];
    expect(steps.map((state) => state.edits.map(({ id, x, style }) => `${id} ${x} ${style.bold}`))).toEqual([
      ["a 10 true"],
      ["a 10 true", "b 72 false"],
      ["a 72 true", "b 72 false"],
      ["a 72 false", "b 72 false"],
    ]);
    expect(apply(changed, undo, undo, undo, redo, redo, redo).edits).toEqual(changed.edits);
  });

  it("counts arrow presses on a box in a row as one move, and a drag as its own", () => {
    const nudged = apply(
      twoBoxes(),
      { type: "select", id: "a" },
      { type: "move", id: "a", x: 80, y: 96, nudge: true },
      { type: "move", id: "a", x: 81, y: 96, nudge: true },
      { type: "move", id: "a", x: 200, y: 96 },
      { type: "move", id: "a", x: 201, y: 96, nudge: true },
    );

    expect(apply(nudged, undo).edits[0].x).toBe(200);
    expect(apply(nudged, undo, undo).edits[0].x).toBe(81);
    expect(apply(nudged, undo, undo, undo).edits[0].x).toBe(72);
  });

  it("doesn't join a move to the step before it after an arrow press that couldn't move the box", () => {
    const nudged = apply(
      twoBoxes(),
      { type: "select", id: "a" },
      { type: "move", id: "a", x: 72, y: 96, nudge: true },
      { type: "move", id: "a", x: 73, y: 96, nudge: true },
    );

    expect(lines(apply(nudged, undo))).toEqual(["A", "B"]);
  });

  it("can't undo when finishing the edit in progress would only discard an empty box", () => {
    expect(canUndo(addText())).toBe(false);
    expect(canUndo(apply(addText(), { type: "changeText", id: "a", lines: ["A"] }))).toBe(true);
  });

  it("makes typing and formatting while typing part of the edit", () => {
    const typing = apply(addText(), { type: "changeText", id: "a", lines: ["A"] }, { type: "setStyle", style: { bold: true } });

    expect(typing.past).toEqual([]);
    expect(editorReducer(typing, { type: "finishEditing" }).past).toEqual([[]]);
  });

  it("finishes the edit in progress before undoing, so undo takes back the typing", () => {
    const typing = apply(twoBoxes(), { type: "edit", id: "a" }, { type: "changeText", id: "a", lines: ["A2"] });

    const undone = editorReducer(typing, undo);
    expect(lines(undone)).toEqual(["A", "B"]);
    expect(undone.editing).toBeNull();
    expect(lines(editorReducer(undone, redo))).toEqual(["A2", "B"]);
  });

  it("records nothing for actions that change no edit, and nothing for a box left empty", () => {
    const state = apply(
      twoBoxes(),
      { type: "select", id: "a" },
      { type: "edit", id: "a" },
      { type: "deselect" },
      { type: "setTool", tool: "text" },
      { type: "addText", id: "c", page: 1, x: 0, y: 0 },
      { type: "finishEditing" },
    );

    expect(state.past).toHaveLength(twoBoxes().past.length);
  });

  it("clears redo when a new step is taken", () => {
    const undone = apply(twoBoxes(), undo);
    expect(undone.future).toHaveLength(1);

    const moved = apply(undone, { type: "move", id: "a", x: 0, y: 0 });
    expect(moved.future).toEqual([]);
    expect(editorReducer(moved, redo).edits).toEqual(moved.edits);
  });

  it("can undo once there's a step or a box being typed in, and redo once there's an undone step", () => {
    expect([canUndo(initialState), canRedo(initialState)]).toEqual([false, false]);
    expect([canUndo(twoBoxes()), canRedo(twoBoxes())]).toEqual([true, false]);
    expect(canRedo(apply(twoBoxes(), undo))).toBe(true);
    expect(canUndo(apply(twoBoxes(), undo, undo))).toBe(false);
  });

  it("does nothing at either end of the history", () => {
    expect(editorReducer(initialState, undo).edits).toEqual([]);
    expect(editorReducer(initialState, redo).edits).toEqual([]);
    expect(editorReducer(twoBoxes(), redo).edits).toEqual(twoBoxes().edits);
  });

  it("keeps the selection only on a box that still exists", () => {
    const selected = apply(twoBoxes(), { type: "select", id: "b" });

    expect(editorReducer(selected, undo).selected).toBeNull();
    expect(apply(selected, { type: "select", id: "a" }, undo).selected).toBe("a");
  });

  it("has nothing to undo after typing that ends with the text it started with", () => {
    const state = apply(twoBoxes(), { type: "edit", id: "a" });
    const retyped = apply(state, { type: "changeText", id: "a", lines: ["A2"] }, { type: "changeText", id: "a", lines: ["A"] }, { type: "deselect" });

    expect(retyped.past).toHaveLength(twoBoxes().past.length);
    expect(retyped.lastStep).toBe(retyped.edits);
  });
});
