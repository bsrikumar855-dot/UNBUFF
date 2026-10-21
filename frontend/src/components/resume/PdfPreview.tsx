import React, { useEffect, useRef, useState } from "react";
import { loadPdfjs } from "@/lib/pdfjs";
import { PDF_ONLY } from "@/lib/resume";

/**
 * Shows a PDF and nothing else: the pages are drawn edge to edge, with no toolbar, thumbnail pane or gray gutters.
 * A one-page résumé is fitted whole into the pane; a longer one fits the width and scrolls. If drawing fails for any
 * reason the browser's own viewer is used instead, so the student always sees their PDF.
 */
export const PdfPreview: React.FC<{ base64: string; fallbackUrl: string; title: string }> = ({ base64, fallbackUrl, title }) => {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (failed || !el || size.w === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) }).promise;
        const canvases: HTMLCanvasElement[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const natural = page.getViewport({ scale: 1 });
          // One page: fit it whole. Several: fit the width and let the pane scroll.
          const scale = doc.numPages === 1 ? Math.min(size.w / natural.width, size.h / natural.height) : size.w / natural.width;
          const dpr = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.cssText = `display:block;margin:0 auto;width:${Math.floor(viewport.width / dpr)}px;height:${Math.floor(viewport.height / dpr)}px`;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no canvas");
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        el.replaceChildren(...canvases); // swap in one go, so a rebuild never flashes an empty pane
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [base64, size.w, size.h, failed]);

  if (failed) return <iframe title={title} src={`${fallbackUrl}${PDF_ONLY}`} className="size-full border-0" />;
  return <div ref={host} role="img" aria-label={title} className="size-full overflow-auto bg-white" />;
};
