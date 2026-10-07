import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const css = readFileSync(join(__dirname, "globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
}

const themes = {
  light: tokens(css.slice(css.indexOf("@theme {"), css.indexOf(".dark {"))),
  dark: tokens(css.slice(css.indexOf(".dark {"), css.indexOf("@theme inline"))),
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The text-on-surface pairings the interface may use. All must pass WCAG AA (4.5:1). In the light theme
// text-muted and danger on surface-muted fall just short (4.4:1), so they are not allowed.
const pairings = [
  ...["text", "text-secondary", "text-muted", "accent", "danger", "success", "warning"].flatMap((text) =>
    ["bg", "surface"].map((surface) => [text, surface]),
  ),
  ["text", "surface-muted"],
  ["text-secondary", "surface-muted"],
  ["on-accent", "accent"],
  ["on-accent", "accent-hover"],
];

describe.each(Object.entries(themes))("%s theme", (_, colors) => {
  it.each(pairings)("%s on %s passes WCAG AA", (text, surface) => {
    expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5);
  });
});

// Source files other than the tokens and tests. Only these folders are read, so node_modules and .next are never walked.
const sources = ["app", "components", "lib"].flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith("globals.css"))
    .map((f) => join(dir, f)),
);

function matches(pattern: RegExp, files = sources): string[] {
  return files.flatMap((f) => [...readFileSync(join(root, f), "utf8").matchAll(pattern)].map((m) => `${f}: ${m[0]}`));
}

it("reads the source files", () => {
  expect(sources).toContain(join("app", "layout.tsx"));
});

// Files with colours of the text in the PDF, which are content, not interface colours.
const documentColours = [join("lib", "editor-state.ts"), join("lib", "formatting.ts")];

it("uses no colours outside the design tokens", () => {
  const files = sources.filter((f) => !documentColours.includes(f));
  expect(
    matches(/#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(bg|text|border|ring|fill|stroke)-(white|black)\b/gi, files),
  ).toEqual([]);
});

it("uses only sizes from the type scale", () => {
  expect(matches(/\btext-\[[^\]]*\d(px|rem|em)\]/g)).toEqual([]);
});

it("keeps spacing on the 4px grid", () => {
  expect(matches(/(?<![\w-])-?([pm][xytrblse]?|gap(-[xy])?|space-[xy])-(\d*\.5|px)(?![\w.])/g)).toEqual([]);
});

it("animates for 150-200 ms", () => {
  expect(matches(/\bduration-(?!(1[5-9]\d|200)\b)\d+/g)).toEqual([]);
});
