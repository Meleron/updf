import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { fixture, fixtures } from "@/test-utils/pdf";
import { checkPdf, maxFileBytes, type CheckResult } from "./pdf-check";

async function errorOf(file: File) {
  const result = await checkPdf(file);
  await keep(result)?.loadingTask.destroy();
  return "error" in result ? result.error : null;
}

function keep(result: CheckResult) {
  return "document" in result ? result.document : undefined;
}

// The same fixtures and results as the backend's PdfValidatorTests, so the browser and the server agree.
it.each(["simple.pdf", "pages-100.pdf", "polish.pdf", "coloured-background.pdf", "scanned.pdf", "rotated.pdf", "cropped.pdf", "form.pdf"])(
  "accepts %s",
  async (name) => {
    expect(await errorOf(fixture(name))).toBeNull();
  },
);

it.each([
  ["not-a-pdf.pdf", "not-a-pdf"],
  ["pages-101.pdf", "pdf-too-many-pages"],
  ["password.pdf", "pdf-encrypted"],
  ["owner-password.pdf", "pdf-encrypted"],
  ["damaged.pdf", "pdf-unreadable"],
])("rejects %s as %s", async (name, error) => {
  expect(await errorOf(fixture(name))).toBe(error);
});

it("rejects an empty file as not a PDF", async () => {
  expect(await errorOf(new File([], "empty.pdf"))).toBe("not-a-pdf");
});

it("accepts a PDF of exactly 25 MB", async () => {
  const pdf = readFileSync(join(fixtures, "simple.pdf"));
  const file = new File([pdf, new Uint8Array(maxFileBytes - pdf.length).fill(0x20)], "limit.pdf");

  expect(file.size).toBe(25 * 1024 * 1024);
  expect(await errorOf(file)).toBeNull();
});

it("rejects a file over 25 MB without reading it", async () => {
  const file = new File(["%PDF-", new Uint8Array(maxFileBytes)], "big.pdf");
  const slice = vi.spyOn(file, "slice");
  const arrayBuffer = vi.spyOn(file, "arrayBuffer");

  expect(await errorOf(file)).toBe("file-too-large");
  expect(slice).not.toHaveBeenCalled();
  expect(arrayBuffer).not.toHaveBeenCalled();
});

it("reports an unexpected error when the file can't be read", async () => {
  const file = fixture("simple.pdf");
  vi.spyOn(file, "arrayBuffer").mockRejectedValue(new DOMException("The file changed on disk.", "NotReadableError"));

  expect(await errorOf(file)).toBe("unexpected");
});

it("keeps a valid document open for the editor", async () => {
  const result = await checkPdf(fixture("pages-100.pdf"));

  const document = keep(result);
  expect(document?.numPages).toBe(100);
  await document?.loadingTask.destroy();
});

it("reports an unexpected error when pdf.js fails to load", async () => {
  vi.resetModules();
  vi.doMock("./pdfjs", () => ({ loadPdfJs: () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")) }));
  const { checkPdf } = await import("./pdf-check");

  expect(await checkPdf(fixture("simple.pdf"))).toEqual({ error: "unexpected" });
  vi.doUnmock("./pdfjs");
});
