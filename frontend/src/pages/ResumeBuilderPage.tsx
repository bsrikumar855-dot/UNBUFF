import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileCheck2, Hammer, MessagesSquare, Save } from "lucide-react";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { cn } from "@/lib/cn";
import { mentorResumeUrl, pdfUrl, RATING_LABEL, RESUME_STARTERS, scoreTone, STATUS_LABEL } from "@/lib/resume";
import type { AtsResult, ResumeCompileResponse, ResumeTemplate, RoleSummary } from "@/types/contract";

const SCORE_DEBOUNCE_MS = 1200;
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
    <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label={`ATS score ${score} out of 100`}>
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
      <div className="flex items-center gap-5">
        <ScoreRing score={ats.score} />
        <div>
          <p className="eyebrow text-ink-muted">Your UNBLUFF ATS score</p>
          <p className="serif text-2xl text-ink-primary" aria-live="polite">
            {RATING_LABEL[ats.rating]}
          </p>
          <p className="mt-1 text-xs leading-snug text-ink-secondary">{ats.disclaimer}</p>
        </div>
      </div>

      <ul aria-label="ATS checks" className="mt-5 divide-y divide-line border-y border-line">
        {ats.checks.map((c) => (
          <li key={c.id} className="py-3" data-check={c.id} data-status={c.status}>
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
            <p className="mt-1 text-sm text-ink-secondary">{c.detail}</p>
            {c.fix && <p className="mt-1 text-sm text-ink-primary">Fix: {c.fix}</p>}
          </li>
        ))}
      </ul>

      <section aria-labelledby="kw-heading" className="mt-5">
        <h3 id="kw-heading" className="eyebrow text-ink-primary">
          Keywords
        </h3>
        <p className="mt-1 text-xs text-ink-muted">
          Add a missing keyword only where it is true, in a project or role that shows it.
        </p>
        <p className="mt-3 text-xs font-medium text-ink-secondary">Found</p>
        <Chips items={ats.keywords.matched} tone="have" empty="None measured yet. Pick a target role or paste a job description." />
        <p className="mt-3 text-xs font-medium text-ink-secondary">Not found</p>
        <Chips items={ats.keywords.missing} tone="miss" empty="Nothing missing." />
      </section>
    </div>
  );
};

