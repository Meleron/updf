import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture, openInEditor, pageImage, pick } from "./helpers";
import { readText } from "./pdf";
import { addBox, download, expectExportedAsPreviewed, expectNear, openAt100Percent, pixelsPerPoint, previewLines, textBoxInput } from "./text-boxes";

test.use({ locale: "en-US" });

const exportUrl = "**/api/pdf/export";

test("Download shows its progress, saves <name>-edited.pdf with every edit, and keeps the edits", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page, 100, 300);
  await page.keyboard.type("Moved by 20 pt");
  await page.keyboard.press("Escape");
  const moved = page.getByTestId("text-box").first();
  const [before] = await previewLines(page, moved);
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  const [after] = await previewLines(page, moved);
  expectNear(after.x, before.x + 20, 0.01);
  await pageImage(page, 1, 1).click({ position: { x: 100 * pixelsPerPoint, y: 113 * pixelsPerPoint } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Replaced line");

  // The request waits until the progress state has been seen.
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(exportUrl, async (route) => {
    requests++;
    await held;
    await route.continue();
  });
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const busy = page.getByRole("button", { name: "Preparing…" });
  await expect(busy).toHaveAttribute("aria-disabled", "true");
  // A second click while it's busy sends nothing.
  await busy.click({ force: true });
  release();
  const file = await saved;

  expect(file.suggestedFilename()).toBe("simple-edited.pdf");
  expect(requests).toBe(1);
  await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  const exported = await readText(readFileSync(await file.path()), 1);
  await expectExportedAsPreviewed(page, moved, exported);
  await expectExportedAsPreviewed(page, page.getByTestId("text-box").nth(1), exported);

  // The edits stay, and editing goes on.
  await expect(page.getByTestId("text-box")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await moved.dblclick();
  await expect(textBoxInput(page)).toHaveValue("Moved by 20 pt");
});

test("the download keeps a name with Polish characters and spaces", async ({ page }) => {
  await page.goto("/");
  await pick(page, { name: "Raport – zażółć gęślą.pdf", mimeType: "application/pdf", buffer: readFileSync(fixture("simple.pdf")) });
  await expect(page).toHaveURL("/edit");
  await addBox(page);
  await page.keyboard.type("Zażółć");
  await page.keyboard.press("Escape");

  const { name, pdf } = await download(page);

  expect(name).toBe("Raport – zażółć gęślą-edited.pdf");
  expect((await readText(pdf, 1)).map((text) => text.text)).toContain("Zażółć");
});

// The only test that simulates a failing network.
test("a failed download shows the error with Retry, and keeps the edits", async ({ page }) => {
  await openInEditor(page, "simple.pdf");
  await addBox(page);
  await page.keyboard.type("Kept");
  await page.keyboard.press("Escape");
  const banner = page.getByRole("alert").filter({ hasText: /\S/ });
  const retry = banner.getByRole("button", { name: "Retry" });

  // An error from the backend shows its own message.
  await page.route(exportUrl, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/problem+json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: 429, code: "rate-limited" }),
    }),
  );
  await page.getByRole("button", { name: "Download" }).click();
  await expect(banner).toContainText("Too many downloads in a short time. Wait a minute and try again.");
  await expect(page.getByTestId("text-box")).toHaveText("Kept");

  // The network failing shows the generic message.
  await page.unroute(exportUrl);
  await page.route(exportUrl, (route) => route.abort("internetdisconnected"));
  await retry.click();
  await expect(banner).toContainText("The download failed. Check your connection and try again.");
  await expect(page.getByTestId("text-box")).toHaveText("Kept");

  // Retry downloads once the network is back.
  await page.unroute(exportUrl);
  const saved = page.waitForEvent("download");
  await retry.click();
  const file = await saved;
  await expect(banner).toBeHidden();
  await expect(page.getByTestId("pages")).toBeFocused();
  expect((await readText(readFileSync(await file.path()), 1)).map((text) => text.text)).toContain("Kept");
  await expect(page.getByTestId("text-box")).toHaveText("Kept");
});
