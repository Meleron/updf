"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { localeCookie, locales } from "@/i18n/locale";

export function LanguageSwitch() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  function choose(value: string) {
    document.cookie = `${localeCookie}=${value}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Languages />
          <span className="sr-only">{t("Header.language")}</span>{" "}
          <span className="sr-only sm:not-sr-only">{locale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={choose}>
          {locales.map((value) => (
            <DropdownMenuRadioItem key={value} value={value} lang={value}>
              {t(`Languages.${value}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
