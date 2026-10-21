import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { m } from "motion/react";
import {
  Download,
  FileText,
  Gauge,
  Hammer,
  LayoutGrid,
  MessagesSquare,
  Save,
  Settings,
  Sparkles,
  Target,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { SPRING_GLIDE } from "@/components/motion/ease";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PdfPreview } from "@/components/resume/PdfPreview";
import { GLASS, GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page } from "@/components/ui/Page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const ScoreRing: React.FC<{ score: number; className?: string }> = ({
  score,
  className,
}) => {
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-24 shrink-0", className)}
      role="img"
      aria-label={`ATS score ${score} out of 100`}
    >
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
      <text
        x="50"
        y="52"
        textAnchor="middle"
        className="fill-ink-primary font-mono text-[26px] font-semibold"
      >
        {score}
      </text>
      <text x="50" y="68" textAnchor="middle" className="fill-ink-muted text-[9px]">
        / 100
      </text>
    </svg>
  );
};

const Chips: React.FC<{ items: string[]; tone: "have" | "miss"; empty: string }> = ({
  items,
  tone,
  empty,
}) =>
  items.length === 0 ? (
    <p className="text-xs text-ink-muted">{empty}</p>
  ) : (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <li
          key={k}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs",
            tone === "have"
              ? "border-verdict-defended-fg text-ink-primary"
              : "border-line-strong text-ink-secondary"
          )}
        >
          {k}
        </li>
      ))}
    </ul>
  );

const AtsPanel: React.FC<{ ats: AtsResult | null; scoring: boolean; error: unknown }> = ({
  ats,
  scoring,
  error,
}) => {
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

      <ul aria-label="ATS checks" className="mt-4 flex flex-col gap-2.5">
        {ats.checks.map((c) => (
          <li
            key={c.id}
            className={cn(TILE, "p-3.5")}
            data-check={c.id}
            data-status={c.status}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-ink-primary">{c.label}</span>
              <span className="flex items-center gap-2 text-sm">
                <span className="font-mono text-ink-secondary">
                  {c.score}/{c.max}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    STATUS_STYLE[c.status]
                  )}
                >
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
        <p className="mt-0.5 text-xs text-ink-muted">
          Add a missing keyword only where it is true, in a project or role that shows it.
        </p>
        <p className="mt-2 text-xs font-medium text-ink-secondary">Found</p>
        <Chips
          items={ats.keywords.matched}
          tone="have"
          empty="None measured yet. Pick a target role or paste a job description."
        />
        <p className="mt-2 text-xs font-medium text-ink-secondary">Not found</p>
        <Chips items={ats.keywords.missing} tone="miss" empty="Nothing missing." />
      </section>
    </div>
  );
};

const TABS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "editor", label: "LaTeX Editor", icon: FileText },
  { value: "templates", label: "Templates", icon: LayoutGrid },
  { value: "ai", label: "AI Suggestions", icon: Sparkles },
  { value: "ats", label: "ATS Score", icon: Gauge },
  { value: "settings", label: "Settings", icon: Settings },
];

