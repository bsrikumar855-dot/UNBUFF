import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  BarChart3,
  Bookmark,
  Building2,
  Code2,
  ExternalLink,
  MessageCircle,
  SquareCode,
} from "lucide-react";
import { Swap } from "@/components/motion/Marks";
import { api } from "@/api/endpoints";
import type { DsaStatus, QuestionDetailResponse } from "@/types/contract";
import { DifficultyBadge, SourceBanner, TopicTags } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/button";
import { GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useDsaProgress } from "@/hooks/useDsaProgress";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/dsa";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

const MAX_NOTES = 5000;

/** Question details: verified metadata, a link to the original problem (never a copy), and personal progress. */
const DsaQuestionPage: React.FC = () => {
  const { questionId = "" } = useParams<{ questionId: string }>();
  const location = useLocation();
  const [data, setData] = useState<QuestionDetailResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const progress = useDsaProgress();
  const mine = progress.byQuestion.get(questionId);

  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getQuestion(questionId)
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [questionId, attempt]);

  // Load the stored note once the record arrives, without clobbering what the student is typing.
  useEffect(() => {
    if (!notesDirty) setNotes(mine?.notes ?? "");
  }, [mine?.notes, notesDirty]);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(""), 2500);
  };

  const changeStatus = async (status: DsaStatus) => {
    if (await progress.update(questionId, { status })) flash("Status saved");
  };
  const toggleBookmark = async () => {
    if (await progress.update(questionId, { bookmarked: !(mine?.bookmarked ?? false) }))
      flash(mine?.bookmarked ? "Bookmark removed" : "Bookmarked");
  };
  const saveNotes = async () => {
    if (await progress.update(questionId, { notes })) {
      setNotesDirty(false);
      flash("Notes saved");
    }
  };

  const backTo =
    (location.state as { from?: string } | null)?.from ?? routes.dsaQuestions;
  const pill = "rounded-full";

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      {error !== null && (
        <>
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
            <Link to={routes.dsa} className="underline underline-offset-4 hover:text-ink-primary">
              DSA Arena
            </Link>{" "}
            /{" "}
            <Link to={backTo} className="underline underline-offset-4 hover:text-ink-primary">
              Questions
            </Link>
          </nav>
          <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
        </>
      )}
      {error === null && data === null && (
        <>
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
            <Link to={routes.dsa} className="underline underline-offset-4 hover:text-ink-primary">
              DSA Arena
            </Link>{" "}
            /{" "}
            <Link to={backTo} className="underline underline-offset-4 hover:text-ink-primary">
              Questions
            </Link>
          </nav>
          <LoadingState message="Loading question…" />
        </>
      )}

      {data && (
        <>
          <PageHeader
            crumbs={[
              { label: "DSA Arena", to: routes.dsa },
              { label: "Questions", to: backTo },
            ]}
            title={data.question.title}
          />
          <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <DifficultyBadge difficulty={data.question.difficulty} />
            <TopicTags topics={data.question.topics} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="flex min-w-0 flex-col gap-5">
              <GlassCard
                id="practice"
                icon={Code2}
                title="Practice"
                sub="Open the problem, then work on it in the coding workspace."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to={routes.dsaCode(data.question.id)}
                    className={buttonClasses("primary", "md", pill)}
                  >
                    <SquareCode aria-hidden="true" />
                    Open code workspace
                  </Link>
                  {data.question.url !== null && (
                    <a
                      href={data.question.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
                    >
                      Open original problem
                      <ExternalLink size={16} aria-hidden="true" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                  <Link
                    to={routes.mentor(data.question.id)}
                    className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
                  >
                    <MessageCircle aria-hidden="true" />
                    Ask the AI mentor about this question
                  </Link>
                </div>
                {data.question.url === null && (
                  <p className={cn(TILE, "mt-4 px-4 py-3 text-sm text-ink-secondary")}>
                    First-party practice problem written for UNBLUFF (not a company
                    interview question). Its statement is in the coding workspace.
                  </p>
                )}
              </GlassCard>

              <GlassCard
                id="companies"
                icon={Building2}
                title="Associated companies"
                sub={
                  data.companies.length === 0
                    ? undefined
                    : `Asked at ${data.companies.length} compan${data.companies.length === 1 ? "y" : "ies"} in the catalogue.`
                }
              >
                {data.companies.length === 0 ? (
                  <p className="text-sm text-ink-secondary">None recorded.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {data.companies.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={routes.dsaCompany(c.id)}
                          className={cn(
                            TILE,
                            "inline-flex rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-primary transition-colors hover:bg-white hover:text-redline"
                          )}
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </GlassCard>

              <SourceBanner source={data.source} />
            </div>

            <GlassCard
              id="progress"
              icon={BarChart3}
              title="Your progress"
              sub="Self-reported. Only you can see it."
              className="lg:sticky lg:top-4"
            >
              {progress.authLoading && <LoadingState message="Checking your sign-in…" />}
              {!progress.authLoading && !progress.signedIn && (
                <p className="text-sm text-ink-secondary">
                  <Link
                    to={routes.login}
                    state={{ from: `${location.pathname}${location.search}` }}
                    className="text-redline underline"
                  >
                    Sign in
                  </Link>{" "}
                  to save your status, bookmark and notes for this question.
                </p>
              )}

              {progress.signedIn && (
                <div className="flex flex-col gap-5">
                  {progress.error !== null && (
                    <ErrorState
                      error={progress.error}
                      onRetry={() => void progress.reload()}
                    />
                  )}

                  <fieldset>
                    <legend className="mb-2 text-sm font-semibold text-ink-primary">
                      Status
                    </legend>
                    <div
                      className="flex flex-wrap gap-2"
                      role="radiogroup"
                      aria-label="Status"
                    >
                      {STATUS_ORDER.map((s) => {
                        const selected = (mine?.status ?? "not_started") === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={progress.saving}
                            onClick={() => void changeStatus(s)}
                            className={cn(
                              "min-h-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                              selected
                                ? "bg-ink-primary text-surface-50"
                                : "border border-line-strong bg-white/70 text-ink-primary hover:bg-white"
                            )}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div>
                    <button
                      type="button"
                      aria-pressed={mine?.bookmarked ?? false}
                      disabled={progress.saving}
                      onClick={() => void toggleBookmark()}
                      className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
                    >
                      <Swap state={mine?.bookmarked ? "on" : "off"}>
                        <Bookmark
                          size={16}
                          className={mine?.bookmarked ? "fill-current text-redline" : ""}
                          aria-hidden="true"
                        />
                      </Swap>
                      {mine?.bookmarked ? "Bookmarked" : "Bookmark"}
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="dsa-notes"
                      className="mb-1.5 block text-sm font-semibold text-ink-primary"
                    >
                      Notes (private to you)
                    </label>
                    <textarea
                      id="dsa-notes"
                      rows={6}
                      maxLength={MAX_NOTES}
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        setNotesDirty(true);
                      }}
                      className="w-full rounded-2xl border border-line-strong bg-white/70 px-3.5 py-2.5 text-sm"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-ink-muted">
                        {notes.length}/{MAX_NOTES}
                      </span>
                      <Button
                        size="sm"
                        className={pill}
                        onClick={() => void saveNotes()}
                        disabled={progress.saving || !notesDirty}
                      >
                        {progress.saving ? "Saving…" : "Save notes"}
                      </Button>
                    </div>
                  </div>
                  <p
                    role="status"
                    aria-live="polite"
                    className="min-h-5 text-sm text-ink-secondary"
                  >
                    {saved}
                  </p>
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}
    </Page>
  );
};

export default DsaQuestionPage;
