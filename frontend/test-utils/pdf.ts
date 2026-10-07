import { readFileSync } from "node:fs";
import { join } from "node:path";

// In the browser pdf.js runs in a Web Worker. In tests its worker code runs in the test process instead.
// @ts-expect-error The worker module has no type declarations.
Object.assign(globalThis, { pdfjsWorker: await import("pdfjs-dist/legacy/build/pdf.worker.mjs") });

export const fixtures = join(__dirname, "..", "..", "fixtures", "pdfs");

export function fixture(name: string): File {
  return new File([readFileSync(join(fixtures, name))], name, { type: "application/pdf" });
}