/** The target role. It is used by both the editor and the settings view, but only one of them is on screen at a time. */
const RoleSelect: React.FC<{
  roles: RoleSummary[];
  value: string;
  onChange: (v: string) => void;
}> = ({ roles, value, onChange }) => (
  <label className="block text-sm font-medium text-ink-primary">
    Target role
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 block min-h-10 w-full rounded-xl border border-line-strong bg-white/70 px-3 text-sm font-normal"
    >
      <option value="">No target role</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  </label>
);

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
  const gutter = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("editor");

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
  const [saved, setSaved] = useState<{
    latex: string;
    roleId: string;
    jd: string;
    at: string;
  } | null>(null);
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
          setSaved({
            latex: r.document.latex,
            roleId: r.document.role_id ?? "",
            jd: r.document.job_description ?? "",
            at: r.document.updated_at,
          });
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
        .scoreResume({
          latex,
          role_id: roleId || null,
          job_description: jd.trim() || null,
        })
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
  const dirty =
    saved === null || saved.latex !== latex || saved.roleId !== roleId || saved.jd !== jd;

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
      const r = await api.saveResume({
        latex,
        role_id: roleId || null,
        job_description: jd.trim() || null,
      });
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

  const askMentor = async (starter?: string) => {
    if (dirty && !(await save())) return; // the mentor reads the saved résumé, so save first
    navigate(mentorResumeUrl(starter ?? RESUME_STARTERS[0]));
  };

  /** Replacing the editor is only silent when it holds nothing the student could lose. */
  const okToReplace = (): boolean => {
    const untouched =
      latex.trim() === "" || fromTemplate || (saved !== null && saved.latex === latex);
    return (
      untouched ||
      window.confirm("Replace what is in the editor? Your unsaved changes will be lost.")
    );
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
    const kind =
      lower.endsWith(".pdf") || file.type === "application/pdf"
        ? "pdf"
        : lower.endsWith(".tex")
          ? "tex"
          : lower.endsWith(".txt")
            ? "txt"
            : null;
    if (kind === null)
      return setImportMessage("Choose a PDF, a .tex file or a .txt file.");
    if (file.size > (kind === "pdf" ? MAX_PDF_BYTES : MAX_TEXT_FILE_BYTES)) {
      return setImportMessage(
        kind === "pdf"
          ? "That PDF is larger than 5 MB."
          : "That file is larger than 100 KB."
      );
    }
    if (!okToReplace()) return;

    setImporting(true);
    try {
      if (kind === "tex") {
        const source = await readTextFile(file);
        if (new TextEncoder().encode(source).length > maxBytes)
          return setImportMessage("That LaTeX file is too large to open here.");
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

  if (loadError !== null)
    return (
      <Page width="fluid">
        <ErrorState error={loadError} onRetry={() => setAttempt((a) => a + 1)} />
      </Page>
    );
  if (loading)
    return (
      <Page width="fluid">
        <LoadingState message="Opening your résumé…" />
      </Page>
    );

  const uploadMessage = importMessage ?? pdfError; // wording we wrote ourselves
  const uploadError = importError ?? (uploadMessage ? new Error(uploadMessage) : null);
  const lineCount = latex.split("\n").length;
  const canBuild = !compiling && latex.trim() !== "" && !tooLarge;

  return (
    <Page width="fluid" className="py-5 sm:px-5 sm:py-6 lg:pl-5 lg:pr-6">
      {/* ---------------- header and toolbar ---------------- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="serif text-title font-medium leading-tight text-ink-primary">
            Résumé <em>builder</em>
          </h1>
          <p className="mt-1 text-ink-secondary">
            Edit the LaTeX, watch the PDF update, and fix what the ATS score flags.
          </p>
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
          <Button
            variant="outline"
            className="rounded-full bg-white/70"
            onClick={() => fileInput.current?.click()}
            disabled={importing || isExtracting}
          >
            <Upload size={15} aria-hidden="true" />
            {importing || isExtracting ? "Reading…" : "Upload existing résumé"}
          </Button>
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <span className="sr-only sm:not-sr-only">Template</span>
            <select
              aria-label="Start from a template"
              value=""
              onChange={(e) => applyTemplate(e.target.value)}
              className="min-h-10 rounded-full border border-line-strong bg-white/70 px-4 text-sm text-ink-primary"
            >
              <option value="">Template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="rounded-full"
            onClick={() => void askMentor()}
            disabled={saving || latex.trim() === "" || tooLarge}
          >
            <Sparkles size={15} aria-hidden="true" />
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
        <section aria-label="Upload result" className={cn(TILE, "mb-4 p-4 text-sm")}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-ink-primary">
              {notice.sections.length > 0 ? (
                <>
                  <strong>{notice.filename}</strong> was converted to LaTeX. Sections
                  found: {notice.sections.join(", ")}.
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
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
              className="rounded-full p-1.5 text-ink-muted hover:text-ink-primary"
            >
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          aria-label="Résumé builder sections"
          className={cn(
            GLASS,
            "mb-5 flex h-auto w-full flex-wrap justify-start gap-1 p-2 text-ink-secondary"
          )}
        >
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="relative isolate min-h-11 gap-2 rounded-full px-5 text-sm data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-ink-primary data-[state=active]:shadow-none"
            >
              {tab === t.value && (
                <m.span
                  aria-hidden="true"
                  layoutId="resume-tab-pill"
                  transition={SPRING_GLIDE}
                  className="absolute inset-0 -z-10 rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.35)]"
                />
              )}
              <t.icon
                size={17}
                strokeWidth={1.75}
                aria-hidden="true"
                className={tab === t.value ? "text-redline" : "text-ink-muted"}
              />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* ---------------- left: the section chosen above ---------------- */}
          <div className="min-w-0">
            <TabsContent
              value="editor"
              className="mt-0 space-y-5 focus-visible:outline-hidden"
            >
              <GlassCard
                id="editor"
                icon={FileText}
                title="LaTeX Source"
                sub="Edit your LaTeX code. Use the templates or upload your existing résumé to get started."
                actions={
                  <p
                    className={cn(
                      "text-xs",
                      tooLarge ? "text-verdict-bluff-fg" : "text-ink-muted"
                    )}
                  >
                    {bytes.toLocaleString()} / {maxBytes.toLocaleString()} bytes
                    {tooLarge ? ": too large to save or build." : ""}
                  </p>
                }
              >
                {fromTemplate && (
                  <p className="mb-3 text-xs text-ink-muted">
                    This is a starter template with placeholder details. Replace them with
                    your own, or upload your existing résumé above.
                  </p>
                )}
                <div className="flex h-[26rem] overflow-hidden rounded-2xl border border-line-strong bg-white/75 lg:h-[calc(100vh-27rem)] lg:min-h-[22rem]">
                  <div
                    ref={gutter}
                    aria-hidden="true"
                    className="select-none overflow-hidden border-r border-line bg-white/60 py-3 pl-3 pr-3 text-right font-mono text-[13px] leading-5 text-ink-muted"
                  >
                    {Array.from({ length: lineCount }, (_v, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    aria-label="LaTeX source"
                    value={latex}
                    onChange={(e) => {
                      setLatex(e.target.value);
                      setFromTemplate(false); // it is the student's text now: replacing it must ask
                    }}
                    onScroll={(e) => {
                      if (gutter.current)
                        gutter.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                    wrap="off"
                    spellCheck={false}
                    className="block h-full min-w-0 flex-1 resize-none whitespace-pre bg-transparent p-3 font-mono text-[13px] leading-5 text-ink-primary outline-none"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => void save()}
                    disabled={saving || !dirty || latex.trim() === "" || tooLarge}
                    className="rounded-full"
                  >
                    <Save size={15} aria-hidden="true" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full bg-white/70"
                    onClick={downloadTex}
                    disabled={latex.trim() === ""}
                  >
                    <Download size={15} aria-hidden="true" />
                    Download .tex
                  </Button>
                  <span role="status" className="text-xs text-ink-muted">
                    {saved
                      ? dirty
                        ? "Unsaved changes"
                        : `Saved ${new Date(saved.at).toLocaleString()}`
                      : "Not saved yet"}
                  </span>
                </div>
                {saveError !== null && <ErrorState className="mt-3" error={saveError} />}
              </GlassCard>

              <section
                aria-label="Target and score"
                className="grid items-stretch gap-4 sm:grid-cols-2"
              >
                <div className={cn(GLASS, "p-5")}>
                  <RoleSelect roles={roles} value={roleId} onChange={setRoleId} />
                  {roleId === "" && (
                    <p className="mt-2 flex items-start gap-2 text-xs text-ink-muted">
                      <Target
                        size={14}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-redline"
                      />
                      <span>
                        Set a target role to get personalised AI suggestions and ATS
                        feedback.
                      </span>
                    </p>
                  )}
                </div>
                <div className={cn(GLASS, "p-5")}>
                  {ats ? (
                    <div className="flex items-center gap-4" aria-busy={scoring}>
                      <ScoreRing score={ats.score} className="size-[4.5rem]" />
                      <div className="min-w-0">
                        <p className="eyebrow text-ink-muted">Your UNBLUFF ATS score</p>
                        <p className="serif text-xl text-ink-primary" aria-live="polite">
                          {RATING_LABEL[ats.rating]}
                        </p>
                        <button
                          type="button"
                          onClick={() => setTab("ats")}
                          className="mt-0.5 text-sm text-redline underline underline-offset-4"
                        >
                          See every check →
                        </button>
                      </div>
                    </div>
                  ) : atsError !== null ? (
                    <ErrorState error={atsError} />
                  ) : (
                    <p className="text-sm text-ink-secondary">Scoring your résumé…</p>
                  )}
                  {ats && (
                    <p className="mt-3 text-[11px] leading-snug text-ink-muted">
                      {ats.disclaimer}
                    </p>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="templates" className="mt-0 focus-visible:outline-hidden">
              <GlassCard
                id="templates"
                icon={LayoutGrid}
                title="Templates"
                sub="Start from a layout. It replaces what is in the editor, and asks first if you would lose unsaved work."
              >
                <ul aria-label="Templates" className="grid gap-3 md:grid-cols-2">
                  {templates.map((t) => (
                    <li key={t.id} className={cn(TILE, "flex flex-col gap-2 p-4")}>
                      <p className="font-semibold text-ink-primary">{t.name}</p>
                      <p className="text-sm text-ink-secondary">{t.description}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-auto w-fit rounded-full bg-white/80"
                        onClick={() => {
                          applyTemplate(t.id);
                          setTab("editor");
                        }}
                      >
                        Use this template
                        <span className="sr-only">{`: ${t.name}`}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </TabsContent>

            <TabsContent value="ai" className="mt-0 focus-visible:outline-hidden">
              <GlassCard
                id="ai"
                icon={Sparkles}
                title="AI suggestions"
                sub="The AI mentor reads the résumé you saved (unsaved changes are saved first) and your ATS score. Pick a question to start."
              >
                <ul
                  aria-label="Questions for the AI mentor"
                  className="flex flex-col gap-3"
                >
                  {RESUME_STARTERS.map((q) => (
                    <li
                      key={q}
                      className={cn(
                        TILE,
                        "flex flex-wrap items-center justify-between gap-3 p-4"
                      )}
                    >
                      <p className="min-w-0 flex-1 text-sm text-ink-primary">{q}</p>
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={saving || latex.trim() === "" || tooLarge}
                        onClick={() => void askMentor(q)}
                      >
                        <MessagesSquare size={14} aria-hidden="true" />
                        Ask the mentor
                        <span className="sr-only">{`: ${q}`}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-ink-muted">
                  The mentor suggests wording and keywords; it does not know any
                  employer's system and cannot promise a result.
                </p>
              </GlassCard>
            </TabsContent>

            <TabsContent value="ats" className="mt-0 focus-visible:outline-hidden">
              <GlassCard
                id="ats"
                icon={Gauge}
                title="ATS score"
                sub="Every check behind the score, what to fix, and which keywords were found."
              >
                <AtsPanel ats={ats} scoring={scoring} error={atsError} />
              </GlassCard>
            </TabsContent>

            <TabsContent value="settings" className="mt-0 focus-visible:outline-hidden">
              <GlassCard
                id="settings"
                icon={Settings}
                title="Settings"
                sub="What your résumé is scored against. Both are saved with your résumé and never shared."
              >
                <div className="grid gap-5">
                  <RoleSelect roles={roles} value={roleId} onChange={setRoleId} />
                  <div>
                    <label className="text-sm font-medium text-ink-primary" htmlFor="jd">
                      Job description (optional)
                    </label>
                    <p className="mb-1.5 mt-0.5 text-xs text-ink-muted" id="jd-help">
                      Paste a job posting to score your keywords against it. It is saved
                      with your résumé and never shared.
                    </p>
                    <textarea
                      id="jd"
                      aria-describedby="jd-help"
                      value={jd}
                      maxLength={MAX_JD}
                      onChange={(e) => setJd(e.target.value)}
                      rows={10}
                      className="block w-full rounded-2xl border border-line-strong bg-white/70 p-3 text-sm text-ink-primary"
                    />
                  </div>
                </div>
              </GlassCard>
            </TabsContent>
          </div>

          {/* ---------------- right: the PDF, always in view ---------------- */}
          <section
            aria-label="PDF preview"
            className={cn(
              GLASS,
              "min-w-0 p-4 lg:sticky lg:top-4 lg:w-[max(24rem,calc((100vh-13rem)/1.4142+2rem))]"
            )}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.35)]"
                >
                  <FileText size={18} strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <h2 className="serif text-lg font-medium leading-tight text-ink-primary">
                    PDF Preview
                  </h2>
                  <p className="text-xs text-ink-muted" aria-live="polite">
                    {compiling
                      ? "Building…"
                      : pdf
                        ? `${pdf.pages ?? "?"} page${pdf.pages === 1 ? "" : "s"} · built in ${pdf.ms} ms`
                        : "Updates as you edit"}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-2">
                {compilerAvailable && (
                  <button
                    type="button"
                    onClick={() => void runBuild(latex)}
                    disabled={!canBuild}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-white/80 px-3 text-xs font-medium text-ink-primary hover:border-ink-primary disabled:opacity-50"
                  >
                    <Hammer size={13} aria-hidden="true" />
                    Rebuild
                  </button>
                )}
                {pdf && (
                  <a
                    href={pdf.url}
                    download="resume.pdf"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-white/80 px-3 text-xs font-medium text-ink-primary hover:border-ink-primary"
                  >
                    <Download size={13} aria-hidden="true" />
                    Download PDF
                  </a>
                )}
              </span>
            </div>
            <div className="h-[34rem] overflow-hidden rounded-2xl border border-line bg-white lg:h-[calc(100vh-13rem)]">
              {pdf ? (
                <PdfPreview
                  base64={pdf.base64}
                  fallbackUrl={pdf.url}
                  title="Résumé PDF preview"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-ink-secondary">
                  <span
                    aria-hidden="true"
                    className="grid size-20 place-items-center rounded-full bg-surface-100 text-redline"
                  >
                    <FileText size={34} strokeWidth={1.4} />
                  </span>
                  {!compilerAvailable ? (
                    <>
                      <p className="text-base font-medium text-ink-primary">
                        This server has no LaTeX compiler configured, so the PDF cannot be
                        built here.
                      </p>
                      <p>
                        You can still edit, save and check your ATS score, and download
                        the .tex file to compile it yourself.
                      </p>
                      <div className="flex w-full max-w-xs flex-col gap-2">
                        <Button
                          className="rounded-full"
                          onClick={downloadTex}
                          disabled={latex.trim() === ""}
                        >
                          <Download size={15} aria-hidden="true" />
                          Download .tex file
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-full bg-white"
                          onClick={() => fileInput.current?.click()}
                          disabled={importing || isExtracting}
                        >
                          <Upload size={15} aria-hidden="true" />
                          Upload an existing résumé
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p>
                      {buildError !== null
                        ? "The preview could not be built."
                        : buildLog !== null
                          ? "The PDF could not be built. The messages are below."
                          : "Building your PDF…"}
                    </p>
                  )}
                </div>
              )}
            </div>
            {buildError !== null && <ErrorState className="mt-2" error={buildError} />}
            {buildLog !== null && (
              <div role="alert" className="mt-3">
                <p className="text-sm font-medium text-ink-primary">
                  {pdf
                    ? "The last build failed; the preview above is the previous one."
                    : "The PDF could not be built."}
                </p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white/70 p-2 font-mono text-xs text-ink-primary">
                  {buildLog}
                </pre>
              </div>
            )}
          </section>
        </div>
      </Tabs>
    </Page>
  );
};

export default ResumeBuilderPage;
