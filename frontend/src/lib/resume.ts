import type { AtsCheckStatus, AtsResult } from "@/types/contract";

export const RATING_LABEL: Record<AtsResult["rating"], string> = {
  strong: "Strong",
  good: "Good",
  needs_work: "Needs work",
  weak: "Weak",
};

export const STATUS_LABEL: Record<AtsCheckStatus, string> = {
  pass: "Pass",
  warn: "Improve",
  fail: "Fix",
};

/** What the mentor page opens with when the student asks for help from the résumé builder. */
export const RESUME_STARTERS = [
  "Review my résumé and tell me the three changes that would raise my ATS score the most.",
  "Rewrite my weakest bullets so each starts with a verb and shows a result. Mark any number I must fill in.",
  "Which keywords for my target role am I missing, and where could I honestly add them?",
];

export const mentorResumeUrl = (prompt?: string): string => {
  const q = new URLSearchParams({ resume: "1" });
  if (prompt) q.set("prompt", prompt.slice(0, 300));
  return `/mentor?${q.toString()}`;
};

/** Shows just the page: no toolbar, thumbnail pane or scrollbar, scaled to the width of the frame. */
export const PDF_ONLY = "#toolbar=0&navpanes=0&scrollbar=0&view=FitH";

/** The most the upload accepts: a PDF is only read in the browser (text out, never uploaded as a file). */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_TEXT_FILE_BYTES = 100 * 1024;

/** Reads a text file. Falls back to FileReader where Blob.text is missing (older browsers). */
export const readTextFile = (file: File): Promise<string> =>
  typeof file.text === "function"
    ? file.text()
    : new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(r.error);
        r.readAsText(file);
      });

/** A blob URL for a base64 PDF. The caller revokes it when done. */
export function pdfUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

/** Points on a 0 to 100 scale mapped to the tone class used by the score ring. */
export const scoreTone = (score: number): "good" | "mid" | "low" => (score >= 75 ? "good" : score >= 50 ? "mid" : "low");
