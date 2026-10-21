let workerConfigured = false;

/**
 * pdfjs-dist, loaded on first use: it is large, so it stays out of the main bundle until someone uploads a PDF or
 * opens a PDF preview. The worker is configured once for every caller.
 */
export async function loadPdfjs() {
  const pdfjsLib = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    workerConfigured = true;
  }
  return pdfjsLib;
}
