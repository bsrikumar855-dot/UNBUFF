import { useCallback, useState } from "react";

const UNREADABLE_PDF_MESSAGE =
  "We couldn't read that PDF. Try another file or paste your resume instead.";

let workerConfigured = false;

/**
 * Browser-side PDF text extraction (pdf.js) per the setup contract: the
 * backend only ever receives resume text, never a raw PDF.
 *
 * pdfjs-dist is dynamically imported so its ~1MB+ isn't in the main bundle
 * that every page (including Landing) has to download — it only loads the
 * moment someone actually uploads a PDF.
 */
export function usePdfExtractor() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractText = useCallback(async (file: File): Promise<string> => {
    setIsExtracting(true);
    setError(null);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      if (!workerConfigured) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        workerConfigured = true;
      }

      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

      const pageTexts: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        // Keep the PDF's line breaks: each resume line becomes its own claim / heatmap row.
        const pageText = content.items
          .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
          .join("");
        pageTexts.push(pageText);
      }

      const text = pageTexts
        .join("\n")
        .replace(/[ \t]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!text) {
        setError(
          "That PDF doesn't contain any readable text. Try another file or paste your resume instead."
        );
        return "";
      }
      return text;
    } catch {
      setError(UNREADABLE_PDF_MESSAGE);
      return "";
    } finally {
      setIsExtracting(false);
    }
  }, []);

  return { extractText, isExtracting, error, clearError: () => setError(null) };
}
