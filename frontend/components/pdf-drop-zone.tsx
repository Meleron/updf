"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useOpenDocument } from "@/components/open-document";
import { Button } from "@/components/ui/button";
import { checkPdf, type UploadError } from "@/lib/pdf-check";
import { cn } from "@/lib/utils";

/** Takes a PDF by drop or file picker, checks it in the browser and opens it in the editor. */
export function PdfDropZone() {
  const t = useTranslations("Upload");
  const errors = useTranslations("Errors");
  const router = useRouter();
  const { open } = useOpenDocument();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  async function accept(file: File | undefined) {
    if (!file || checking) {
      return;
    }
    setError(null);
    setChecking(true);
    const result = await checkPdf(file);
    if ("error" in result) {
      setError(result.error);
      setChecking(false);
      return;
    }
    open({ file, pdf: result.document });
    router.push("/edit");
  }

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-labelledby="drop-zone-title"
        className={cn(
          "flex flex-col items-center gap-4 rounded-xl border border-dashed bg-surface px-6 py-12 text-center transition-colors",
          dragging && "border-accent bg-accent-subtle",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-surface-muted">
          <FileUp className="size-6 text-text-secondary" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="drop-zone-title" className="text-base font-medium">
            {t("title")}
          </h2>
          <p className="text-sm text-text-secondary">{t("hint")}</p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={checking}>
          {checking && <Loader2 className="animate-spin" aria-hidden />}
          {checking ? t("checking") : t("choose")}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </section>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {errors(error)}
        </p>
      )}
    </div>
  );
}
