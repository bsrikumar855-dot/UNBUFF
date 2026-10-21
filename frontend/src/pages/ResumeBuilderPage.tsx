import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Hammer, MessagesSquare, Save, Upload, X } from "lucide-react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PdfPreview } from "@/components/resume/PdfPreview";
import { Page } from "@/components/ui/Page";
import { usePdfExtractor } from "@/hooks/usePdfExtractor";
import { cn } from "@/lib/cn";
import {
  MAX_PDF_BYTES,
  MAX_TEXT_FILE_BYTES,
  mentorResumeUrl,
  pdfUrl,
  readTextFile,
  RATING_LABEL,
  RESUME_STARTERS,
  scoreTone,
  STATUS_LABEL,
} from "@/lib/resume";
import type { AtsResult, ResumeTemplate, RoleSummary } from "@/types/contract";

const SCORE_DEBOUNCE_MS = 1200;
const AUTO_BUILD_MS = 2200;
const MAX_JD = 8000;

const TONE: Record<ReturnType<typeof scoreTone>, string> = {
  good: "text-verdict-defended-fg",
  mid: "text-verdict-shaky-fg",
  low: "text-verdict-bluff-fg",
};
const STATUS_STYLE = {
  pass: "border-verdict-defended-fg text-ink-primary",
  warn: "border-verdict-shaky-fg text-ink-primary",
  fail: "border-verdict-bluff-fg text-ink-primary",
} as const;

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="size-24 shrink-0" role="img" aria-label={`ATS score ${score} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-line" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 50 50)"
        className={cn("stroke-current", TONE[scoreTone(score)])}
      />
      <text x="50" y="52" textAnchor="middle" className="fill-ink-primary font-mono text-[26px] font-semibold">
        {score}
      </text>
      <text x="50" y="68" textAnchor="middle" className="fill-ink-muted text-[9px]">
        / 100
      </text>
    </svg>
  );
};

const Chips: React.FC<{ items: string[]; tone: "have" | "miss"; empty: string }> = ({ items, tone, empty }) =>
  items.length === 0 ? (
    <p className="text-xs text-ink-muted">{empty}</p>
  ) : (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <li
          key={k}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            tone === "have" ? "border-verdict-defended-fg text-ink-primary" : "border-line-strong text-ink-secondary"
          )}
        >
          {k}
        </li>
      ))}
    </ul>
  );

const AtsPanel: React.FC<{ ats: AtsResult | null; scoring: boolean; error: unknown }> = ({ ats, scoring, error }) => {
  if (error !== null && ats === null) return <ErrorState error={error} />;
  if (ats === null) return <LoadingState message="Scoring your résumé…" />;
  return (
    <div aria-busy={scoring}>
      <div className="flex items-center gap-4">
        <ScoreRing score={ats.score} />
        <div>
          <p className="eyebrow text-ink-muted">Your UNBLUFF ATS score</p>
          <p className="serif text-2xl text-ink-primary" aria-live="polite">
            {RATING_LABEL[ats.rating]}
          </p>
          <p className="mt-1 text-xs leading-snug text-ink-secondary">{ats.disclaimer}</p>
        </div>
      </div>

      <ul aria-label="ATS checks" className="mt-4 divide-y divide-line border-y border-line">
        {ats.checks.map((c) => (
          <li key={c.id} className="py-2.5" data-check={c.id} data-status={c.status}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-ink-primary">{c.label}</span>
              <span className="flex items-center gap-2 text-sm">
                <span className="font-mono text-ink-secondary">
                  {c.score}/{c.max}
                </span>
                <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS_STYLE[c.status])}>
                  {STATUS_LABEL[c.status]}
                </span>
              </span>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">{c.detail}</p>
            {c.fix && <p className="mt-0.5 text-sm text-ink-primary">Fix: {c.fix}</p>}
          </li>
        ))}
      </ul>

      <section aria-labelledby="kw-heading" className="mt-4">
        <h3 id="kw-heading" className="eyebrow text-ink-primary">
          Keywords
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">Add a missing keyword only where it is true, in a project or role that shows it.</p>
        <p className="mt-2 text-xs font-medium text-ink-secondary">Found</p>
        <Chips items={ats.keywords.matched} tone="have" empty="None measured yet. Pick a target role or paste a job description." />
        <p className="mt-2 text-xs font-medium text-ink-secondary">Not found</p>
        <Chips items={ats.keywords.missing} tone="miss" empty="Nothing missing." />
      </section>
    </div>
  );
};

interface Pdf {
  url: string;
  base64: string;
  pages: number | null;
  ms: number;
}
interface ImportNotice {
  filename: string;
  sections: string[];
  warnings: string[];
}

export const ResumeBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const { extractText, isExtracting, error: pdfError, clearError } = usePdfExtractor();
  const fileInput = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [compilerAvailable, setCompilerAvailable] = useState(false);
  const [maxBytes, setMaxBytes] = useState(60_000);

  const [latex, setLatex] = useState("");
  const [roleId, setRoleId] = useState("");
  const [jd, setJd] = useState("");
  const [saved, setSaved] = useState<{ latex: string; roleId: string; jd: string; at: string } | null>(null);
  const [fromTemplate, setFromTemplate] = useState(false);

  const [ats, setAts] = useState<AtsResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [atsError, setAtsError] = useState<unknown>(null);

  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [buildLog, setBuildLog] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<unknown>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<unknown>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null); // our own wording for problems we detect before calling the server
  const [notice, setNotice] = useState<ImportNotice | null>(null);

  const urlRef = useRef<string | null>(null);
  const buildSeq = useRef(0);

  // ---- load the saved résumé, the templates and the roles
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([api.getResume(), api.getResumeTemplates(), api.getRoles()])
      .then(([r, t, ro]) => {
        if (cancelled) return;
        setTemplates(t.templates);
        setRoles(ro.roles);
        setCompilerAvailable(r.compiler_available);
        setMaxBytes(r.max_bytes);
        if (r.document) {
          setLatex(r.document.latex);
          setRoleId(r.document.role_id ?? "");
          setJd(r.document.job_description ?? "");
          setSaved({ latex: r.document.latex, roleId: r.document.role_id ?? "", jd: r.document.job_description ?? "", at: r.document.updated_at });
          setAts(r.ats);
        } else if (t.templates[0]) {
          setLatex(t.templates[0].latex);
          setFromTemplate(true);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // ---- live ATS score while editing (debounced; stale answers are ignored)
  const first = useRef(true);
  useEffect(() => {
    if (loading || latex.trim() === "") return;
    const skipNow = first.current && ats !== null; // the saved score loaded with the page is already current
    first.current = false;
    if (skipNow) return;
    let cancelled = false;
    setScoring(true);
    const id = setTimeout(() => {
      api
        .scoreResume({ latex, role_id: roleId || null, job_description: jd.trim() || null })
        .then((r) => {
          if (cancelled) return;
          setAts(r);
          setAtsError(null);
        })
        .catch((e: unknown) => !cancelled && setAtsError(e))
        .finally(() => !cancelled && setScoring(false));
    }, SCORE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setScoring(false);
    };
    // `ats` is intentionally not a dependency: only edits trigger scoring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex, roleId, jd, loading]);

  const bytes = useMemo(() => new TextEncoder().encode(latex).length, [latex]);
  const tooLarge = bytes > maxBytes;
  const dirty = saved === null || saved.latex !== latex || saved.roleId !== roleId || saved.jd !== jd;

  // ---- the PDF preview: built automatically, so it is always the current résumé. A failed build keeps the last good PDF.
  const runBuild = useCallback(async (source: string) => {
    const seq = ++buildSeq.current;
    setCompiling(true);
    setBuildError(null);
    try {
      const r = await api.compileResume({ latex: source });
      if (seq !== buildSeq.current) return;
      if (r.ok && r.pdf_base64) {
        const url = pdfUrl(r.pdf_base64);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setPdf({ url, base64: r.pdf_base64, pages: r.pages, ms: r.duration_ms });
        setBuildLog(null);
      } else {
        setBuildLog(r.log || "No message was produced.");
      }
    } catch (e) {
      if (seq === buildSeq.current) setBuildError(e);
    } finally {
      if (seq === buildSeq.current) setCompiling(false);
    }
  }, []);

  useEffect(() => {
    if (loading || !compilerAvailable || latex.trim() === "" || tooLarge) return;
    const id = setTimeout(() => void runBuild(latex), pdf === null ? 250 : AUTO_BUILD_MS);
    return () => clearTimeout(id);
    // Only edits (and the first load) trigger a build, not the build's own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex, loading, compilerAvailable, tooLarge, runBuild]);

  useEffect(
    () => () => {
      buildSeq.current++; // ignore anything still in flight
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await api.saveResume({ latex, role_id: roleId || null, job_description: jd.trim() || null });
      if (r.document) setSaved({ latex, roleId, jd, at: r.document.updated_at });
      if (r.ats) setAts(r.ats);
      setFromTemplate(false);
      return true;
    } catch (e) {
      setSaveError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [latex, roleId, jd]);

  const askMentor = async () => {
    if (dirty && !(await save())) return; // the mentor reads the saved résumé, so save first
    navigate(mentorResumeUrl(RESUME_STARTERS[0]));
  };

  /** Replacing the editor is only silent when it holds nothing the student could lose. */
  const okToReplace = (): boolean => {
    const untouched = latex.trim() === "" || fromTemplate || (saved !== null && saved.latex === latex);
    return untouched || window.confirm("Replace what is in the editor? Your unsaved changes will be lost.");
  };

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t || latex === t.latex) return;
    if (!okToReplace()) return;
    setLatex(t.latex);
    setFromTemplate(true);
    setNotice(null);
  };

  // ---- upload an existing résumé: a PDF (text is read in the browser), a .tex file, or a .txt file
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    setImportMessage(null);
    clearError();
    const name = file.name;
    const lower = name.toLowerCase();
    const kind = lower.endsWith(".pdf") || file.type === "application/pdf" ? "pdf" : lower.endsWith(".tex") ? "tex" : lower.endsWith(".txt") ? "txt" : null;
    if (kind === null) return setImportMessage("Choose a PDF, a .tex file or a .txt file.");
    if (file.size > (kind === "pdf" ? MAX_PDF_BYTES : MAX_TEXT_FILE_BYTES)) {
      return setImportMessage(kind === "pdf" ? "That PDF is larger than 5 MB." : "That file is larger than 100 KB.");
    }
    if (!okToReplace()) return;

    setImporting(true);
    try {
      if (kind === "tex") {
        const source = await readTextFile(file);
        if (new TextEncoder().encode(source).length > maxBytes) return setImportMessage("That LaTeX file is too large to open here.");
        setLatex(source);
        setNotice({ filename: name, sections: [], warnings: [] });
      } else {
        const text = kind === "pdf" ? await extractText(file) : await readTextFile(file);
        if (!text.trim()) return; // the PDF hook has already set its own message
        const r = await api.importResume({ text });
        setLatex(r.latex);
        setNotice({ filename: name, sections: r.sections, warnings: r.warnings });
      }
      setFromTemplate(false);
    } catch (e) {
      setImportError(e);
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = ""; // allow choosing the same file again
    }
  };

  const downloadTex = () => {
    const url = URL.createObjectURL(new Blob([latex], { type: "application/x-tex" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume.tex";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadError !== null) return <Page><ErrorState error={loadError} onRetry={() => setAttempt((a) => a + 1)} /></Page>;
  if (loading) return <Page><LoadingState message="Opening your résumé…" /></Page>;

  const uploadMessage = importMessage ?? pdfError; // wording we wrote ourselves
  const uploadError = importError ?? (uploadMessage ? new Error(uploadMessage) : null);

  return (
    <Page width="wide" className="py-5 sm:py-6">
      {/* ---------------- compact header and toolbar ---------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
        <div className="min-w-0">
          <h1 className="serif text-2xl font-medium text-ink-primary">Résumé builder</h1>
          <p className="text-sm text-ink-secondary">Edit the LaTeX, watch the PDF update, and fix what the ATS score flags.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.tex,.txt,application/pdf"
            className="sr-only"
            aria-label="Upload your existing résumé"
            tabIndex={-1}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={importing || isExtracting}>
            <Upload size={15} aria-hidden="true" />
            {importing || isExtracting ? "Reading…" : "Upload existing résumé"}
          </Button>
          <label className="flex items-center gap-1.5 text-sm text-ink-secondary">
            <span className="sr-only sm:not-sr-only">Template</span>
            <select
              aria-label="Start from a template"
              value=""
              onChange={(e) => applyTemplate(e.target.value)}
              className="min-h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink-primary"
            >
              <option value="">Template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" onClick={() => void askMentor()} disabled={saving || latex.trim() === "" || tooLarge}>
            <MessagesSquare size={15} aria-hidden="true" />
            {dirty ? "Save and ask the AI mentor" : "Ask the AI mentor"}
          </Button>
        </div>
      </div>

      {uploadError !== null && (
        <ErrorState
          className="mb-3"
          error={uploadError}
          message={importError === null && uploadMessage ? uploadMessage : undefined}
          onRetry={() => {
            setImportError(null);
            setImportMessage(null);
            clearError();
          }}
        />
      )}

      {notice && (
        <section aria-label="Upload result" className="mb-3 rounded-md border border-line-strong bg-surface p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-ink-primary">
              {notice.sections.length > 0 ? (
                <>
                  <strong>{notice.filename}</strong> was converted to LaTeX. Sections found: {notice.sections.join(", ")}.
                </>
              ) : notice.warnings.length === 0 ? (
                <>
                  Loaded <strong>{notice.filename}</strong> as it is.
                </>
              ) : (
                <>
                  <strong>{notice.filename}</strong> was converted to LaTeX.
                </>
              )}{" "}
              Edit anything below, then save.
            </p>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="rounded-sm p-1 text-ink-muted hover:text-ink-primary">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {notice.warnings.length > 0 && (
            <ul className="mt-1.5 list-disc pl-5 text-xs text-ink-secondary">
              {notice.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* ---------------- left: editor, then the score ---------------- */}
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="editor-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="editor-heading" className="eyebrow text-ink-primary">
                LaTeX source
              </h2>
              <p className={cn("text-xs", tooLarge ? "text-verdict-bluff-fg" : "text-ink-muted")}>
                {bytes.toLocaleString()} / {maxBytes.toLocaleString()} bytes
                {tooLarge ? ": too large to save or build." : ""}
              </p>
            </div>
            {fromTemplate && (
              <p className="mt-1 text-xs text-ink-muted">
                This is a starter template with placeholder details. Replace them with your own, or upload your existing résumé above.
              </p>
            )}
            <textarea
              aria-label="LaTeX source"
              value={latex}
              onChange={(e) => {
                setLatex(e.target.value);
                setFromTemplate(false); // it is the student's text now: replacing it must ask
              }}
              spellCheck={false}
              className="mt-1.5 block h-[26rem] w-full resize-y rounded-md border border-line-strong bg-surface p-3 font-mono text-sm leading-relaxed text-ink-primary lg:h-[calc(100vh-17rem)] lg:min-h-[24rem]"
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button onClick={() => void save()} disabled={saving || !dirty || latex.trim() === "" || tooLarge} variant="outline" size="sm">
                <Save size={15} aria-hidden="true" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadTex} disabled={latex.trim() === ""}>
                <Download size={15} aria-hidden="true" />
                Download .tex
              </Button>
              <span role="status" className="text-xs text-ink-muted">
                {saved ? (dirty ? "Unsaved changes" : `Saved ${new Date(saved.at).toLocaleString()}`) : "Not saved yet"}
              </span>
            </div>
            {saveError !== null && <ErrorState className="mt-2" error={saveError} />}
          </section>

          <section aria-label="Target" className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink-primary">
              Target role
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="mt-1 block min-h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm font-normal"
              >
                <option value="">No target role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <details className="sm:col-span-2" open={jd !== ""}>
              <summary className="cursor-pointer text-sm font-medium text-ink-primary">Job description (optional)</summary>
              <label className="mt-1.5 block text-xs text-ink-muted" htmlFor="jd">
                Paste a job posting to score your keywords against it. It is saved with your résumé and never shared.
              </label>
              <textarea
                id="jd"
                value={jd}
                maxLength={MAX_JD}
                onChange={(e) => setJd(e.target.value)}
                rows={5}
                className="mt-1 block w-full rounded-md border border-line-strong bg-surface p-2 text-sm text-ink-primary"
              />
            </details>
          </section>

          <section aria-label="ATS score">
            <AtsPanel ats={ats} scoring={scoring} error={atsError} />
          </section>
        </div>

        {/* ---------------- right: the PDF, and nothing else ---------------- */}
        {/* The column is as wide as an A4 page is at the pane's height, so the page fills it with no gutters; the editor gets the rest. */}
        <section aria-label="PDF preview" className="min-w-0 lg:sticky lg:top-4 lg:w-[max(22rem,calc((100vh-9rem)/1.4142))]">
          <div className="flex h-8 items-center justify-between gap-3 text-xs text-ink-muted">
            <span aria-live="polite">
              {compiling ? "Building…" : pdf ? `${pdf.pages ?? "?"} page${pdf.pages === 1 ? "" : "s"} · built in ${pdf.ms} ms` : "PDF preview"}
            </span>
            <span className="flex items-center gap-3">
              {compilerAvailable && (
                <button
                  type="button"
                  onClick={() => void runBuild(latex)}
                  disabled={compiling || latex.trim() === "" || tooLarge}
                  className="flex items-center gap-1 underline-offset-4 hover:text-ink-primary hover:underline disabled:opacity-50"
                >
                  <Hammer size={13} aria-hidden="true" />
                  Rebuild
                </button>
              )}
              {pdf && (
                <a href={pdf.url} download="resume.pdf" className="underline underline-offset-4 hover:text-redline">
                  Download PDF
                </a>
              )}
            </span>
          </div>
          <div className="h-[34rem] overflow-hidden rounded-md border border-line bg-white lg:h-[calc(100vh-9rem)]">
            {pdf ? (
              <PdfPreview base64={pdf.base64} fallbackUrl={pdf.url} title="Résumé PDF preview" />
            ) : (
              <div className="flex size-full items-center justify-center p-6 text-center text-sm text-ink-secondary">
                {!compilerAvailable
                  ? "This server has no LaTeX compiler configured, so the PDF cannot be built here. You can still edit, save and check your ATS score, and download the .tex to compile it yourself."
                  : buildError !== null
                    ? "The preview could not be built."
                    : buildLog !== null
                      ? "The PDF could not be built. The messages are below."
                      : "Building your PDF…"}
              </div>
            )}
          </div>
          {buildError !== null && <ErrorState className="mt-2" error={buildError} />}
          {buildLog !== null && (
            <div role="alert" className="mt-2">
              <p className="text-sm font-medium text-ink-primary">{pdf ? "The last build failed; the preview above is the previous one." : "The PDF could not be built."}</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-2 font-mono text-xs text-ink-primary">{buildLog}</pre>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
};

export default ResumeBuilderPage;
