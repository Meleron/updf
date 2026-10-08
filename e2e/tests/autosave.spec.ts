import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, fixture, openInEditor, pageImage, pick, showThumbnails } from "./helpers";
import { readText } from "./pdf";
import { addBox, download, expectExportedAsPreviewed, openAt100Percent, pixelsPerPoint, previewLines, textBoxInput } from "./text-boxes";

test.use({ locale: "en-US" });

/** The edits autosave has stored, or null before anything is stored. */
function savedEdits(page: Page) {
  return page.evaluate(async () => {
    // Opening a database that doesn't exist yet would create it without the app's store.
    if (!(await indexedDB.databases()).some((database) => database.name === "updf")) {
      return null;
    }
    return new Promise<unknown[] | null>((resolve) => {
      const opening = indexedDB.open("updf");
      opening.onsuccess = () => {
        const reading = opening.result.transaction("document").objectStore("document").get("edits");
        reading.onsuccess = () => {
          opening.result.close();
          resolve(reading.result?.edits ?? null);
        };
      };
    });
  });
}

function continueCard(page: Page, name: string) {
  return page.getByRole("button", { name: new RegExp(`^Continue editing ${name.replaceAll(".", "\\.")}`) });
}

test("after a reload, Continue editing restores the document and every edit", async ({ page }) => {
  await openAt100Percent(page);
  await addBox(page, 100, 300);
  await page.keyboard.type("Kept after a reload\nZażółć");
  await page.keyboard.press("Escape");
  await page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Bold" }).click();
  await pageImage(page, 1, 1).click({ position: { x: 100 * pixelsPerPoint, y: 113 * pixelsPerPoint } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Replaced line");
  await page.keyboard.press("Escape");
  const boxes = page.getByTestId("text-box");
  const before = [await previewLines(page, boxes.nth(0)), await previewLines(page, boxes.nth(1))];
  await expect.poll(() => savedEdits(page)).toHaveLength(2);

  await page.reload();
  await expect(page).toHaveURL("/");
  const card = continueCard(page, "simple.pdf");
  await expect(card).toContainText("Saved in this browser · 2 edits");
  await card.click();

  await expect(page).toHaveURL("/edit");
  await page.getByRole("button", { name: /^Zoom: / }).click();
  await page.getByRole("menuitemradio", { name: "100%", exact: true }).click();
  await expect(boxes).toHaveCount(2);
  expect([await previewLines(page, boxes.nth(0)), await previewLines(page, boxes.nth(1))]).toEqual(before);
  await expect(page.getByTestId("cover")).toHaveCount(1);
  // The restored edits are where editing starts, not steps to undo.
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  const exported = await readText((await download(page)).pdf, 1);
  await expectExportedAsPreviewed(page, boxes.nth(0), exported);
  await expectExportedAsPreviewed(page, boxes.nth(1), exported);
});

test("a restored replacement on a page not yet shown downloads in its original font", async ({ page }) => {
  await openInEditor(page, "pages-100.pdf");
  await showThumbnails(page);
  await page.getByRole("button", { name: "Page 50", exact: true }).click();
  const page50 = pageImage(page, 50, 100);
  const scale = (await page50.boundingBox())!.width / 595;
  await page50.click({ position: { x: 100 * scale, y: 92 * scale } });
  await expect(textBoxInput(page)).toHaveValue("Page 50 of 100");
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await expect.poll(() => savedEdits(page)).toHaveLength(1);

  await page.reload();
  await continueCard(page, "pages-100.pdf").click();
  await expect(page).toHaveURL("/edit");
  await expect(page.getByTestId("text-box")).toHaveText("Page 50 of 10");

  const exported = await readText((await download(page)).pdf, 50);
  const original = exported.find((text) => text.text === "Page 50 of 100");
  const replacement = exported.find((text) => text.text === "Page 50 of 10");
  expect(replacement?.font).toBe(original?.font);
});

test("opening another file asks before replacing a saved document with edits", async ({ page }) => {
  await openInEditor(page, "simple.pdf");
  await addBox(page);
  await page.keyboard.type("Saved edit");
  await page.keyboard.press("Escape");
  // Right away: closing the editor saves the change still waiting, before the dashboard loads it. Back works on phones,
  // which have no room for the app's name.
  await page.goBack();
  await expect(continueCard(page, "simple.pdf")).toContainText("1 edit");
  await expectNoAxeViolations(page);

  const dialog = page.getByRole("alertdialog", { name: "Replace the saved document?" });
  await pick(page, "polish.pdf");
  await expect(dialog).toContainText("simple.pdf and its edits are saved in this browser. Opening polish.pdf replaces them.");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectNoAxeViolations(page, "[role=alertdialog]");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL("/");
  await expect(continueCard(page, "simple.pdf")).toContainText("1 edit");

  await pick(page, "polish.pdf");
  await dialog.getByRole("button", { name: "Replace" }).click();
  await expect(page).toHaveURL("/edit");
  await expect(page.getByRole("heading", { name: "polish.pdf" })).toBeAttached();
  await expect.poll(() => savedEdits(page)).toEqual([]);

  // A saved document without edits is replaced without asking.
  await page.reload();
  await expect(continueCard(page, "polish.pdf")).toContainText("no edits yet");
  await pick(page, { name: "other.pdf", mimeType: "application/pdf", buffer: readFileSync(fixture("simple.pdf")) });
  await expect(page).toHaveURL("/edit");
});

test("when the browser can't save, a warning says autosave is off and editing goes on", async ({ page }) => {
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
  });
  await openAt100Percent(page);

  await expect(page.getByRole("status").filter({ hasText: "Autosave is off. Download to keep your work." })).toBeVisible();
  await addBox(page);
  await page.keyboard.type("Still editing");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("text-box")).toHaveText("Still editing");
});

test("a reload right after an edit keeps it", async ({ page }) => {
  await openInEditor(page, "simple.pdf");
  await addBox(page);
  await page.keyboard.type("Typed just now");

  await page.reload();

  await expect(continueCard(page, "simple.pdf")).toContainText("1 edit");
});

test("going forward to the editor from the dashboard doesn't lose the saved edits", async ({ page }) => {
  await openInEditor(page, "simple.pdf");
  await addBox(page);
  await page.keyboard.type("Kept");
  await page.keyboard.press("Escape");
  await page.goBack();
  await expect(continueCard(page, "simple.pdf")).toContainText("1 edit");

  await page.goForward();

  await expect(page).toHaveURL("/");
  await expect(continueCard(page, "simple.pdf")).toContainText("1 edit");
});

test("a tab whose document another tab replaced saves nothing more, and says autosave is off", async ({ page, context }) => {
  await openInEditor(page, "simple.pdf");
  const other = await context.newPage();
  await openInEditor(other, "polish.pdf");
  await expect.poll(() => savedEdits(other)).toEqual([]);

  await addBox(page);
  await page.keyboard.type("Not for polish.pdf");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("status").filter({ hasText: "Autosave is off. Download to keep your work." })).toBeVisible();
  await other.reload();
  await expect(continueCard(other, "polish.pdf")).toContainText("no edits yet");
});
