import AxeBuilder from "@axe-core/playwright";
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

/** Opens the thumbnail panel, which starts closed on small screens. */
export async function showThumbnails(page: Page) {
  const toggle = page.getByRole("button", { name: "Page thumbnails" });
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
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

/** Checks a page, or only the open dialog: the page behind it is inert and dimmed. */
export async function expectNoAxeViolations(page: Page, only?: string) {
  // Mid-animation colours are partly transparent, so contrast is measured once running ones end (a spinner never does).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  const results = await (only ? new AxeBuilder({ page }).include(only) : new AxeBuilder({ page })).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`)).toEqual([]);
}
