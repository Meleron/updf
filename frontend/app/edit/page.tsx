"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOpenDocument } from "@/components/open-document";

/** The editor. For now it only shows which document is open; the page view arrives with F-006. */
export default function Editor() {
  const t = useTranslations("Editor");
  const router = useRouter();
  const { file } = useOpenDocument();

  useEffect(() => {
    if (!file) {
      router.replace("/");
    }
  }, [file, router]);

  if (!file) {
    return null;
  }
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight break-all">{file.name}</h1>
      <p className="text-base text-text-secondary">{t("comingSoon")}</p>
    </main>
  );
}
