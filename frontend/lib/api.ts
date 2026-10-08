import type messages from "@/messages/en.json";
import type { EditDocument } from "./edits";

/** A failed API call with the backend's stable error code, which the interface translates. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Sends the original PDF and the edits to the backend and returns the edited PDF with its download name. */
export async function exportPdf(backendUrl: string, file: File, edits: EditDocument, signal?: AbortSignal): Promise<{ pdf: Blob; fileName: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("edits", JSON.stringify(edits));

  const response = await fetch(`${backendUrl.replace(/\/$/, "")}/api/pdf/export`, { method: "POST", body: form, signal });
  if (!response.ok) {
    const problem: { code?: string } | null = await response.json().catch(() => null);
    throw new ApiError(response.status, problem?.code ?? "unexpected");
  }
  return { pdf: await response.blob(), fileName: attachmentName(response.headers.get("Content-Disposition"), file.name) };
}

/**
 * The file name in a `Content-Disposition` header: `filename*` (UTF-8, for non-ASCII names) if present, else `filename`.
 * Without either, the backend's name for the original file.
 */
export function attachmentName(header: string | null, original: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (encoded) {
    return decodeURIComponent(encoded[1]);
  }
  const plain = header?.match(/filename=(?:"([^"]*)"|([^;\s]+))/i);
  return plain?.[1] ?? plain?.[2] ?? `${original.replace(/\.pdf$/i, "")}-edited.pdf`;
}

export type ExportErrorCode = keyof typeof messages.ExportErrors;

/** Every code with a message; the type makes it list each one. */
const exportErrorCodes: Record<ExportErrorCode, true> = {
  "invalid-edits": true,
  "unsupported-characters": true,
  "file-too-large": true,
  "not-a-pdf": true,
  "pdf-encrypted": true,
  "pdf-too-many-pages": true,
  "pdf-unreadable": true,
  "rate-limited": true,
  "processing-timeout": true,
  unexpected: true,
};

/** The message for a failed export: the backend's code, or the generic one for network errors and unknown codes. */
export function exportErrorCode(error: unknown): ExportErrorCode {
  return error instanceof ApiError && Object.hasOwn(exportErrorCodes, error.code) ? (error.code as ExportErrorCode) : "unexpected";
}
