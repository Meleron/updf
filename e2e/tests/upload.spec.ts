import { expect, test } from "@playwright/test";
import { drop, pick, type Upload } from "./helpers";

// Generated here rather than stored with the fixtures, as the spec asks.
const overSizeLimit: Upload = {
  name: "large.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(25 * 1024 * 1024)]),
};

// Next.js adds its own role="alert" element (the route announcer), so messages are found by their text.
test.use({ locale: "en-US" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the empty dashboard shows the drop zone with a hint", async ({ page }) => {
  const zone = page.getByRole("region", { name: "Drop a PDF here" });

  await expect(zone).toBeVisible();
  await expect(zone).toContainText("Up to 25 MB and 100 pages.");
  await expect(zone.getByRole("button", { name: "Choose a PDF" })).toBeEnabled();
});

test("picking a valid PDF opens it in the editor", async ({ page }) => {
  await pick(page, "simple.pdf");

  await expect(page).toHaveURL("/edit");
  await expect(page.getByRole("heading", { name: "simple.pdf" })).toBeVisible();
});

test("dropping a valid PDF opens it in the editor", async ({ page }) => {
  await drop(page, "polish.pdf");

  await expect(page).toHaveURL("/edit");
  await expect(page.getByRole("heading", { name: "polish.pdf" })).toBeVisible();
});

const rejected: [string, Upload, string][] = [
  ["a file that isn't a PDF", "not-a-pdf.pdf", "This file isn't a PDF."],
  ["a file over 25 MB", overSizeLimit, "This file is over 25 MB."],
  ["a PDF with 101 pages", "pages-101.pdf", "This PDF has more than 100 pages."],
  ["a password-protected PDF", "password.pdf", "This PDF is protected with a password or permissions"],
  ["a PDF with only an owner password", "owner-password.pdf", "This PDF is protected with a password or permissions"],
  ["a damaged PDF", "damaged.pdf", "This PDF is damaged and can't be opened."],
];

for (const [description, file, message] of rejected) {
  test(`${description} is rejected with a message`, async ({ page }) => {
    await pick(page, file);

    await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
    await expect(page).toHaveURL("/");
  });
}

test("a dropped file that isn't a PDF is rejected with a message", async ({ page }) => {
  await drop(page, "not-a-pdf.pdf");

  await expect(page.getByRole("alert").filter({ hasText: "This file isn't a PDF." })).toBeVisible();
});

test("a valid PDF picked after a rejected one opens", async ({ page }) => {
  await pick(page, "damaged.pdf");
  await expect(page.getByRole("alert").filter({ hasText: "This PDF is damaged" })).toBeVisible();

  await pick(page, "simple.pdf");

  await expect(page).toHaveURL("/edit");
});

// JavaScript features that browsers more than about a year old lack, removed from the page and from pdf.js's worker.
const newestFeatures = [
  "Uint8Array.prototype.toHex",
  "Uint8Array.prototype.toBase64",
  "Uint8Array.fromHex",
  "Uint8Array.fromBase64",
  "Map.prototype.getOrInsert",
  "Map.prototype.getOrInsertComputed",
  "Math.sumPrecise",
]
  .map((feature) => `delete ${feature};`)
  .join("");

test("an older browser can open a valid PDF", async ({ page }) => {
  await page.addInitScript(newestFeatures);
  await page.route(/pdf\.worker/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: newestFeatures + (await response.text()) });
  });
  await page.reload();

  await pick(page, "simple.pdf");

  await expect(page).toHaveURL("/edit");
});

test("a PDF reader that fails to load shows a general error and allows another try", async ({ page }) => {
  await page.route(/pdf\.worker/, (route) => route.abort());

  await pick(page, "simple.pdf");

  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a PDF" })).toBeEnabled();
});

test.describe("with a Polish browser", () => {
  test.use({ locale: "pl-PL" });

  test("the message is translated", async ({ page }) => {
    await pick(page, "pages-101.pdf", "Wybierz plik PDF");

    await expect(page.getByRole("alert").filter({ hasText: "Ten plik PDF ma ponad 100 stron." })).toBeVisible();
  });
});

test("opening the editor without a document returns to the dashboard", async ({ page }) => {
  await page.goto("/edit");

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("region", { name: "Drop a PDF here" })).toBeVisible();
});
