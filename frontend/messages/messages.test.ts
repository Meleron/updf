import { expect, it } from "vitest";
import en from "./en.json";
import pl from "./pl.json";

function keys(messages: object, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

it("has every English message key in Polish, and no extra ones", () => {
  expect(keys(pl).sort()).toEqual(keys(en).sort());
});
