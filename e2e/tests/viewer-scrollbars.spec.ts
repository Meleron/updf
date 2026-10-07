import { expect, test } from "@playwright/test";
import { openInEditor, pageImage, recordZoomLabels, zoomLabels } from "./helpers";

// Headless Chromium hides scrollbars by default. A page just taller than the view at fit width brings a scrollbar.
test.use({
  locale: "en-US",
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
  viewport: { width: 1280, height: 1586 },
});

test("fit width settles instead of flipping as the scrollbar comes and goes", async ({ page }) => {
  await recordZoomLabels(page);

  await openInEditor(page, "simple.pdf");
  await expect(pageImage(page, 1, 1)).toHaveAttribute("aria-busy", "false");
  await expect(pageImage(page, 1, 1).locator("canvas")).toHaveCount(1);

  expect(await zoomLabels(page)).toHaveLength(1);
});
