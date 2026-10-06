import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, exportPdf } from "./api";
import type { EditDocument } from "./edits";

const edits: EditDocument = { version: 1, edits: [] };
const file = new File(["%PDF-1.7"], "report.pdf", { type: "application/pdf" });

function respond(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("exportPdf", () => {
  it("posts the file and edits to the configured backend", async () => {
    const fetch = respond(new Response("%PDF-edited", { status: 200 }));

    const pdf = await exportPdf("http://backend.example:8080", file, edits);

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://backend.example:8080/api/pdf/export");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(JSON.parse((init.body as FormData).get("edits") as string)).toEqual(edits);
    expect(await pdf.text()).toBe("%PDF-edited");
  });

  it("throws the backend's error code", async () => {
    respond(Response.json({ status: 422, code: "pdf-encrypted" }, { status: 422 }));

    await expect(exportPdf("http://backend", file, edits)).rejects.toEqual(new ApiError(422, "pdf-encrypted"));
  });

  it("reports an unexpected error when the response has no error code", async () => {
    respond(new Response("Bad gateway", { status: 502 }));

    await expect(exportPdf("http://backend", file, edits)).rejects.toMatchObject({ status: 502, code: "unexpected" });
  });
});
