import { describe, expect, it } from "vitest";
import type { TextStyle } from "./edits";
import { defaultStyle } from "./editor-state";
import { fontFace, unsupportedCharacters } from "./formatting";

function style(font: TextStyle["font"], bold = false, italic = false): TextStyle {
  return { ...defaultStyle, font, bold, italic };
}

describe("fontFace", () => {
  it.each([
    [style("sans"), "NotoSans-Regular"],
    [style("sans", true, true), "NotoSans-BoldItalic"],
    [style("serif", false, true), "NotoSerif-Italic"],
    [style("serif", true), "NotoSerif-Bold"],
    [style("mono", false, true), "NotoSansMono-Regular"],
    [style("mono", true, true), "NotoSansMono-Bold"],
  ])("picks the backend's face for %j", (textStyle, face) => {
    expect(fontFace(textStyle)).toBe(face);
  });
});

describe("unsupportedCharacters", () => {
  it.each(["sans", "serif", "mono"] as const)("accepts Polish, Cyrillic and Greek in %s", (font) => {
    expect(unsupportedCharacters(["Zażółć gęślą jaźń", "Съешь же ещё", "Ξεσκεπάζω"], style(font, true, true))).toEqual([]);
  });

  it("finds emoji, Chinese and tabs, each once", () => {
    expect(unsupportedCharacters(["Hi 😀 你好", "😀\tend"], defaultStyle)).toEqual(["😀", "你", "好", "\t"]);
  });

  it("checks the face of the style", () => {
    // Noto Sans Mono has box-drawing characters, Noto Sans doesn't.
    expect(unsupportedCharacters(["┌─┐"], style("mono"))).toEqual([]);
    expect(unsupportedCharacters(["┌─┐"], style("sans"))).toEqual(["┌", "─", "┐"]);
  });
});
