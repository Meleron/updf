"use client";

import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Italic, Trash2, Underline } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { editUi, leavesEdit } from "@/components/editor/edit-focus";
import { ToggleButton } from "@/components/editor/toggle-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TextStyle } from "@/lib/edits";
import { boxFonts } from "@/lib/fonts";
import { maxSize, minSize, palette } from "@/lib/formatting";

type Props = {
  style: TextStyle;
  /** A replacement keeps the font of the text it replaces. */
  fontLocked: boolean;
  onStyle: (style: Partial<TextStyle>) => void;
  /** Puts the focus back in the text box, so typing goes on. */
  onReturn: () => void;
  /** Focus has gone elsewhere. */
  onDeselect: () => void;
  /** Esc: move the focus away. */
  onLeave: () => void;
  onDelete: () => void;
};

const alignments = [
  ["left", AlignLeft],
  ["center", AlignCenter],
  ["right", AlignRight],
] as const;

function Separator() {
  return <div aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

/**
 * Formats the selected text box. The bar, its menus and the text box form one selection: focus moves between them
 * freely, and the box is deselected when it goes anywhere else or on Esc.
 */
export function FormattingBar({ style, fontLocked, onStyle, onReturn, onDeselect, onLeave, onDelete }: Props) {
  const t = useTranslations("Formatting");
  const customColor = useRef<HTMLInputElement>(null);
  const pickingCustomColor = useRef(false);
  const preset = palette.find((entry) => entry.color === style.color);
  const colorName = preset ? t(`colors.${preset.name}`) : t("customColorValue", { value: style.color });
  const font = (Object.keys(boxFonts) as (keyof typeof boxFonts)[]).find((key) => boxFonts[key] === style.font) ?? "sans";

  // A menu returns the focus to the text box when it closes, or to the colour picker when that was chosen.
  function menuClosed(event: Event) {
    event.preventDefault();
    if (pickingCustomColor.current) {
      pickingCustomColor.current = false;
      customColor.current!.focus();
      customColor.current!.showPicker();
    } else {
      onReturn();
    }
  }

  return (
    <div
      {...editUi}
      role="toolbar"
      aria-label={t("label")}
      // Clicking a button keeps the focus in the text box, so typing goes on. The size field still takes the focus.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault();
        }
      }}
      onBlur={(event) => leavesEdit(event.relatedTarget) && onDeselect()}
      // Open menus handle Esc themselves, and mark it handled.
      onKeyDown={(event) => event.key === "Escape" && !event.defaultPrevented && onLeave()}
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-surface p-1 shadow-lg"
    >
      {!fontLocked && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0" aria-label={t("font", { font: t(`fonts.${font}`) })}>
              {t(`fonts.${font}`)}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent {...editUi} align="start" className="w-auto" onCloseAutoFocus={menuClosed}>
            <DropdownMenuRadioGroup value={style.font} onValueChange={(value) => onStyle({ font: value })}>
              {Object.entries(boxFonts).map(([key, family]) => (
                <DropdownMenuRadioItem key={key} value={family} style={{ fontFamily: `"${family}"` }}>
                  {t(`fonts.${key as keyof typeof boxFonts}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <SizeField size={style.size} onSize={(size) => onStyle({ size })} onDone={onReturn} label={t("size")} />
      <Separator />
      <ToggleButton label={t("bold")} pressed={style.bold} onClick={() => onStyle({ bold: !style.bold })}>
        <Bold />
      </ToggleButton>
      <ToggleButton label={t("italic")} pressed={style.italic} onClick={() => onStyle({ italic: !style.italic })}>
        <Italic />
      </ToggleButton>
      <ToggleButton label={t("underline")} pressed={style.underline} onClick={() => onStyle({ underline: !style.underline })}>
        <Underline />
      </ToggleButton>
      <Separator />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={t("color", { color: colorName })}>
            <span className="size-4 rounded-full ring-1 ring-border" style={{ backgroundColor: style.color }} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent {...editUi} align="start" className="w-auto" onCloseAutoFocus={menuClosed}>
          <DropdownMenuRadioGroup value={style.color} onValueChange={(color) => onStyle({ color })}>
            {palette.map(({ name, color }) => (
              <DropdownMenuRadioItem key={name} value={color}>
                <span className="size-4 rounded-full ring-1 ring-border" style={{ backgroundColor: color }} />
                {t(`colors.${name}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => (pickingCustomColor.current = true)}>{t("customColor")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={customColor}
        type="color"
        tabIndex={-1}
        aria-label={t("customColor")}
        value={style.color.toLowerCase()}
        onChange={(event) => onStyle({ color: event.target.value.toUpperCase() })}
        className="sr-only"
      />
      <Separator />
      <div role="group" aria-label={t("alignment")} className="flex items-center gap-1">
        {alignments.map(([align, Icon]) => (
          <ToggleButton key={align} label={t(`align.${align}`)} pressed={style.align === align} onClick={() => onStyle({ align })}>
            <Icon />
          </ToggleButton>
        ))}
      </div>
      <Separator />
      <Button variant="ghost" size="icon" className="shrink-0" aria-label={t("delete")} title={t("delete")} onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

type SizeFieldProps = { size: number; onSize: (size: number) => void; onDone: () => void; label: string };

/** The size in points. Values outside 6-72 aren't applied, and the field shows the box's size again when left. */
function SizeField({ size, onSize, onDone, label }: SizeFieldProps) {
  const [draft, setDraft] = useState(String(size));

  return (
    <label className="flex shrink-0 items-center gap-1 rounded-md px-2 text-sm text-text-secondary focus-within:ring-3 focus-within:ring-ring/50">
      <input
        type="number"
        inputMode="numeric"
        min={minSize}
        max={maxSize}
        step={1}
        aria-label={label}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const value = Math.round(Number(event.target.value));
          if (event.target.value !== "" && value >= minSize && value <= maxSize) {
            onSize(value);
          }
        }}
        onBlur={() => setDraft(String(size))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Otherwise the Enter would go on to the text box as a new line.
            event.preventDefault();
            onDone();
          }
        }}
        // The arrow keys change the size, so the arrow buttons are hidden to save room.
        className="h-8 w-6 [appearance:textfield] bg-transparent text-right text-text tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span aria-hidden>pt</span>
    </label>
  );
}
