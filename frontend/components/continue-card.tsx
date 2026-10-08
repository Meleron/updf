"use client";

import { ArrowRight, FileText, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOpenDocument } from "@/components/open-document";
import type { SavedDocument } from "@/lib/document-repository";
import { checkPdf, type UploadError } from "@/lib/pdf-check";

/** Restores the autosaved document and its edits in the editor. */
export function ContinueCard({ saved }: { saved: SavedDocument }) {
  const t = useTranslations("Continue");
  const errors = useTranslations("Errors");
  const router = useRouter();
  const { open } = useOpenDocument();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  async function restore() {
    if (opening) {
      return;
    }
    setOpening(true);
    setError(null);
    const result = await checkPdf(saved.file);
    if ("error" in result) {
      setError(result.error);
      setOpening(false);
      return;
    }
    open({ file: saved.file, pdf: result.document, saved });
    router.push("/edit");
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={restore}
        aria-busy={opening}
        className="group flex items-center gap-4 rounded-xl border bg-surface p-4 text-left outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle">
          <FileText aria-hidden className="size-5 text-accent" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium">{t("title", { name: saved.file.name })}</span>
          <span className="text-xs text-text-secondary">{t("edits", { count: saved.edits.edits.length })}</span>
        </span>
        {opening ? (
          <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-text-secondary" />
        ) : (
          <ArrowRight aria-hidden className="size-4 shrink-0 text-text-secondary transition-transform duration-150 group-hover:translate-x-1" />
        )}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {errors(error)}
        </p>
      )}
    </div>
  );
}
