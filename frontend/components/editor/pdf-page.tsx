"use client";

import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useEffect, useRef, useState } from "react";
import { canvasPixelRatio } from "@/lib/coordinates";
import { loadPdfJs } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";

type Props = {
  page: PDFPageProxy;
  /** The page's displayed size in points. */
  size: { width: number; height: number };
  /** CSS pixels per point. */
  scale: number;
  /** The scrolling element the page is drawn in. */
  root: Element | null;
  /** Leave out for decorative copies, such as thumbnails inside a labelled button. */
  label?: string;
  className?: string;
};

/**
 * One page, drawn only while it is within a screen's height of the visible part of `root`, and freed when it scrolls
 * further away. Each render draws into a new canvas that replaces the old one when it's done, so zooming doesn't
 * flicker and a cancelled render never shares its canvas with the next one.
 */
export function PdfPage({ page, size, scale, root, label, className }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (!root) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNear(entry.isIntersecting);
        if (!entry.isIntersecting) {
          setRendered(false);
        }
      },
      { root, rootMargin: "100% 0px" },
    );
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const element = container.current!;
    if (!near) {
      element.replaceChildren();
      return;
    }
    let cancelled = false;
    let task: ReturnType<PDFPageProxy["render"]> | undefined;
    loadPdfJs()
      .then(({ AnnotationMode }) => {
        if (cancelled) {
          return;
        }
        const ratio = canvasPixelRatio(size.width * scale, size.height * scale, window.devicePixelRatio);
        const viewport = page.getViewport({ scale: scale * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.className = "size-full";
        // Draws form fields and other annotations too, as standard viewers do.
        task = page.render({ canvas, viewport, annotationMode: AnnotationMode.ENABLE });
        return task.promise.then(() => {
          element.replaceChildren(canvas);
          setRendered(true);
        });
      })
      .catch((error: Error) => {
        if (error.name !== "RenderingCancelledException") {
          throw error;
        }
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [page, size, scale, near]);

  return (
    <div
      ref={container}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      aria-busy={label ? !rendered : undefined}
      className={cn("bg-surface", className)}
      style={{ width: size.width * scale, height: size.height * scale }}
    />
  );
}
