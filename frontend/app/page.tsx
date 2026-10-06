import { getTranslations } from "next-intl/server";

export default async function Home() {
  const t = await getTranslations("Home");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
      <p className="text-base text-text-secondary">{t("description")}</p>
    </main>
  );
}
