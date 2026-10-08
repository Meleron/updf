import { describe, expect, it } from "vitest";
import { faceFor } from "./fonts";
import faces from "./font-faces.json";

describe("faceFor", () => {
  it.each([
    ["Noto Sans", false, false, "NotoSans-Regular"],
    ["Noto Sans", true, true, "NotoSans-BoldItalic"],
    ["Noto Serif", false, true, "NotoSerif-Italic"],
    ["Noto Sans Mono", false, true, "NotoSansMono-Regular"],
    ["Noto Sans Mono", true, true, "NotoSansMono-Bold"],
    ["IBM Plex Sans", true, false, "IBMPlexSans-Bold"],
  ] as const)("picks the backend's face for %s, bold %s, italic %s", (font, bold, italic, face) => {
    expect(faceFor({ font, bold, italic })).toBe(faces[face]);
  });

  it("has the backend's metrics", () => {
    expect(faceFor({ font: "Noto Sans", bold: false, italic: false })).toMatchObject({ ascent: 1.069, lineHeight: 1.362 });
    expect(faceFor({ font: "Arimo", bold: false, italic: false })).toMatchObject({ ascent: 1854 / 2048, lineHeight: (1854 + 434 + 67) / 2048 });
  });
});
