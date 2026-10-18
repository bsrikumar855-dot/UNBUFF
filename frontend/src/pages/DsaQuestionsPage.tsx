import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import type { CompanyDetailResponse, QuestionsResponse } from "@/types/contract";
import {
  DifficultyBadge,
  Pager,
  ProgressBadge,
  SourceBanner,
  TopicTags,
} from "@/components/dsa/DsaBits";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { useDsaProgress } from "@/hooks/useDsaProgress";
import { buttonClasses } from "@/lib/buttonClasses";
import { DIFFICULTY_LABEL, PAGE_SIZE, positiveInt } from "@/lib/dsa";
import { routes } from "@/lib/routes";

const SORTS = [
  { value: "title:asc", label: "Title (A to Z)" },
  { value: "title:desc", label: "Title (Z to A)" },
  { value: "difficulty:asc", label: "Difficulty (easy first)" },
  { value: "difficulty:desc", label: "Difficulty (hard first)" },
];

const field =
  "min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-normal";

/**
 * Question explorer. Filters live in the URL, so a reload or a shared link keeps them; the server does
 * the searching, filtering, sorting and paging. Used for /dsa/questions and /dsa/companies/:companyId.
 * Composition: a filter rail beside a compact ruled list (a list of problems, not a wall of cards).
 */
const DsaQuestionsPage: React.FC = () => {
  const { companyId: routeCompany } = useParams<{ companyId: string }>();
  const [params, setParams] = useSearchParams();
  const company = routeCompany ?? params.get("company") ?? "";
  const q = params.get("q") ?? "";
  const difficulty = params.get("difficulty") ?? "";
  const topic = params.get("topic") ?? "";
  const sortValue = `${params.get("sort") ?? "title"}:${params.get("order") ?? "asc"}`;
  const page = positiveInt(params.get("page"), 1);

  const [searchText, setSearchText] = useState(q);
  const [data, setData] = useState<QuestionsResponse | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyDetailResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const progress = useDsaProgress();

  const setParam = useCallback(
    (changes: Record<string, string | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          if (resetPage) next.delete("page");
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  // Debounce the title search into the URL.
  useEffect(() => {
    if (searchText.trim() === q) return;
    const t = setTimeout(() => setParam({ q: searchText.trim() }), 300);
    return () => clearTimeout(t);
  }, [searchText, q, setParam]);

  useEffect(() => {
    if (!company) {
      setCompanyInfo(null);
      return;
    }
    let cancelled = false;
    api
      .getCompany(company)
      .then((r) => !cancelled && setCompanyInfo(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [company, attempt]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const [sort, order] = sortValue.split(":");
    api
      .getQuestions({
        company,
        search: q,
        difficulty,
        topic,
        sort,
        order,
        page,
        page_size: PAGE_SIZE,
      })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [company, q, difficulty, topic, sortValue, page, attempt]);

  const filtersActive = Boolean(q || difficulty || topic);
  const title = companyInfo ? companyInfo.company.name : "All questions";

  return (
    <Page width="wide">
      <PageHeader
        crumbs={[{ label: "DSA Arena", to: routes.dsa }, { label: title }]}
        title={title}
        description={
          companyInfo
            ? companyInfo.company.catalogue_available
              ? `${companyInfo.company.question_count} question${companyInfo.company.question_count === 1 ? "" : "s"} in the catalogue`
              : "No catalogue is available for this company."
            : undefined
        }
      />
      {data && <SourceBanner source={data.source} className="mb-8" />}

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <form
          role="search"
          aria-label="Filter questions"
          className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary">
            Search by title
            <input
              type="search"
              className={field}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary">
            Difficulty
            <select
              className={field}
              value={difficulty}
              onChange={(e) => setParam({ difficulty: e.target.value })}
            >
              <option value="">All difficulties</option>
              {(data?.facets.difficulties ?? []).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary">
            Topic
            <select
              className={field}
              value={topic}
              onChange={(e) => setParam({ topic: e.target.value })}
            >
              <option value="">All topics</option>
              {(data?.facets.topics ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary">
            Sort by
            <select
              className={field}
              value={sortValue}
              onChange={(e) => {
                const [sort, order] = e.target.value.split(":");
                setParam({ sort: sort ?? null, order: order ?? null });
              }}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {filtersActive && (
            <button
              type="button"
              className={buttonClasses("link", "sm", "self-start text-sm")}
              onClick={() => {
                setSearchText("");
                setParam({ q: null, difficulty: null, topic: null });
              }}
            >
              Clear filters
            </button>
          )}
          {!progress.signedIn && !progress.authLoading && (
            <p className="border-t border-line pt-4 text-sm text-ink-muted">
              <Link
                to={routes.login}
                className="text-redline underline underline-offset-4"
              >
                Sign in
              </Link>{" "}
              to track progress, bookmarks and notes.
            </p>
          )}
        </form>

        <div className="min-w-0">
          {error !== null && (
            <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
          )}
          {error === null && data === null && (
            <LoadingState message="Loading questions…" />
          )}

          {error === null && data && (
            <>
              <p className="mb-3 text-sm text-ink-secondary" aria-live="polite">
                <span className="num font-medium text-ink-primary">{data.total}</span>{" "}
                question{data.total === 1 ? "" : "s"}
                {filtersActive ? " match your filters" : ""}
              </p>
              {data.questions.length === 0 ? (
                <EmptyState title="Nothing to show">
                  {data.source === null
                    ? "No catalogue is loaded, so there are no questions to show."
                    : filtersActive
                      ? "No questions match these filters. Try clearing some."
                      : company
                        ? "No questions are available for this company in the loaded catalogue."
                        : "The loaded catalogue contains no questions."}
                </EmptyState>
              ) : (
                <ul className="border-t border-ink-primary">
                  {data.questions.map((question) => {
                    const mine = progress.byQuestion.get(question.id);
                    return (
                      <li
                        key={question.id}
                        className="grid gap-x-6 gap-y-1.5 border-b border-line py-3.5 sm:grid-cols-[minmax(0,1fr)_6rem_9rem] sm:items-baseline"
                      >
                        <div className="min-w-0">
                          <Link
                            to={routes.dsaQuestion(question.id)}
                            className="text-[15px] font-semibold text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                          >
                            {question.title}
                          </Link>
                          <div className="mt-1">
                            <TopicTags topics={question.topics} />
                          </div>
                        </div>
                        <DifficultyBadge difficulty={question.difficulty} />
                        <div className="sm:text-right">
                          {mine ? (
                            <ProgressBadge
                              status={mine.status}
                              bookmarked={mine.bookmarked}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Pager
                page={data.page}
                totalPages={data.total_pages}
                onPage={(p) => setParam({ page: p === 1 ? null : String(p) }, false)}
              />
            </>
          )}
        </div>
      </div>
    </Page>
  );
};

export default DsaQuestionsPage;
