import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

export type Upload = string | { name: string; mimeType: string; buffer: Buffer };

export function fixture(name: string): string {
  return fileURLToPath(new URL(`../../fixtures/pdfs/${name}`, import.meta.url));
}

export async function pick(page: Page, file: Upload, button = "Choose a PDF") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(typeof file === "string" ? fixture(file) : file);
}

export async function drop(page: Page, name: string) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, base64 }) => {
      const transfer = new DataTransfer();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      transfer.items.add(new File([bytes], name, { type: "application/pdf" }));
      return transfer;
    },
    { name, base64: readFileSync(fixture(name)).toString("base64") },
  );
  await page.getByRole("region", { name: "Drop a PDF here" }).dispatchEvent("drop", { dataTransfer });
}

/** Opens a fixture from the dashboard and waits for the editor. */
export async function openInEditor(page: Page, name: string) {
  await page.goto("/");
  await pick(page, name);
  await expect(page).toHaveURL("/edit");
}

export function pageImage(page: Page, number: number, total: number) {
  return page.getByRole("img", { name: `Page ${number} of ${total}` });
}

// Records every value the zoom button shows, including ones that last a single frame.
export async function recordZoomLabels(page: Page) {
  await page.addInitScript(() => {
    const labels: string[] = [];
    Object.assign(window, { zoomLabels: labels });
    new MutationObserver(() => {
      const label = document.querySelector('[aria-label^="Zoom: "]')?.getAttribute("aria-label");
      if (label && labels.at(-1) !== label) {
        labels.push(label);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export function zoomLabels(page: Page) {
  return page.evaluate(() => (window as unknown as { zoomLabels: string[] }).zoomLabels);
}
