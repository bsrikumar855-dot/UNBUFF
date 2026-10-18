import React, { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Bookmark, ExternalLink } from "lucide-react";
import { api } from "@/api/endpoints";
import type { DsaStatus, QuestionDetailResponse } from "@/types/contract";
import { DifficultyBadge, SourceBanner, TopicTags } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/Page";
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

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link
          to={routes.dsa}
          className="underline underline-offset-4 hover:text-ink-primary"
        >
          DSA Arena
        </Link>{" "}
        /{" "}
        <Link to={backTo} className="underline underline-offset-4 hover:text-ink-primary">
          Questions
        </Link>
      </nav>

      {error !== null && (
        <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
      )}
      {error === null && data === null && <LoadingState message="Loading question…" />}

      {data && (
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div>
            <h1 className="serif text-title font-medium text-ink-primary">
              {data.question.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <DifficultyBadge difficulty={data.question.difficulty} />
              <TopicTags topics={data.question.topics} />
            </div>

            <p className="mt-6 border-t border-line pt-4 text-sm text-ink-secondary">
              Associated companies:{" "}
              {data.companies.length === 0
                ? "none recorded"
                : data.companies.map((c, i) => (
                    <React.Fragment key={c.id}>
                      {i > 0 && ", "}
                      <Link
                        to={routes.dsaCompany(c.id)}
                        className="text-redline underline"
                      >
                        {c.name}
                      </Link>
                    </React.Fragment>
                  ))}
            </p>

            <p className="mt-6">
              {data.question.url !== null ? (
                <a
                  href={data.question.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("secondary", "md")}
                >
                  Open original problem
                  <ExternalLink size={16} aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : (
                <span className="text-sm text-ink-secondary">
                  First-party practice problem written for UNBLUFF (not a company
                  interview question). Its statement is in the coding workspace.
                </span>
              )}
            </p>
            <p className="mt-3">
              <Link
                to={routes.dsaCode(data.question.id)}
                className={buttonClasses("primary", "md")}
              >
                Open code workspace
              </Link>
            </p>
            <p className="mt-3">
              <Link
                to={routes.mentor(data.question.id)}
                className="text-sm text-redline underline underline-offset-4"
              >
                Ask the AI mentor about this question
              </Link>
            </p>
            <SourceBanner source={data.source} className="mt-8" />
          </div>

          <section
            aria-labelledby="progress-heading"
            className="border-t border-ink-primary pt-4 lg:self-start"
          >
            <h2
              id="progress-heading"
              className="mb-4 text-heading font-semibold text-ink-primary"
            >
              Your progress
            </h2>

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
                  <legend className="mb-2 text-sm font-medium text-ink-primary">
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
                            "min-h-10 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                            selected
                              ? "border-ink-primary bg-ink-primary text-surface-50"
                              : "border-line-strong bg-surface text-ink-primary hover:border-ink-primary"
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
                    className={buttonClasses("secondary", "md")}
                  >
                    <Bookmark
                      size={16}
                      className={mine?.bookmarked ? "fill-current text-redline" : ""}
                      aria-hidden="true"
                    />
                    {mine?.bookmarked ? "Bookmarked" : "Bookmark"}
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="dsa-notes"
                    className="mb-1 block text-sm font-medium text-ink-primary"
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
                    className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-ink-muted">
                      {notes.length}/{MAX_NOTES}
                    </span>
                    <Button
                      size="sm"
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
                  className="min-h-[1.25rem] text-sm text-ink-secondary"
                >
                  {saved}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </Page>
  );
};

export default DsaQuestionPage;
