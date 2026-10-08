import { expect, test, type Page } from "@playwright/test";
import { openInEditor, pageImage } from "./helpers";

test.use({ locale: "en-US" });
test.skip(({ isMobile }) => isMobile, "Phones have no wheel: they zoom with the zoom menu and a pinch.");

function zoomButton(page: Page) {
  return page.getByRole("button", { name: /^Zoom: \d+%$/ });
}

async function zoomPercent(page: Page) {
  return Number((await zoomButton(page).textContent())!.replace("%", ""));
}

async function ctrlWheel(page: Page, deltaY: number) {
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up("Control");
}

test("Ctrl+wheel zooms the pages, not the browser, around the pointer", async ({ page }) => {
  await openInEditor(page, "pages-100.pdf");
  await expect(pageImage(page, 1, 100)).toHaveAttribute("aria-busy", "false");
  const before = await zoomPercent(page);
  const browserZoom = await page.evaluate(() => [window.devicePixelRatio, window.innerWidth]);
  // Runs after the editor's own listener, which was added first.
  await page.evaluate(() => window.addEventListener("wheel", (event) => ((window as unknown as { prevented: boolean }).prevented = event.defaultPrevented)));

  // A point on the first page, left of the middle, so both scroll directions are needed to keep it in place.
  const box = (await pageImage(page, 1, 100).boundingBox())!;
  const pointer = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
  const onPage = { x: (pointer.x - box.x) / box.width, y: (pointer.y - box.y) / box.height };
  await page.mouse.move(pointer.x, pointer.y);

  await ctrlWheel(page, -100);

  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(before);
  expect(await page.evaluate(() => (window as unknown as { prevented: boolean }).prevented)).toBe(true);
  expect(await page.evaluate(() => [window.devicePixelRatio, window.innerWidth])).toEqual(browserZoom);
  const zoomed = (await pageImage(page, 1, 100).boundingBox())!;
  expect(zoomed.width).toBeGreaterThan(box.width);
  expect(Math.abs(zoomed.x + onPage.x * zoomed.width - pointer.x)).toBeLessThan(2);
  expect(Math.abs(zoomed.y + onPage.y * zoomed.height - pointer.y)).toBeLessThan(2);

  await ctrlWheel(page, 100);
  await expect.poll(() => zoomPercent(page)).toBe(before);
});

test("Ctrl+wheel stays within 50% to 200%, and the wheel alone scrolls", async ({ page }) => {
  await openInEditor(page, "pages-100.pdf");
  const box = (await pageImage(page, 1, 100).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);

  for (let i = 0; i < 6; i++) {
    await ctrlWheel(page, -200);
  }
  await expect(zoomButton(page)).toHaveText("200%");

  for (let i = 0; i < 8; i++) {
    await ctrlWheel(page, 200);
  }
  await expect(zoomButton(page)).toHaveText("50%");

  await page.mouse.wheel(0, 300);
  await expect.poll(() => page.getByTestId("pages").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(zoomButton(page)).toHaveText("50%");
});
