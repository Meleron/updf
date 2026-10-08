"use client";

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { SavedDocument } from "@/lib/document-repository";

/**
 * The PDF the user opened, as a file (for export and autosave) and as the document pdf.js has already parsed (for
 * viewing). `saved` is the autosaved document it was restored from; a newly opened file has none.
 */
export type OpenedDocument = { file: File; pdf: PDFDocumentProxy; saved?: SavedDocument };

/** `open(null)` closes the document. `open` is the same function on every render. */
type OpenDocument = { opened: OpenedDocument | null; open: (document: OpenedDocument | null) => void };

const OpenDocumentContext = createContext<OpenDocument>({ opened: null, open: () => {} });

/** Holds the opened PDF. It stays in the browser (autosave too): nothing is uploaded until export. */
export function OpenDocumentProvider({ children }: { children: React.ReactNode }) {
  const [opened, setOpened] = useState<OpenedDocument | null>(null);
  const current = useRef<OpenedDocument | null>(null);

  const open = useCallback((document: OpenedDocument | null) => {
    if (document !== current.current) {
      current.current?.pdf.loadingTask.destroy();
    }
    current.current = document;
    setOpened(document);
  }, []);

  return <OpenDocumentContext value={{ opened, open }}>{children}</OpenDocumentContext>;
}

export function useOpenDocument() {
  return useContext(OpenDocumentContext);
}
