import { describe, expect, it } from "vitest";
import { pickLocale } from "./locale";

describe("pickLocale", () => {
  it("uses the remembered choice first", () => {
    expect(pickLocale("pl", "en-US,en;q=0.9")).toBe("pl");
  });

  it("ignores an unknown remembered value", () => {
    expect(pickLocale("de", "pl-PL")).toBe("pl");
  });

  it.each([
    ["pl-PL,pl;q=0.9,en;q=0.8", "pl"],
    ["en-GB,en;q=0.9", "en"],
    ["de-DE,de;q=0.9,pl;q=0.5", "pl"],
    ["en;q=0.5,pl;q=0.9", "pl"],
    ["pl;q=0,en;q=0.1", "en"],
  ])("picks the browser's preferred supported language from %s", (header, expected) => {
    expect(pickLocale(undefined, header)).toBe(expected);
  });

  it.each([["de-DE,fr;q=0.8"], [""], [null]])("falls back to English for %s", (header) => {
    expect(pickLocale(undefined, header)).toBe("en");
  });
});
