"use client";

import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState } from "react";
import { PdfPage } from "@/components/editor/pdf-page";
import { TextBox } from "@/components/editor/text-box";
import { pointOnPage, toPixels } from "@/lib/coordinates";
import type { TextEdit } from "@/lib/edits";
import type { EditorAction, Tool } from "@/lib/editor-state";
import { addFontFaces, type PdfFont } from "@/lib/pdf-fonts";
import { coverArea, isReplaced, replacementFor, sampleColors } from "@/lib/replace";
import { readLines, type TextLine } from "@/lib/text-lines";
import { cn } from "@/lib/utils";

/** The band around a line whose colour the cover takes, in points. */
const backgroundBand = 2;

type Props = {
  index: number;
  page: PDFPageProxy;
  /** The page's displayed size in points. */
  size: { width: number; height: number };
  zoom: number;
  root: Element | null;
  label: string;
  tool: Tool;
  /** The edits on this page. */
  edits: TextEdit[];
  selected: string | null;
  editing: string | null;
  /** The replacement being typed in while it still equals its line: the PDF shows, not its cover and text. */
  untouched: string | null;
  editingInput: React.RefObject<HTMLTextAreaElement | null>;
  dispatch: React.Dispatch<EditorAction>;
  onReplace: () => void;
  /** Called once the page's lines are read, with the PDF's fonts that replacements on it can be drawn in, by name. */
  onFonts: (index: number, fonts: Map<string, PdfFont>) => void;
  onDelete: (id: string) => void;
  /** Moves the focus away from the selected box. */
  onLeave: () => void;
  ref: React.Ref<HTMLDivElement>;
};

/** The fonts replacements on a page are drawn in, by name. */
function fontsByName(lines: TextLine[]): Map<string, PdfFont> {
  return new Map(lines.flatMap((line) => (line.pdfFont ? [[line.pdfFont.name, line.pdfFont]] : [])));
}

/**
 * One page in the editor, with its edits. With Add text, a click adds a box. With Select, the existing line under the
 * pointer is outlined, and a click replaces it. Lines are read once the page has been drawn, and covers sample their
 * colour from the drawn page, which holds only the PDF (edits are separate elements above it).
 */
