import React, { useRef, useState } from "react";
import { Upload, FileText, X, CheckCircle2 } from "lucide-react";
import { usePdfExtractor } from "@/hooks/usePdfExtractor";
import { cn } from "@/lib/cn";

interface ResumeInputProps {
  value: string;
  onChange: (text: string) => void;
}

const PDF_TYPE_ERROR = "Only PDF files are supported.";

export const ResumeInput: React.FC<ResumeInputProps> = ({ value, onChange }) => {
  const { extractText, isExtracting, error: pdfError, clearError } = usePdfExtractor();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const error = fileTypeError ?? pdfError;

  async function processFile(file: File) {
    setFileTypeError(null);
    clearError();
    setExtracted(false);

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setFileTypeError(PDF_TYPE_ERROR);
      return;
    }

    setFileName(file.name);
    const text = await extractText(file);
    if (text) {
      onChange(text);
      setExtracted(true);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function handleClear() {
    setFileName(null);
    setExtracted(false);
    setFileTypeError(null);
    clearError();
    onChange("");
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="resume-text" className="text-sm font-semibold text-ink-primary">
          Your resume
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            id="resume-pdf-upload"
            onChange={handleFileInput}
          />
          <label
            htmlFor="resume-pdf-upload"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-white px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-surface-100"
          >
            <Upload size={14} aria-hidden="true" />
            Upload PDF
          </label>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-md border transition-colors",
          isDragging ? "border-primary bg-primary-soft" : "border-line-strong"
        )}
      >
        <textarea
          id="resume-text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (extracted) setExtracted(false);
          }}
          placeholder="Paste your resume text here, or drag a PDF onto this box…"
          rows={10}
          className="w-full resize-y rounded-md bg-transparent p-4 text-sm leading-relaxed text-ink-primary placeholder:text-ink-subtle focus:outline-none"
        />
      </div>

      <div className="mt-2 flex min-h-[20px] items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {isExtracting && (
            <span role="status" className="text-ink-muted">
              Reading your resume…
            </span>
          )}
          {!isExtracting && extracted && fileName && (
            <span role="status" className="flex items-center gap-1 text-ink-muted">
              <CheckCircle2 size={13} className="text-verdict-defended-fg" aria-hidden="true" />
              Resume text extracted successfully from
              <span className="inline-flex items-center gap-1 font-medium text-ink-secondary">
                <FileText size={12} aria-hidden="true" />
                {fileName}
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="ml-1 inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                <X size={12} aria-hidden="true" />
                Replace
              </button>
            </span>
          )}
          {error && (
            <span role="alert" className="text-ink-secondary">
              {error}
            </span>
          )}
        </div>
        <span className="text-ink-subtle">{value.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
};
