import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
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

it("uses no colours outside the design tokens", () => {
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter(
    (f) => /^(app|components|lib)\//.test(f) && /\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith("globals.css"),
  );
  const rawColor = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(|\b(bg|text|border|ring|fill|stroke)-(white|black)\b/i;

  expect(files.length).toBeGreaterThan(0);
  expect(files.filter((f) => rawColor.test(readFileSync(join(root, f), "utf8"))).map((f) => relative(root, join(root, f)))).toEqual([]);
});
