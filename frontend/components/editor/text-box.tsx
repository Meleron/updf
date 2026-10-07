"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { editUi, leavesEdit } from "@/components/editor/edit-focus";
import { toPixels } from "@/lib/coordinates";
import type { TextEdit } from "@/lib/edits";
import { cssFontFamilies, notoAscent, notoLineHeight } from "@/lib/fonts";
import { unsupportedCharacters } from "@/lib/formatting";
import { cn } from "@/lib/utils";

type Props = {
  edit: TextEdit;
  zoom: number;
  editing: boolean;
  /** The textarea while editing, so the formatting bar can put the focus back. */
  inputRef: React.Ref<HTMLTextAreaElement>;
  onChange: (lines: string[]) => void;
  onFinish: () => void;
};

/**
 * A text box drawn the way the backend draws it, so the download matches the screen: the same fonts, the fonts' own
 * line spacing, no kerning or ligatures (PDFsharp applies neither), and the top-left corner at the edit's position.
 * While editing, a textarea lies over a hidden copy of the text, which sizes the box.
 *
 * Browsers round the font's metrics when placing the first baseline, which can put it up to two pixels above the
 * PDF's. So the box measures where its first baseline lands and moves by the difference.
 *
 * Characters the PDF fonts can't show get a warning under the box, since the export would refuse them.
 */
export function TextBox({ edit, zoom, editing, inputRef, onChange, onFinish }: Props) {
  const t = useTranslations("Editor");
  const warningId = useId();
  const unsupported = unsupportedCharacters(edit.lines, edit.style);
  const { style } = edit;
  const text = edit.lines.join("\n");
  const fontSize = toPixels(style.size, zoom);
  const baseline = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    let active = true;
    function measure() {
      // The box may be gone by the time the font has loaded.
      if (!active) {
        return;
      }
      const marker = baseline.current!;
      setShift(fontSize * notoAscent - (marker.getBoundingClientRect().top - marker.parentElement!.getBoundingClientRect().top));
    }
    measure();
    // Until the font has loaded, the baseline is the fallback font's.
    document.fonts.ready.then(measure);
    return () => {
      active = false;
    };
  }, [fontSize, style.font, style.bold, style.italic]);

  const font: React.CSSProperties = {
    fontFamily: cssFontFamilies[style.font],
    fontSize,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    // The PDF's underline runs through descenders.
    textDecorationSkipInk: "none",
    color: style.color,
    textAlign: style.align,
    lineHeight: notoLineHeight,
    fontKerning: "none",
    fontVariantLigatures: "none",
    textRendering: "geometricPrecision",
    whiteSpace: "pre",
  };

  return (
    <div
      data-testid="text-box"
      className={cn("absolute min-w-1", editing && "outline-1 outline-offset-2 outline-accent")}
      style={{ left: toPixels(edit.x, zoom), top: toPixels(edit.y, zoom) + shift }}
    >
      {/* The padding keeps the caret inside the box, so the textarea never scrolls. An empty last line still takes up a
          line, as it does in the textarea. */}
      <div aria-hidden={editing || undefined} className={cn("pr-1", editing && "invisible")} style={font}>
        {/* Sits on the first baseline. */}
        <span ref={baseline} className="inline-block align-baseline" />
        {editing && (text === "" || text.endsWith("\n")) ? `${text} ` : text}
      </div>
      {editing && (
        <textarea
          {...editUi}
          ref={inputRef}
          aria-label={t("textBox")}
          aria-describedby={unsupported.length > 0 ? warningId : undefined}
          autoFocus
          wrap="off"
          spellCheck={false}
          value={text}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          onBlur={(e) => leavesEdit(e.relatedTarget) && onFinish()}
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          className="absolute inset-0 resize-none overflow-hidden bg-transparent pr-1 outline-none"
          style={font}
        />
      )}
      {unsupported.length > 0 && (
        <p
          id={warningId}
          role="status"
          className="absolute top-full left-0 mt-2 flex items-center gap-1 rounded-md border bg-surface px-2 py-1 text-xs whitespace-nowrap text-warning shadow-sm"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {t("unsupportedCharacters", { characters: unsupported.join(" ") })}
        </p>
      )}
    </div>
  );
}
