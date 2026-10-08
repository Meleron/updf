import { describe, expect, it } from "vitest";
import type { TextStyle } from "./edits";
import { defaultStyle } from "./editor-state";
import { unsupportedCharacters } from "./formatting";

function style(font: TextStyle["font"], bold = false, italic = false): TextStyle {
  return { ...defaultStyle, font, bold, italic };
}

describe("unsupportedCharacters", () => {
  it.each(["Noto Sans", "Noto Serif", "Noto Sans Mono"])("accepts Polish, Cyrillic and Greek in %s", (font) => {
    expect(unsupportedCharacters(["Zażółć gęślą jaźń", "Съешь же ещё", "Ξεσκεπάζω"], style(font, true, true))).toEqual([]);
  });

  it("finds emoji, Chinese and tabs, each once", () => {
    expect(unsupportedCharacters(["Hi 😀 你好", "😀\tend"], defaultStyle)).toEqual(["😀", "你", "好", "\t"]);
  });

  it("checks the face of the style", () => {
    // Noto Sans Mono has box-drawing characters, Noto Sans doesn't.
    expect(unsupportedCharacters(["┌─┐"], style("Noto Sans Mono"))).toEqual([]);
    expect(unsupportedCharacters(["┌─┐"], style("Noto Sans"))).toEqual(["┌", "─", "┐"]);
    // Poppins has no Cyrillic.
    expect(unsupportedCharacters(["Жук"], style("Poppins"))).toEqual(["Ж", "у", "к"]);
  });
});
