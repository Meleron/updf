"use client";

import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createContext, useContext, useState } from "react";

/** The PDF the user opened, as a file (for export) and as the document pdf.js has already parsed (for viewing). */
export type OpenedDocument = { file: File; pdf: PDFDocumentProxy };

type OpenDocument = { opened: OpenedDocument | null; open: (document: OpenedDocument) => void };

const OpenDocumentContext = createContext<OpenDocument>({ opened: null, open: () => {} });

/** Holds the opened PDF. It stays in the browser: nothing is uploaded until export. */
export function OpenDocumentProvider({ children }: { children: React.ReactNode }) {
  const [opened, setOpened] = useState<OpenedDocument | null>(null);

  function open(document: OpenedDocument) {
    opened?.pdf.loadingTask.destroy();
    setOpened(document);
  }

  return <OpenDocumentContext value={{ opened, open }}>{children}</OpenDocumentContext>;
}

export function useOpenDocument() {
  return useContext(OpenDocumentContext);
}
