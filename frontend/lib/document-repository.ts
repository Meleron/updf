import type { EditDocument } from "./edits";

/** The document being edited, as autosave keeps it: its id, the original PDF and its edits. */
export interface SavedDocument {
  id: string;
  file: File;
  edits: EditDocument;
}

/**
 * Where autosave keeps the current document. The browser keeps one document now (IndexedDB); a server-backed
 * implementation can replace it once login exists. Edits are saved only to the document they belong to, so a tab
 * whose document another tab has replaced, or whose file failed to save, saves nothing more.
 */
export interface DocumentRepository {
  /** The saved document, or null if there's none or it's in a format this version doesn't know. */
  load(): Promise<SavedDocument | null>;
  /** Replaces the saved document with a newly opened file, under a new id, and no edits. The file is stored once, here. */
  saveFile(id: string, file: File): Promise<void>;
  /** Saves a document's edits. Fails, saving nothing, if the saved document is another one. */
  saveEdits(id: string, edits: EditDocument): Promise<void>;
}

const store = "document";

/** The file as stored: its bytes, since Safari can't store a File or Blob in a private window. */
type StoredFile = { id: string; name: string; type: string; bytes: ArrayBuffer };

/**
 * Keeps the document in one IndexedDB object store: the file with its id, and the edits, under their own keys.
 * Operations run in the order they're called, so the dashboard loads the edits the closing editor saved just before.
 */
export class IndexedDbRepository implements DocumentRepository {
  private database: Promise<IDBDatabase> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly name = "updf") {}

  load(): Promise<SavedDocument | null> {
    return this.run(async () => {
      const transaction = (await this.open()).transaction(store);
      const [saved, edits] = await Promise.all([
        request<StoredFile | undefined>(transaction.objectStore(store).get("file")),
        request<EditDocument | undefined>(transaction.objectStore(store).get("edits")),
      ]);
      // A file saved before it was stored as bytes has none.
      return saved?.bytes && edits?.version === 1 ? { id: saved.id, file: new File([saved.bytes], saved.name, { type: saved.type }), edits } : null;
    });
  }

  saveFile(id: string, file: File): Promise<void> {
    return this.run(async () => {
      const stored: StoredFile = { id, name: file.name, type: file.type, bytes: await file.arrayBuffer() };
      await this.write((objects) => {
        objects.put(stored, "file");
        objects.put({ version: 1, edits: [] } satisfies EditDocument, "edits");
      });
    });
  }

  saveEdits(id: string, edits: EditDocument): Promise<void> {
    return this.run(() =>
      this.write((objects) => {
        const reading = objects.get("file");
        reading.onsuccess = () => {
          if (reading.result?.id === id) {
            objects.put(edits, "edits");
          } else {
            objects.transaction.abort();
          }
        };
      }),
    );
  }

  /** Runs an operation once the ones called before it have finished, whether they succeeded or not. */
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => {});
    return result;
  }

  private async write(change: (objects: IDBObjectStore) => void): Promise<void> {
    const transaction = (await this.open()).transaction(store, "readwrite");
    change(transaction.objectStore(store));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error("The saved document is another one."));
    });
  }

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const opening = indexedDB.open(this.name, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore(store);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    return this.database;
  }
}

function request<T>(request: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export const documentRepository: DocumentRepository = new IndexedDbRepository();
