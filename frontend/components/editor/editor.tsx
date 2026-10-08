"use client";

import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useLayoutEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { FormattingBar } from "@/components/editor/formatting-bar";
import { editUi } from "@/components/editor/edit-focus";
import { PageView } from "@/components/editor/page-view";
import { PdfPage } from "@/components/editor/pdf-page";
import { textBoxHelpId, textBoxId } from "@/components/editor/text-box";
import { TopBar, type ZoomSetting } from "@/components/editor/top-bar";
import { Button } from "@/components/ui/button";
import type { OpenedDocument } from "@/components/open-document";
import { currentPage as pageInView, displaySize } from "@/lib/coordinates";
import { canRedo, canUndo, editorReducer, initialState } from "@/lib/editor-state";
import { fitWidth, wheelZoom } from "@/lib/zoom";

type Page = { proxy: PDFPageProxy; size: { width: number; height: number } };

/** A point on a page that a zoom change keeps in place: the page, the point as fractions of its size, and where it was. */
type ZoomAnchor = { page: number; x: number; y: number; clientX: number; clientY: number };

/** Padding around the pages, in CSS pixels (p-6). */
const padding = 24;
/** The width of the widest thumbnail, in CSS pixels. */
const thumbnailWidth = 120;
/** Below this width the thumbnail panel starts closed and floats over the pages. */
const wideScreen = "(min-width: 768px)";
const replaceHintKey = "updf.replaceHint";

/** Whether a key press goes to a field with its own text editing, and its own undo. */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

/** Whether a key press goes to an open menu, which jumps to an item by its first letter. */
function isInMenu(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("[role=menu]");
}

/**
 * Whether a key press belongs to something else, so it must not trigger a tool shortcut: a text field, a menu, or the
 * text edit in progress and its formatting bar.
 */
function isForControl(target: EventTarget | null): boolean {
  return isTextField(target) || isInMenu(target) || (target instanceof HTMLElement && !!target.closest("[data-edit-ui]"));
}

/** Ctrl+Z (Cmd+Z on macOS), by the physical key on layouts without a Latin Z, as browsers do for text fields. */
function isUndoKey(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || (event.code === "KeyZ" && !/^[a-z]$/.test(key)));
}

/** Loads every page's size first, so the layout and the zoom are right from the first frame. */
export function Editor({ document }: { document: OpenedDocument }) {
  const [pages, setPages] = useState<Page[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { pdf } = document;

  useEffect(() => {
    let active = true;
    Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1))).then(
      (proxies) => active && setPages(proxies.map((proxy) => ({ proxy, size: displaySize(proxy) }))),
      // pdf.js repairs some damaged files enough to open them, but not enough to load every page.
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [pdf]);

  if (failed) {
    return <LoadFailed />;
  }
  return pages && <EditorView file={document.file} pages={pages} />;
}

function LoadFailed() {
  const t = useTranslations("Editor");
  const errors = useTranslations("Errors");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-16 sm:px-6">
      <p role="alert" className="text-base text-danger">
        {errors("pdf-unreadable")}
      </p>
      <Link href="/" className="self-start rounded-md text-sm font-medium text-accent hover:underline">
        {t("openAnother")}
      </Link>
    </main>
  );
}

