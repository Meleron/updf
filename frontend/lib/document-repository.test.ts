import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { IndexedDbRepository } from "./document-repository";
import type { EditDocument } from "./edits";

const pdf = (name: string) => new File(["%PDF-1.7"], name, { type: "application/pdf" });
const edits: EditDocument = {
  version: 1,
  edits: [
    {
      id: "a",
      page: 0,
      x: 72,
      y: 72,
      lines: ["Zażółć"],
      style: { font: "Noto Sans", size: 12, bold: false, italic: false, underline: false, color: "#000000", align: "left" },
    },
  ],
};

// Each test has its own database.
let databases = 0;
const repository = () => new IndexedDbRepository(`test-${++databases}`);

describe("IndexedDbRepository", () => {
  it("has no document until one is saved", async () => {
    expect(await repository().load()).toBeNull();
  });

  it("keeps the file and the edits saved after it", async () => {
    const documents = repository();
    await documents.saveFile("a", pdf("report.pdf"));
    expect((await documents.load())?.edits).toEqual({ version: 1, edits: [] });

    await documents.saveEdits("a", edits);

    const saved = await documents.load();
    expect(saved?.id).toBe("a");
    expect(saved?.file.name).toBe("report.pdf");
    expect(await saved?.file.text()).toBe("%PDF-1.7");
    expect(saved?.file.type).toBe("application/pdf");
    expect(saved?.edits).toEqual(edits);
  });

  it("replaces the document and its edits when another file is saved", async () => {
    const documents = repository();
    await documents.saveFile("a", pdf("first.pdf"));
    await documents.saveEdits("a", edits);

    await documents.saveFile("b", pdf("second.pdf"));

    const saved = await documents.load();
    expect(saved?.file.name).toBe("second.pdf");
    expect(saved?.edits.edits).toEqual([]);
  });

  it("runs operations in the order they're called, so a load sees a save called just before", async () => {
    const documents = repository();
    void documents.saveFile("a", pdf("report.pdf"));
    void documents.saveEdits("a", edits);

    expect((await documents.load())?.edits).toEqual(edits);
  });

  it("saves no edits to another document, as when a second tab opened one", async () => {
    const documents = repository();
    await documents.saveFile("a", pdf("first.pdf"));
    await documents.saveFile("b", pdf("second.pdf"));

    await expect(documents.saveEdits("a", edits)).rejects.toThrow();

    const saved = await documents.load();
    expect(saved?.file.name).toBe("second.pdf");
    expect(saved?.edits.edits).toEqual([]);
  });

  it("saves no edits after their file failed to save, so they never go with another file", async () => {
    const documents = repository();
    await documents.saveFile("a", pdf("first.pdf"));
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });

    await expect(documents.saveFile("b", pdf("second.pdf"))).rejects.toThrow("quota");
    await expect(documents.saveEdits("b", edits)).rejects.toThrow();

    const saved = await documents.load();
    expect(saved?.file.name).toBe("first.pdf");
    expect(saved?.edits.edits).toEqual([]);
  });

  it("ignores edits in a format it doesn't know", async () => {
    const documents = repository();
    await documents.saveFile("a", pdf("report.pdf"));
    await documents.saveEdits("a", { ...edits, version: 2 } as unknown as EditDocument);

    expect(await documents.load()).toBeNull();
  });

  it("ignores a file saved before files were stored as bytes", async () => {
    const name = `test-${++databases}`;
    await new IndexedDbRepository(name).saveFile("a", pdf("report.pdf"));
    const database = await new Promise<IDBDatabase>((resolve) => {
      indexedDB.open(name, 1).onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    });
    await new Promise((resolve) => {
      const transaction = database.transaction("document", "readwrite");
      transaction.objectStore("document").put({ id: "a", file: pdf("report.pdf") }, "file");
      transaction.oncomplete = resolve;
    });
    database.close();

    expect(await new IndexedDbRepository(name).load()).toBeNull();
  });
});
