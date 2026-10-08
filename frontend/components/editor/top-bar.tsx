"use client";

import { Download, Loader2, MousePointer2, PanelLeft, Redo2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ToggleButton } from "@/components/editor/toggle-button";
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
import type { Tool } from "@/lib/editor-state";
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
  tool: Tool;
  onTool: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  downloading: boolean;
  onDownload: () => void;
};

function Separator() {
  return <div aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />;
}

export function TopBar(props: Props) {
  const { fileName, zoom, zoomSetting, onZoom, thumbnailsOpen, onToggleThumbnails, tool, onTool, canUndo, canRedo, onUndo, onRedo, downloading, onDownload } =
    props;
  const t = useTranslations("Editor");
  const app = useTranslations("App");
  const percent = zoom === null ? null : `${Math.round(zoom * 100)}%`;
  // The editor renders only in the browser.
  const [undoKeys, redoKeys] = /Mac|iPhone|iPad/.test(navigator.userAgent) ? ["⌘Z", "⇧⌘Z"] : ["Ctrl+Z", "Ctrl+Shift+Z"];

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
      {/* Phones have no room for the name. */}
      <h1 className="sr-only min-w-0 flex-1 truncate text-sm font-medium sm:not-sr-only" title={fileName}>
        {fileName}
      </h1>
      <div className="ml-auto flex items-center gap-1">
        <div role="group" aria-label={t("tools")} className="flex items-center gap-1">
          {/* Small screens have no room for Select, so there Add text switches back to it when pressed again. */}
          <ToggleButton
            label={t("selectTool")}
            pressed={tool === "select"}
            onClick={() => onTool("select")}
            className="hidden sm:inline-flex"
          >
            <MousePointer2 />
          </ToggleButton>
          <ToggleButton
            label={t("addText")}
            shortcut="T"
            pressed={tool === "text"}
            onClick={() => onTool(tool === "text" ? "select" : "text")}
          >
            <Type />
          </ToggleButton>
        </div>
        <Separator />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("undo")}
          aria-keyshortcuts="Control+Z Meta+Z"
          title={`${t("undo")} (${undoKeys})`}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("redo")}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          title={`${t("redo")} (${redoKeys})`}
          disabled={!canRedo}
          onClick={onRedo}
        >
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
        {/* Not disabled while downloading, so it keeps the focus; the editor ignores clicks until the download is done. */}
        <Button className="ml-1" aria-disabled={downloading} onClick={onDownload}>
          {downloading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          <span className="sr-only sm:not-sr-only">{downloading ? t("downloading") : t("download")}</span>
        </Button>
      </div>
    </header>
  );
}
