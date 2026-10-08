"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { editUi, leavesEdit } from "@/components/editor/edit-focus";
import { toPixels } from "@/lib/coordinates";
import type { TextEdit } from "@/lib/edits";
import { faceFor } from "@/lib/fonts";
import { unsupportedCharacters } from "@/lib/formatting";
import { drawsInPdfFont, type PdfFont } from "@/lib/pdf-fonts";
import { cn } from "@/lib/utils";

/** The id of the element describing how to use a text box from the keyboard (rendered by the editor). */
export const textBoxHelpId = "text-box-help";

/** The id of a text box's element, to focus it. */
export function textBoxId(editId: string): string {
  return `text-box-${editId}`;
}

type Props = {
  edit: TextEdit;
  /** The replacement's original font, once the page's fonts are known. */
  pdfFont: PdfFont | undefined;
  zoom: number;
  /** The page's displayed size in points: the box can't be moved off it. */
  pageSize: { width: number; height: number };
  selected: boolean;
  editing: boolean;
  /** The textarea while editing, so the formatting bar can put the focus back. */
  inputRef: React.RefObject<HTMLTextAreaElement | null> | null;
  onSelect: () => void;
  onEdit: () => void;
  onChange: (lines: string[]) => void;
  onMove: (x: number, y: number) => void;
  /** Ends typing. The box stays selected. */
  onFinish: () => void;
  /** Focus has gone elsewhere. */
  onDeselect: () => void;
  /** Esc on the selected box: move the focus away. */
  onLeave: () => void;
  onDelete: () => void;
};

/** The arrow keys move a selected box by a point, or by ten with Shift. */
const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Drag = { clientX: number; clientY: number; wasSelected: boolean; to: { x: number; y: number } | null };

/**
 * A text box drawn the way the backend draws it, so the download matches the screen: the same fonts, the fonts' own
 * line spacing, no kerning or ligatures (PDFsharp applies neither), and the top-left corner at the edit's position.
 * While editing, a textarea lies over a hidden copy of the text, which sizes the box.
 *
 * Browsers round the font's metrics when placing the first baseline, which can put it up to two pixels above the
 * PDF's. So the box measures where its first baseline lands and moves by the difference.
 *
 * Characters the PDF fonts can't show get a warning under the box, since the export would refuse them.
 *
 * A box is selected by focusing it (a click or Tab), and edited by clicking it again or with Enter. A selected box is
 * moved by dragging or with the arrow keys, and stays on its page. A drag becomes one move when it ends.
 */
