import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { checkPdf, maxFileBytes } from "./pdf-check";

// In the browser pdf.js runs in a Web Worker. Here its worker code runs in the test process instead.
// @ts-expect-error The worker module has no type declarations.
Object.assign(globalThis, { pdfjsWorker: await import("pdfjs-dist/legacy/build/pdf.worker.mjs") });

const fixtures = join(__dirname, "..", "..", "fixtures", "pdfs");

function fixture(name: string): File {
  return new File([readFileSync(join(fixtures, name))], name, { type: "application/pdf" });
}

// The same fixtures and results as the backend's PdfValidatorTests, so the browser and the server agree.
it.each(["simple.pdf", "pages-100.pdf", "polish.pdf", "coloured-background.pdf", "scanned.pdf", "rotated.pdf", "cropped.pdf", "form.pdf"])(
  "accepts %s",
  async (name) => {
    expect(await checkPdf(fixture(name))).toBeNull();
  },
);

it.each([
  ["not-a-pdf.pdf", "not-a-pdf"],
  ["pages-101.pdf", "pdf-too-many-pages"],
  ["password.pdf", "pdf-encrypted"],
  ["owner-password.pdf", "pdf-encrypted"],
  ["damaged.pdf", "pdf-unreadable"],
])("rejects %s as %s", async (name, error) => {
  expect(await checkPdf(fixture(name))).toBe(error);
});

it("rejects an empty file as not a PDF", async () => {
  expect(await checkPdf(new File([], "empty.pdf"))).toBe("not-a-pdf");
});

it("accepts a PDF of exactly 25 MB", async () => {
  const pdf = readFileSync(join(fixtures, "simple.pdf"));
  const file = new File([pdf, new Uint8Array(maxFileBytes - pdf.length).fill(0x20)], "limit.pdf");

  expect(file.size).toBe(25 * 1024 * 1024);
  expect(await checkPdf(file)).toBeNull();
});

it("rejects a file over 25 MB without reading it", async () => {
  const file = new File(["%PDF-", new Uint8Array(maxFileBytes)], "big.pdf");
  const slice = vi.spyOn(file, "slice");
  const arrayBuffer = vi.spyOn(file, "arrayBuffer");

  expect(await checkPdf(file)).toBe("file-too-large");
  expect(slice).not.toHaveBeenCalled();
  expect(arrayBuffer).not.toHaveBeenCalled();
});

it("reports an unexpected error when the file can't be read", async () => {
  const file = fixture("simple.pdf");
  vi.spyOn(file, "arrayBuffer").mockRejectedValue(new DOMException("The file changed on disk.", "NotReadableError"));

  expect(await checkPdf(file)).toBe("unexpected");
});

it("reports an unexpected error when pdf.js fails to load", async () => {
  vi.resetModules();
  vi.doMock("./pdfjs", () => ({ loadPdfJs: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")) }));
  const { checkPdf } = await import("./pdf-check");

  expect(await checkPdf(fixture("simple.pdf"))).toBe("unexpected");
  vi.doUnmock("./pdfjs");
});
