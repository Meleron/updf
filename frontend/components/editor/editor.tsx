"use client";

import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PdfPage } from "@/components/editor/pdf-page";
import { TopBar, type ZoomSetting } from "@/components/editor/top-bar";
import type { OpenedDocument } from "@/components/open-document";
import { currentPage as pageInView, displaySize, toPixels } from "@/lib/coordinates";
import { fitWidth } from "@/lib/zoom";

type Page = { proxy: PDFPageProxy; size: { width: number; height: number } };

/** Padding around the pages, in CSS pixels (p-6). */
const padding = 24;
/** The width of the widest thumbnail, in CSS pixels. */
const thumbnailWidth = 120;
/** Below this width the thumbnail panel starts closed and floats over the pages. */
const wideScreen = "(min-width: 768px)";

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
  const pageElements = useRef<HTMLElement[]>([]);
  const zoomAnchor = useRef<number | null>(null);

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

  // Keeps the middle of the view on the same part of the document when the zoom changes.
  function changeZoom(setting: ZoomSetting) {
    if (scroller && (setting === "fit" ? fittedZoom : setting) !== zoom) {
      zoomAnchor.current = (scroller.scrollTop + scroller.clientHeight / 2) / scroller.scrollHeight;
    }
    setZoomSetting(setting);
  }

  useLayoutEffect(() => {
    if (scroller && zoomAnchor.current !== null) {
      scroller.scrollTo({ top: zoomAnchor.current * scroller.scrollHeight - scroller.clientHeight / 2 });
      zoomAnchor.current = null;
    }
  }, [zoom, scroller]);

  function updateCurrentPage() {
    const tops = pageElements.current.map((element) => element.offsetTop);
    setCurrentPage(pageInView(tops, { top: scroller!.scrollTop, height: scroller!.clientHeight, scrollHeight: scroller!.scrollHeight }));
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
        {/* A stable scrollbar gutter keeps fit width from changing as a scrollbar comes and goes. */}
        <main
          ref={setScroller}
          onScroll={updateCurrentPage}
          className="relative min-w-0 flex-1 overflow-auto bg-canvas [scrollbar-gutter:stable]"
        >
          {availableWidth > 0 && (
            <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 p-6">
              {pages.map((page, i) => (
                <div
                  key={i}
                  ref={(element) => {
                    pageElements.current[i] = element!;
                  }}
                >
                  <PdfPage
                    page={page.proxy}
                    size={page.size}
                    scale={toPixels(1, zoom)}
                    root={scroller}
                    label={t("pageOf", { number: i + 1, total: pages.length })}
                    className="ring-1 ring-border"
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
