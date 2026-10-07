/**
 * Loads pdf.js when it is first needed, with its Web Worker. Loading it lazily also keeps it out of server rendering.
 * The legacy build is used because the main one needs JavaScript features that browsers about a year old lack.
 */
export async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}
