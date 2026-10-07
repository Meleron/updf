"use client";

import { createContext, useContext, useState } from "react";

type OpenDocument = { file: File | null; open: (file: File) => void };

const OpenDocumentContext = createContext<OpenDocument>({ file: null, open: () => {} });

/** Holds the PDF the user opened. It stays in the browser: nothing is uploaded until export. */
export function OpenDocumentProvider({ children }: { children: React.ReactNode }) {
  const [file, open] = useState<File | null>(null);
  return <OpenDocumentContext value={{ file, open }}>{children}</OpenDocumentContext>;
}

export function useOpenDocument() {
  return useContext(OpenDocumentContext);
}