export function PageView(props: Props) {
  const { index, page, size, zoom, root, label, tool, edits, selected, editing, untouched, editingInput, dispatch, onReplace, onFonts, onDelete, onLeave, ref } =
    props;
  const t = useTranslations("Editor");
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const reading = useRef<Promise<void> | null>(null);
  const [lines, setLines] = useState<TextLine[] | null>(null);
  const [hovered, setHovered] = useState<TextLine | null>(null);

  const rendered = useCallback(
    (drawn: HTMLCanvasElement | null) => {
      canvas.current = drawn;
      // After drawing, so the fonts are loaded and lines can tell which font is closest.
      if (drawn) {
        reading.current ??= readLines(page).then((read) => {
          addFontFaces(read.flatMap((line) => line.pdfFont ?? []));
          setLines(read);
          onFonts(index, fontsByName(read));
        });
      }
    },
    [page, index, onFonts],
  );

  /** The line under the pointer, if the pointer is on the page itself (not on an edit) and the line isn't replaced. */
  function lineAt(event: React.MouseEvent<HTMLElement>): TextLine | null {
    if (tool !== "select" || !(event.target instanceof Element) || !event.target.closest("[role=img]")) {
      return null;
    }
    const { x, y } = pointOnPage(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), zoom);
    const line = lines?.find((candidate) => {
      const area = coverArea(candidate);
      return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
    });
    return line && !isReplaced(line, edits) ? line : null;
  }

  function replace(line: TextLine) {
    const drawn = canvas.current!;
    const scale = drawn.width / size.width;
    const area = coverArea(line);
    const left = Math.max(0, Math.floor((area.x - backgroundBand) * scale));
    const top = Math.max(0, Math.floor((area.y - backgroundBand) * scale));
    const right = Math.min(drawn.width, Math.ceil((area.x + area.width + backgroundBand) * scale));
    const bottom = Math.min(drawn.height, Math.ceil((area.y + area.height + backgroundBand) * scale));
    const pixels = drawn.getContext("2d")!.getImageData(left, top, right - left, bottom - top);
    const colors = sampleColors(
      pixels,
      { x: area.x * scale - left, y: area.y * scale - top, width: area.width * scale, height: area.height * scale },
      backgroundBand * scale,
    );
    dispatch({ type: "addReplacement", edit: { id: crypto.randomUUID(), page: index, ...replacementFor(line, colors) } });
    onReplace();
  }

  function click(event: React.MouseEvent<HTMLDivElement>) {
    // Text boxes handle their own clicks.
    if (event.target instanceof Element && event.target.closest("[data-text-box]")) {
      return;
    }
    if (tool === "text") {
      const { x, y } = pointOnPage(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), zoom);
      dispatch({ type: "addText", id: crypto.randomUUID(), page: index, x, y });
      return;
    }
    const line = lineAt(event);
    if (line && canvas.current) {
      setHovered(null);
      replace(line);
    }
  }

  const outline = hovered && coverArea(hovered);
  const pdfFonts = useMemo(() => fontsByName(lines ?? []), [lines]);
  return (
    <div
      ref={ref}
      onClick={click}
      onPointerMove={(event) => setHovered(lineAt(event))}
      onPointerLeave={() => setHovered(null)}
      className={cn("relative", tool === "text" && "cursor-text", outline && "cursor-pointer")}
    >
      <PdfPage page={page} size={size} scale={toPixels(1, zoom)} root={root} label={label} className="ring-1 ring-border" onRender={rendered} />
      {outline && (
        <div
          data-testid="line-outline"
          className="pointer-events-none absolute rounded-sm outline-1 outline-accent/50"
          style={{
            left: toPixels(outline.x, zoom),
            top: toPixels(outline.y, zoom),
            width: toPixels(outline.width, zoom),
            height: toPixels(outline.height, zoom),
          }}
        />
      )}
      {/* With Add text the user is already doing what the hint suggests. */}
      {lines?.length === 0 && tool === "select" && (
        <p className="pointer-events-none absolute top-3 left-1/2 w-max max-w-[90%] -translate-x-1/2 rounded-md border bg-surface px-3 py-1 text-center text-xs text-text-secondary shadow-sm">
          {t("noText")}
        </p>
      )}
      {/* Covers go under every text box, as in the PDF. */}
      {edits.map(
        (edit) =>
          edit.cover &&
          edit.id !== untouched && (
            <div
              key={edit.id}
              data-testid="cover"
              className="absolute"
              style={{
                left: toPixels(edit.cover.x, zoom),
                top: toPixels(edit.cover.y, zoom),
                width: toPixels(edit.cover.width, zoom),
                height: toPixels(edit.cover.height, zoom),
                backgroundColor: edit.cover.color,
              }}
            />
          ),
      )}
      {edits.map((edit) => (
        <TextBox
          key={edit.id}
          edit={edit}
          pdfFont={edit.pdfFont && pdfFonts.get(edit.pdfFont.name)}
          zoom={zoom}
          pageSize={size}
          selected={edit.id === selected}
          editing={edit.id === editing}
          untouched={edit.id === untouched}
          inputRef={edit.id === editing ? editingInput : null}
          onSelect={() => dispatch({ type: "select", id: edit.id })}
          onEdit={() => dispatch({ type: "edit", id: edit.id })}
          onChange={(lines) => dispatch({ type: "changeText", id: edit.id, lines })}
          onMove={(x, y, nudge) => dispatch({ type: "move", id: edit.id, x, y, nudge })}
          onFinish={() => dispatch({ type: "finishEditing" })}
          onDeselect={() => dispatch({ type: "deselect" })}
          onLeave={onLeave}
          onDelete={() => onDelete(edit.id)}
        />
      ))}
    </div>
  );
}
