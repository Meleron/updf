"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Slower than other animations (150-200ms), so the switch can be seen; an agreed exception in CLAUDE.md. */
const fadeMilliseconds = 500;

export function ThemeToggle() {
  const t = useTranslations("Header");
  const { resolvedTheme, setTheme } = useTheme();

  /** Fades the colours to the new theme. */
  function toggle() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTheme(next);
      return;
    }
    // next-themes turns transitions off while it applies a theme, so apply it here and tell next-themes, which saves
    // the choice, when the fade is over.
    const root = document.documentElement;
    root.classList.add("theme-fade");
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    setTimeout(() => {
      root.classList.remove("theme-fade");
      setTheme(next);
    }, fadeMilliseconds);
  }

  return (
    <Button variant="ghost" size="icon" aria-label={t("toggleTheme")} onClick={toggle}>
      {/* Both icons render, and CSS picks one, so the server and client markup match before the theme is known. */}
      <Moon className="dark:hidden" />
      <Sun className="hidden dark:block" />
    </Button>
  );
}
