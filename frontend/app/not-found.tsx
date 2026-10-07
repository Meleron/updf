import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="text-base text-text-secondary">{t("description")}</p>
        <Link href="/" className="self-start rounded-md text-sm font-medium text-accent hover:underline">
          {t("home")}
        </Link>
      </main>
    </>
  );
}
