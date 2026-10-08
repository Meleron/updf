import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, attachmentName, exportErrorCode, exportPdf } from "./api";
import en from "@/messages/en.json";
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
    const fetch = respond(new Response("%PDF-edited", { status: 200, headers: { "Content-Disposition": 'attachment; filename="report-edited.pdf"' } }));

    const { pdf, fileName } = await exportPdf("http://backend.example:8080", file, edits);

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("http://backend.example:8080/api/pdf/export");
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(JSON.parse((init.body as FormData).get("edits") as string)).toEqual(edits);
    expect(await pdf.text()).toBe("%PDF-edited");
    expect(fileName).toBe("report-edited.pdf");
  });

  it.each([
    ["http://backend.example:8080/", "http://backend.example:8080/api/pdf/export"],
    ["https://gateway.example/updf", "https://gateway.example/updf/api/pdf/export"],
    ["https://gateway.example/updf/", "https://gateway.example/updf/api/pdf/export"],
  ])("keeps the path of the backend URL %s", async (backendUrl, url) => {
    const fetch = respond(new Response("%PDF-edited", { status: 200 }));

    await exportPdf(backendUrl, file, edits);

    expect(String(fetch.mock.calls[0][0])).toBe(url);
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

describe("attachmentName", () => {
  it.each([
    ['attachment; filename="report-edited.pdf"', "report-edited.pdf"],
    ["attachment; filename=report-edited.pdf", "report-edited.pdf"],
    // As ASP.NET Core sends a non-ASCII name: an ASCII fallback, and the UTF-8 name, which wins.
    [
      "attachment; filename=\"Raport _ za__.pdf\"; filename*=UTF-8''Raport%20%E2%80%93%20za%C5%BC%C3%B3%C5%82%C4%87-edited.pdf",
      "Raport – zażółć-edited.pdf",
    ],
    [null, "report-edited.pdf"],
  ])("reads %s", (header, name) => {
    expect(attachmentName(header, "report.pdf")).toBe(name);
  });
});

describe("exportErrorCode", () => {
  it("has a message for every code the backend sends", () => {
    for (const code of Object.keys(en.ExportErrors)) {
      expect(exportErrorCode(new ApiError(400, code))).toBe(code);
    }
  });

  it("uses the generic message for unknown codes and network errors", () => {
    expect(exportErrorCode(new ApiError(502, "bad-gateway"))).toBe("unexpected");
    expect(exportErrorCode(new TypeError("Failed to fetch"))).toBe("unexpected");
  });
});
