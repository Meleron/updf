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

/** Sends the original PDF and the edits to the backend and returns the edited PDF. */
export async function exportPdf(backendUrl: string, file: File, edits: EditDocument, signal?: AbortSignal): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);
  form.append("edits", JSON.stringify(edits));

  const response = await fetch(new URL("/api/pdf/export", backendUrl), { method: "POST", body: form, signal });
  if (!response.ok) {
    const problem: { code?: string } | null = await response.json().catch(() => null);
    throw new ApiError(response.status, problem?.code ?? "unexpected");
  }
  return response.blob();
}