export const ResumeBuilderPage: React.FC = () => {
  const navigate = useNavigate();
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

  const [tab, setTab] = useState<"ats" | "pdf">("ats");
  const [compiling, setCompiling] = useState(false);
  const [build, setBuild] = useState<(ResumeCompileResponse & { url: string | null }) | null>(null);
  const [buildError, setBuildError] = useState<unknown>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const urlRef = useRef<string | null>(null);

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

  // ---- release the PDF's blob URL
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const dirty = saved === null || saved.latex !== latex || saved.roleId !== roleId || saved.jd !== jd;
  const bytes = useMemo(() => new TextEncoder().encode(latex).length, [latex]);
  const tooLarge = bytes > maxBytes;

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

  const compile = useCallback(async () => {
    setCompiling(true);
    setBuildError(null);
    try {
      const r = await api.compileResume({ latex });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = r.ok && r.pdf_base64 ? pdfUrl(r.pdf_base64) : null;
      urlRef.current = url;
      setBuild({ ...r, url });
      setTab("pdf");
    } catch (e) {
      setBuildError(e);
      setTab("pdf");
    } finally {
      setCompiling(false);
    }
  }, [latex]);

  const askMentor = async () => {
    if (dirty && !(await save())) return; // the mentor reads the saved résumé, so save first
    navigate(mentorResumeUrl(RESUME_STARTERS[0]));
  };

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (latex.trim() !== "" && latex !== t.latex && !window.confirm("Replace what is in the editor with this template?")) return;
    setLatex(t.latex);
    setFromTemplate(true);
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

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Evidence"
        title="Résumé builder"
        description="Write your résumé in LaTeX, build the PDF, and see your ATS score with specific fixes. The AI mentor can read the saved résumé and help you improve it."
        actions={
          <Button onClick={() => void askMentor()} disabled={saving || latex.trim() === "" || tooLarge}>
            <MessagesSquare size={16} aria-hidden="true" />
            {dirty ? "Save and ask the AI mentor" : "Ask the AI mentor"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------- editor ---------------- */}
        <section aria-labelledby="editor-heading" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="editor-heading" className="eyebrow text-ink-primary">
              LaTeX source
            </h2>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              Template
              <select
                aria-label="Start from a template"
                value=""
                onChange={(e) => applyTemplate(e.target.value)}
                className="min-h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink-primary"
              >
                <option value="">Choose…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {fromTemplate && (
            <p className="mt-2 text-xs text-ink-muted">
              This is a starter template with placeholder details. Replace them with your own, then save.
            </p>
          )}
          <textarea
            aria-label="LaTeX source"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            spellCheck={false}
            rows={26}
            className="mt-2 block w-full resize-y rounded-md border border-line-strong bg-surface p-3 font-mono text-sm leading-relaxed text-ink-primary"
          />
          <p className={cn("mt-1 text-xs", tooLarge ? "text-verdict-bluff-fg" : "text-ink-muted")}>
            {bytes.toLocaleString()} / {maxBytes.toLocaleString()} bytes
            {tooLarge ? ": too large to save or build." : ""}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-ink-primary">
              Target role
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="mt-1 block min-h-10 w-full rounded-md border border-line-strong bg-surface px-2 text-sm font-normal"
              >
                <option value="">No target role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-primary">Job description (optional)</summary>
            <label className="mt-2 block text-xs text-ink-muted" htmlFor="jd">
              Paste a job posting to score your keywords against it. It is saved with your résumé and never shared.
            </label>
            <textarea
              id="jd"
              value={jd}
              maxLength={MAX_JD}
              onChange={(e) => setJd(e.target.value)}
              rows={6}
              className="mt-1 block w-full rounded-md border border-line-strong bg-surface p-2 text-sm text-ink-primary"
            />
          </details>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => void save()} disabled={saving || !dirty || latex.trim() === "" || tooLarge} variant="outline">
              <Save size={16} aria-hidden="true" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button onClick={() => void compile()} disabled={compiling || latex.trim() === "" || tooLarge}>
              <Hammer size={16} aria-hidden="true" />
              {compiling ? "Building…" : "Build PDF"}
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadTex} disabled={latex.trim() === ""}>
              <Download size={16} aria-hidden="true" />
              Download .tex
            </Button>
            <span role="status" className="text-xs text-ink-muted">
              {saved ? (dirty ? "Unsaved changes" : `Saved ${new Date(saved.at).toLocaleString()}`) : "Not saved yet"}
            </span>
          </div>
          {saveError !== null && <ErrorState className="mt-3" error={saveError} />}
        </section>

        {/* ---------------- score and preview ---------------- */}
        <section aria-label="Score and preview" className="min-w-0">
          <div role="tablist" aria-label="Score or PDF" className="flex gap-1 border-b border-line">
            {(
              [
                ["ats", "ATS score", FileCheck2],
                ["pdf", "PDF preview", Hammer],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium",
                  tab === id ? "border-redline text-ink-primary" : "border-transparent text-ink-muted hover:text-ink-primary"
                )}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="pt-5">
            {tab === "ats" ? (
              <AtsPanel ats={ats} scoring={scoring} error={atsError} />
            ) : buildError !== null ? (
              <ErrorState error={buildError} />
            ) : build === null ? (
              <p className="text-sm text-ink-secondary">
                {compilerAvailable
                  ? "Press Build PDF to compile your LaTeX and preview the result here."
                  : "This server has no LaTeX compiler configured, so the PDF cannot be built here. You can still edit, save and check your ATS score, and download the .tex to compile it yourself."}
              </p>
            ) : build.ok && build.url ? (
              <div>
                <iframe title="Résumé PDF preview" src={build.url} className="h-[70vh] w-full rounded-md border border-line" />
                <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                  <span>
                    {build.pages ?? "?"} page{build.pages === 1 ? "" : "s"} · built in {build.duration_ms} ms
                  </span>
                  <a href={build.url} download="resume.pdf" className="underline underline-offset-4 hover:text-redline">
                    Download PDF
                  </a>
                </p>
              </div>
            ) : (
              <div role="alert">
                <p className="font-medium text-ink-primary">The PDF could not be built.</p>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-3 font-mono text-xs text-ink-primary">
                  {build.log || "No message was produced."}
                </pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </Page>
  );
};

export default ResumeBuilderPage;
