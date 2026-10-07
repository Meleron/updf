import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdf.js runs its worker code in the test process.
// @ts-expect-error The worker module has no type declarations.
Object.assign(globalThis, { pdfjsWorker: await import("pdfjs-dist/legacy/build/pdf.worker.mjs") });

/** A run of text as a viewer shows it: in points from the top-left of the displayed page, at its baseline. */
export type PdfText = { text: string; x: number; baseline: number; width: number };

/** Reads the text on one page (1-based) of a PDF. Runs that continue one another on a baseline are joined. */
export async function readText(pdf: Buffer, pageNumber: number): Promise<PdfText[]> {
  const task = getDocument({ data: new Uint8Array(pdf) });
  const document = await task.promise;
  try {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    const texts: PdfText[] = [];
    for (const item of items) {
      if (!("str" in item) || item.str === "") {
        continue;
      }
      const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const last = texts.at(-1);
      if (last && Math.abs(last.baseline - baseline) < 0.01 && Math.abs(last.x + last.width - x) < 0.01) {
        last.text += item.str;
        last.width = x + item.width - last.x;
      } else {
        texts.push({ text: item.str, x, baseline, width: item.width });
      }
    }
    return texts;
  } finally {
    await task.destroy();
  }
}
