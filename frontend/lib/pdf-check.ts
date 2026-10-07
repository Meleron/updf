import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadPdfJs } from "./pdfjs";

export const maxFileBytes = 25 * 1024 * 1024;
export const maxPages = 100;

/** The backend's error codes for the same checks, so one set of messages covers both. */
export type UploadError =
  | "not-a-pdf"
  | "file-too-large"
  | "pdf-encrypted"
  | "pdf-too-many-pages"
  | "pdf-unreadable"
  | "unexpected";

export type CheckResult = { document: PDFDocumentProxy } | { error: UploadError };

/**
 * Repeats the backend's upload checks in the browser, in the same order. A file that can be edited comes back open,
 * so the editor doesn't parse it again. pdf.js repairs some damaged files that the backend rejects; those fail later,
 * at export.
 */
export async function checkPdf(file: File): Promise<CheckResult> {
  if (file.size > maxFileBytes) {
    return { error: "file-too-large" };
  }
  let task: { destroy(): Promise<void> } | undefined;
  try {
    const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (signature !== "%PDF-") {
      return { error: "not-a-pdf" };
    }
    const { getDocument } = await loadPdfJs();
    const loading = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    task = loading;
    const document = await loading.promise;
    // pdf.js opens owner-password-only files without asking, but the backend can't modify any encrypted file.
    const { info } = await document.getMetadata();
    const encrypted = Boolean((info as { EncryptFilterName?: string | null }).EncryptFilterName);
    const error = encrypted ? "pdf-encrypted" : document.numPages > maxPages ? "pdf-too-many-pages" : null;
    if (!error) {
      return { document };
    }
    await task.destroy();
    return { error };
  } catch (error) {
    await task?.destroy();
    // Only problems with the file itself get a file message. Anything else, such as a file that can't be read or
    // pdf.js failing to load, is unexpected.
    const name = (error as Error).name;
    return {
      error: name === "PasswordException" ? "pdf-encrypted" : name === "InvalidPDFException" ? "pdf-unreadable" : "unexpected",
    };
  }
}