function EditorView({ file, pages }: { file: File; pages: Page[] }) {
  const t = useTranslations("Editor");
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [thumbnailPanel, setThumbnailPanel] = useState<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [zoomSetting, setZoomSetting] = useState<ZoomSetting>("fit");
  const [thumbnailsOpen, setThumbnailsOpen] = useState(() => window.matchMedia(wideScreen).matches);
  const [currentPage, setCurrentPage] = useState(0);
  const [state, dispatch] = useReducer(editorReducer, initialState);
  const selected = state.edits.find((edit) => edit.id === state.selected);
  const editingInput = useRef<HTMLTextAreaElement>(null);
  const [replaceHint, setReplaceHint] = useState(false);
  const pageElements = useRef<HTMLElement[]>([]);
  const zoomAnchor = useRef<ZoomAnchor | null>(null);

  /**
   * Undo or redo can remove the focused box, or disable the focused button. The focus then goes to the pages, not back
   * to the start of the document.
   */
  function undoOrRedo(type: "undo" | "redo") {
    flushSync(() => dispatch({ type }));
    const focused = document.activeElement;
    if (focused === document.body || (focused instanceof HTMLButtonElement && focused.disabled)) {
      scroller?.focus();
    }
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isUndoKey(event) && !isTextField(event.target) && !isInMenu(event.target)) {
      event.preventDefault();
      undoOrRedo(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || isForControl(event.target)) {
      return;
    }
    if (event.key.toLowerCase() === "t") {
      dispatch({ type: "setTool", tool: "text" });
    } else if (event.key === "Escape") {
      dispatch({ type: "setTool", tool: "select" });
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!scroller) {
      return;
    }
    const observer = new ResizeObserver(() => setAvailableWidth(scroller.clientWidth - 2 * padding));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  const widest = Math.max(...pages.map((page) => page.size.width));
  const fittedZoom = fitWidth(availableWidth, widest);
  const zoom = zoomSetting === "fit" ? fittedZoom : zoomSetting;

  /**
   * Changes the zoom, keeping the part of the document at a point in the view (the pointer, or the middle of the view)
   * at that point.
   */
  function changeZoom(setting: ZoomSetting, at?: { clientX: number; clientY: number }) {
    if (scroller && (setting === "fit" ? fittedZoom : setting) !== zoom) {
      const view = scroller.getBoundingClientRect();
      const { clientX, clientY } = at ?? { clientX: view.left + view.width / 2, clientY: view.top + view.height / 2 };
      const rects = pageElements.current.map((element) => element.getBoundingClientRect());
      // The page under the point, or the one after the gap it's in.
      const index = Math.max(0, rects.findIndex((rect) => clientY < rect.bottom));
      const rect = rects[index];
      zoomAnchor.current = { page: index, x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height, clientX, clientY };
    }
    setZoomSetting(setting);
  }

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    if (scroller && anchor) {
      const rect = pageElements.current[anchor.page].getBoundingClientRect();
      scroller.scrollBy({ left: rect.left + anchor.x * rect.width - anchor.clientX, top: rect.top + anchor.y * rect.height - anchor.clientY });
      zoomAnchor.current = null;
    }
  }, [zoom, scroller]);

  // Ctrl+wheel and a trackpad pinch zoom the pages, not the browser. Each event is applied at once, so the next one
  // starts from its zoom and layout.
  const onWheel = useEffectEvent((event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey) || !scroller) {
      return;
    }
    event.preventDefault();
    const view = scroller.getBoundingClientRect();
    const inView = event.clientX >= view.left && event.clientX < view.right && event.clientY >= view.top && event.clientY < view.bottom;
    // Firefox can report a mouse wheel in lines.
    const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 40 : event.deltaY;
    flushSync(() => changeZoom(wheelZoom(zoom, deltaY), inView ? event : undefined));
  });

  useEffect(() => {
    const listener = (event: WheelEvent) => onWheel(event);
    // Not passive, so it can stop the browser zooming.
    window.addEventListener("wheel", listener, { passive: false });
    return () => window.removeEventListener("wheel", listener);
  }, []);

  function updateCurrentPage() {
    const tops = pageElements.current.map((element) => element.offsetTop);
    setCurrentPage(pageInView(tops, { top: scroller!.scrollTop, height: scroller!.clientHeight, scrollHeight: scroller!.scrollHeight }));
  }

  /** Moves the focus off the selected box to the pages, which deselects it. */
  function leaveBox() {
    scroller?.focus();
  }

  /** Deletes a box, and moves the focus to the next box, or the one before, or the pages. */
  function deleteBox(id: string) {
    const boxes = [...document.querySelectorAll<HTMLElement>("[data-text-box]")];
    const index = boxes.findIndex((box) => box.id === textBoxId(id));
    const next = boxes[index + 1] ?? boxes[index - 1];
    dispatch({ type: "delete", id });
    if (next) {
      next.focus();
    } else {
      leaveBox();
    }
  }

  // Shown after the first replacement in a browser session.
  function showReplaceHint() {
    if (!sessionStorage.getItem(replaceHintKey)) {
      sessionStorage.setItem(replaceHintKey, "shown");
      setReplaceHint(true);
    }
  }

  function showPage(index: number) {
    pageElements.current[index].scrollIntoView({ block: "start" });
    setCurrentPage(index);
    if (!window.matchMedia(wideScreen).matches) {
      setThumbnailsOpen(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        fileName={file.name}
        zoom={availableWidth > 0 ? zoom : null}
        zoomSetting={zoomSetting}
        onZoom={changeZoom}
        thumbnailsOpen={thumbnailsOpen}
        onToggleThumbnails={() => setThumbnailsOpen((open) => !open)}
        tool={state.tool}
        onTool={(tool) => dispatch({ type: "setTool", tool })}
        canUndo={canUndo(state)}
        canRedo={canRedo(state)}
        onUndo={() => undoOrRedo("undo")}
        onRedo={() => undoOrRedo("redo")}
      />
      <div className="relative flex min-h-0 flex-1">
        <nav
          id="thumbnails"
          ref={setThumbnailPanel}
          aria-label={t("thumbnails")}
          hidden={!thumbnailsOpen}
          className="absolute inset-y-0 left-0 z-10 w-44 overflow-y-auto border-r bg-surface shadow-lg md:static md:shadow-none"
        >
          <ol className="flex flex-col gap-1 p-3">
            {pages.map((page, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-label={t("page", { number: i + 1 })}
                  aria-current={i === currentPage ? "page" : undefined}
                  onClick={() => showPage(i)}
                  className="flex w-full flex-col items-center gap-2 rounded-md p-2 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-accent-subtle"
                >
                  <PdfPage
                    page={page.proxy}
                    size={page.size}
                    scale={thumbnailWidth / widest}
                    root={thumbnailPanel}
                    className="ring-1 ring-border"
                  />
                  <span className="text-xs text-text-secondary">{i + 1}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        {/* The pages, with the formatting bar and notices floating over them. */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          {/* A stable scrollbar gutter keeps fit width from changing as a scrollbar comes and goes. Focusable from code
              only, so Esc and deleting the last box have somewhere to put the focus. */}
          <div
            ref={setScroller}
            data-testid="pages"
            tabIndex={-1}
            onScroll={updateCurrentPage}
            className="relative min-h-0 flex-1 overflow-auto bg-canvas outline-none [scrollbar-gutter:stable]"
          >
            <p id={textBoxHelpId} hidden>
              {t("textBoxHelp")}
            </p>
            {availableWidth > 0 && (
              <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 p-6">
                {pages.map((page, i) => (
                  <PageView
                    key={i}
                    ref={(element) => {
                      pageElements.current[i] = element!;
                    }}
                    index={i}
                    page={page.proxy}
                    size={page.size}
                    zoom={zoom}
                    root={scroller}
                    label={t("pageOf", { number: i + 1, total: pages.length })}
                    tool={state.tool}
                    edits={state.edits.filter((edit) => edit.page === i)}
                    selected={state.selected}
                    editing={state.editing}
                    editingInput={editingInput}
                    dispatch={dispatch}
                    onReplace={showReplaceHint}
                    onDelete={deleteBox}
                    onLeave={leaveBox}
                  />
                ))}
              </div>
            )}
          </div>
          {/* Floats over the top of the pages, so they don't move when it appears. After the pages in the tab order, so
              Tab goes from the text box to the bar. */}
          {selected && (
            <div className="pointer-events-none absolute inset-x-4 top-3 z-10 flex justify-center">
              <FormattingBar
                key={selected.id}
                style={selected.style}
                fontLocked={!!selected.cover}
                onStyle={(style) => dispatch({ type: "setStyle", style })}
                onReturn={() => (editingInput.current ?? document.getElementById(textBoxId(selected.id)))?.focus()}
                onDeselect={() => dispatch({ type: "deselect" })}
                onLeave={leaveBox}
                onDelete={() => deleteBox(selected.id)}
              />
            </div>
          )}
          {/* Part of the edit, so dismissing it doesn't finish the replacement being typed. */}
          {replaceHint && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center">
              <div
                {...editUi}
                role="status"
                onMouseDown={(event) => event.preventDefault()}
                className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-surface py-2 pr-2 pl-4 text-sm shadow-lg"
              >
                <Info aria-hidden className="size-4 shrink-0 text-text-secondary" />
                <p>{t("replaceHint")}</p>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setReplaceHint(false)}>
                  {t("gotIt")}
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