export function TextBox(props: Props) {
  const { edit, pdfFont, zoom, pageSize, selected, editing, inputRef, onSelect, onEdit, onChange, onMove, onFinish, onDeselect, onLeave, onDelete } = props;
  const t = useTranslations("Editor");
  const warningId = useId();
  const original = drawsInPdfFont(edit, pdfFont);
  const unsupported = original ? [] : unsupportedCharacters(edit.lines, edit.style);
  const { style } = edit;
  const text = edit.lines.join("\n");
  const fontSize = toPixels(style.size, zoom);
  const face = faceFor(style);
  const baseline = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragged, setDragged] = useState<{ x: number; y: number } | null>(null);
  const [shift, setShift] = useState(0);
  const position = dragged ?? edit;

  // An edit starts with the cursor after the text, which matters for a replacement.
  useLayoutEffect(() => {
    const input = inputRef?.current;
    if (editing && input) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, [editing, inputRef]);

  useLayoutEffect(() => {
    let active = true;
    function measure() {
      // The box may be gone by the time the font has loaded.
      if (!active) {
        return;
      }
      const marker = baseline.current!;
      setShift(fontSize * face.ascent - (marker.getBoundingClientRect().top - marker.parentElement!.getBoundingClientRect().top));
    }
    measure();
    // Until the font has loaded, the baseline is the fallback font's.
    document.fonts.ready.then(measure);
    return () => {
      active = false;
    };
  }, [fontSize, face, original]);

  // In its original font, the box keeps that font's glyphs and weight. A space the font lacks comes from the regular
  // face of the box's font, as on the backend, which also draws the underline from the box font's metrics.
  const font: React.CSSProperties = {
    fontFamily: original ? `"${pdfFont!.family}", "${style.font}"` : `"${style.font}"`,
    fontSize,
    fontWeight: style.bold && !original ? 700 : 400,
    fontStyle: style.italic && !original ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    ...(original && { textUnderlineOffset: `${face.underlineOffset}em`, textDecorationThickness: `${face.underlineThickness}em` }),
    // The PDF's underline runs through descenders.
    textDecorationSkipInk: "none",
    color: style.color,
    textAlign: style.align,
    lineHeight: face.lineHeight,
    fontKerning: "none",
    fontVariantLigatures: "none",
    textRendering: "geometricPrecision",
    whiteSpace: "pre",
  };

  /** A position for the box's top-left corner, kept so the whole box stays on the page where it fits. */
  function onPage(x: number, y: number) {
    const scale = toPixels(1, zoom);
    const { offsetWidth, offsetHeight } = root.current!;
    return {
      x: Math.min(Math.max(x, 0), Math.max(0, pageSize.width - offsetWidth / scale)),
      y: Math.min(Math.max(y, 0), Math.max(0, pageSize.height - offsetHeight / scale)),
    };
  }

  function keyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    const arrow = arrows[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const to = onPage(edit.x + arrow[0] * step, edit.y + arrow[1] * step);
      onMove(to.x, to.y);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete();
    } else if (event.key === "Enter") {
      // Otherwise the Enter would go on to the new textarea as a new line.
      event.preventDefault();
      onEdit();
    } else if (event.key === "Escape") {
      onLeave();
    }
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (editing || event.button !== 0) {
      return;
    }
    drag.current = { clientX: event.clientX, clientY: event.clientY, wasSelected: selected, to: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const [dx, dy] = current ? [event.clientX - current.clientX, event.clientY - current.clientY] : [0, 0];
    // A few pixels of movement are still a click.
    if (!current || (!current.to && Math.hypot(dx, dy) < 4)) {
      return;
    }
    const scale = toPixels(1, zoom);
    current.to = onPage(edit.x + dx / scale, edit.y + dy / scale);
    setDragged(current.to);
  }

  function pointerUp() {
    const current = drag.current;
    drag.current = null;
    if (current?.to) {
      onMove(current.to.x, current.to.y);
      setDragged(null);
    } else if (current?.wasSelected) {
      onEdit();
    }
  }

  return (
    <div
      {...editUi}
      ref={root}
      id={textBoxId(edit.id)}
      data-text-box=""
      data-testid="text-box"
      role={editing ? undefined : "button"}
      aria-roledescription={editing ? undefined : t("textBoxRole")}
      aria-describedby={editing ? undefined : [textBoxHelpId, unsupported.length > 0 && warningId].filter(Boolean).join(" ")}
      tabIndex={editing ? -1 : 0}
      onFocus={(event) => event.target === event.currentTarget && onSelect()}
      onBlur={(event) => leavesEdit(event.relatedTarget) && onDeselect()}
      onKeyDown={keyDown}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setDragged(null);
      }}
      className={cn(
        "absolute min-w-1 outline-accent outline-offset-2 focus-visible:outline-2",
        selected && "outline-1",
        !editing && "cursor-default select-none",
        selected && !editing && "cursor-move touch-none",
      )}
      style={{ left: toPixels(position.x, zoom), top: toPixels(position.y, zoom) + shift }}
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
          ref={inputRef}
          aria-label={t("textBox")}
          aria-describedby={unsupported.length > 0 ? warningId : undefined}
          autoFocus
          wrap="off"
          spellCheck={false}
          value={text}
          onChange={(e) => onChange(e.target.value.split("\n"))}
          onKeyDown={(e) => {
            // Esc ends typing, and the box stays selected with the focus on it. An empty box is discarded, so the focus
            // goes to the pages instead.
            if (e.key === "Escape") {
              if (text.trim() === "") {
                onLeave();
              } else {
                root.current!.focus();
              }
              onFinish();
            }
          }}
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
