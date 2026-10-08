"use client";

import { useEffect, useState } from "react";
import { ContinueCard } from "@/components/continue-card";
import { useOpenDocument } from "@/components/open-document";
import { PdfDropZone } from "@/components/pdf-drop-zone";
import { documentRepository, type SavedDocument } from "@/lib/document-repository";

/** Opens a PDF: the autosaved one, if there is one, or a new file. */
export function Dashboard() {
  const [saved, setSaved] = useState<SavedDocument | null>(null);
  const { open } = useOpenDocument();

  // The editor saved its edits as it closed, so going back to it must not reopen the document as it was opened:
  // a new file would replace the saved edits, and restored edits would overwrite newer ones.
  useEffect(() => open(null), [open]);

  useEffect(() => {
    // Without browser storage (some private windows) there's simply nothing to continue.
    documentRepository.load().then(setSaved, () => {});
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {saved && <ContinueCard saved={saved} />}
      <PdfDropZone />
    </div>
  );
}
