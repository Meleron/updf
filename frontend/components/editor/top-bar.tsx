"use client";

import { Download, PanelLeft, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { maxZoom, minZoom, zoomIn, zoomOut, zoomSteps } from "@/lib/zoom";

export type ZoomSetting = number | "fit";

type Props = {
  fileName: string;
  /** Null until the available width is known. */
  zoom: number | null;
  zoomSetting: ZoomSetting;
  onZoom: (setting: ZoomSetting) => void;
  thumbnailsOpen: boolean;
  onToggleThumbnails: () => void;
};

function Separator() {
  return <div aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />;
}

/** Undo, redo and Download stay disabled until their features exist. */
export function TopBar({ fileName, zoom, zoomSetting, onZoom, thumbnailsOpen, onToggleThumbnails }: Props) {
  const t = useTranslations("Editor");
  const app = useTranslations("App");
  const percent = zoom === null ? null : `${Math.round(zoom * 100)}%`;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("thumbnails")}
        aria-expanded={thumbnailsOpen}
        aria-controls="thumbnails"
        onClick={onToggleThumbnails}
      >
        <PanelLeft />
      </Button>
      <Link href="/" className="hidden rounded-md text-base font-semibold tracking-tight sm:block">
        {app("name")}
      </Link>
      <Separator />
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={fileName}>
        {fileName}
      </h1>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" disabled aria-label={t("undo")}>
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon" disabled aria-label={t("redo")}>
          <Redo2 />
        </Button>
        <Separator />
        {zoom !== null && percent !== null && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              aria-label={t("zoomOut")}
              disabled={zoom <= minZoom}
              onClick={() => onZoom(zoomOut(zoom))}
            >
              <ZoomOut />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="w-14 tabular-nums" aria-label={t("zoomLevel", { percent })}>
                  {percent}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={String(zoomSetting)}
                  onValueChange={(value) => onZoom(value === "fit" ? "fit" : Number(value))}
                >
                  <DropdownMenuRadioItem value="fit">{t("fitWidth")}</DropdownMenuRadioItem>
                  {zoomSteps.map((step) => (
                    <DropdownMenuRadioItem key={step} value={String(step)}>
                      {step * 100}%
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              aria-label={t("zoomIn")}
              disabled={zoom >= maxZoom}
              onClick={() => onZoom(zoomIn(zoom))}
            >
              <ZoomIn />
            </Button>
          </>
        )}
        <Separator />
        <LanguageSwitch />
        <ThemeToggle />
        <Button disabled className="ml-1">
          <Download />
          <span className="sr-only sm:not-sr-only">{t("download")}</span>
        </Button>
      </div>
    </header>
  );
}
