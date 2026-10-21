import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PdfPreview } from "@/components/resume/PdfPreview";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pdfjs", () => ({ loadPdfjs: load }));

/** A stand-in for pdf.js: pages of the given natural sizes, each recording how it was rendered. */
function fakePdfjs(pages: { w: number; h: number }[]) {
  const rendered: { scale: number }[] = [];
  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (n: number) => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: pages[n - 1]!.w * scale, height: pages[n - 1]!.h * scale }),
        render: ({ viewport }: { viewport: { width: number } }) => {
          rendered.push({ scale: viewport.width / pages[n - 1]!.w });
          return { promise: Promise.resolve() };
        },
      }),
    }),
  }));
  return { lib: { getDocument }, rendered, getDocument };
}

const PDF = btoa("%PDF-1.5 fake");
const FALLBACK = "blob:fallback";

beforeEach(() => {
  load.mockReset();
  // jsdom has no layout: give the pane a size, and a canvas that accepts drawing calls.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
});
afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});

describe("PdfPreview", () => {
  it("draws a one-page PDF whole inside the pane (fit to the smaller of width and height)", async () => {
    const f = fakePdfjs([{ w: 595, h: 842 }]); // A4: the pane's 600x800 is height-limited
    load.mockResolvedValue(f.lib);
    const { container } = render(<PdfPreview base64={PDF} fallbackUrl={FALLBACK} title="Preview" />);
    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(1));
    expect(f.rendered[0]!.scale).toBeCloseTo(800 / 842, 3);
    const canvas = container.querySelector("canvas")!;
    expect(canvas.style.display).toBe("block"); // no inline gap under the page
    expect(canvas.style.margin).toBe("0px auto");
    expect(screen.getByRole("img", { name: "Preview" })).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("fits a longer PDF to the width, one canvas per page, stacked with no gaps", async () => {
    const f = fakePdfjs([{ w: 595, h: 842 }, { w: 595, h: 842 }]);
    load.mockResolvedValue(f.lib);
    const { container } = render(<PdfPreview base64={PDF} fallbackUrl={FALLBACK} title="Preview" />);
    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(2));
    expect(f.rendered.map((r) => r.scale.toFixed(3))).toEqual([(600 / 595).toFixed(3), (600 / 595).toFixed(3)]);
  });

  it("passes the PDF bytes, decoded from base64, to pdf.js", async () => {
    const f = fakePdfjs([{ w: 595, h: 842 }]);
    load.mockResolvedValue(f.lib);
    render(<PdfPreview base64={PDF} fallbackUrl={FALLBACK} title="Preview" />);
    await waitFor(() => expect(f.getDocument).toHaveBeenCalled());
    const data = (f.getDocument.mock.calls[0] as unknown as [{ data: Uint8Array }])[0].data;
    expect(new TextDecoder().decode(data)).toBe("%PDF-1.5 fake");
  });

  it("falls back to the browser's viewer, showing only the page, when drawing fails", async () => {
    load.mockRejectedValue(new Error("pdf.js could not load"));
    render(<PdfPreview base64={PDF} fallbackUrl={FALLBACK} title="Preview" />);
    const frame = await screen.findByTitle("Preview");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "blob:fallback#toolbar=0&navpanes=0&scrollbar=0&view=FitH");
  });

  it("falls back when a page cannot be rendered", async () => {
    const f = fakePdfjs([{ w: 595, h: 842 }]);
    load.mockResolvedValue({ getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => { throw new Error("bad page"); } }) }) });
    render(<PdfPreview base64={PDF} fallbackUrl={FALLBACK} title="Preview" />);
    expect((await screen.findByTitle("Preview")).tagName).toBe("IFRAME");
    expect(f.rendered).toEqual([]);
  });

  it("keeps the old page on screen until the new one is ready (no empty flash)", async () => {
    const f = fakePdfjs([{ w: 595, h: 842 }]);
    load.mockResolvedValue(f.lib);
    const { container, rerender } = render(<PdfPreview base64={PDF} fallbackUrl={FALLBACK} title="Preview" />);
    await waitFor(() => expect(container.querySelectorAll("canvas")).toHaveLength(1));
    const first = container.querySelector("canvas");
    rerender(<PdfPreview base64={btoa("%PDF-1.5 second")} fallbackUrl={FALLBACK} title="Preview" />);
    expect(container.querySelectorAll("canvas")).toHaveLength(1); // still the old one, immediately
    await waitFor(() => expect(container.querySelector("canvas")).not.toBe(first));
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });
});
