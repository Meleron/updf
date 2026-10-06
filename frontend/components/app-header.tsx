import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { ThemeToggle } from "@/components/theme-toggle";

export async function AppHeader() {
  const t = await getTranslations("App");

  return (
    <header className="flex h-14 items-center justify-between border-b bg-surface px-4 sm:px-6">
      <Link href="/" className="rounded-md text-base font-semibold tracking-tight">
        {t("name")}
      </Link>
      <div className="flex items-center gap-1">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
    </header>
  );
}
