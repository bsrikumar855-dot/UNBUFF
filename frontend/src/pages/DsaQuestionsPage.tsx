import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import type { CompanyDetailResponse, QuestionsResponse } from "@/types/contract";
import { DifficultyBadge, Pager, ProgressBadge, SourceBanner, TopicTags } from "@/components/dsa/DsaBits";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { useDsaProgress } from "@/hooks/useDsaProgress";
import { DIFFICULTY_LABEL, PAGE_SIZE, positiveInt } from "@/lib/dsa";
import { routes } from "@/lib/routes";

const SORTS = [
  { value: "title:asc", label: "Title (A to Z)" },
  { value: "title:desc", label: "Title (Z to A)" },
  { value: "difficulty:asc", label: "Difficulty (easy first)" },
  { value: "difficulty:desc", label: "Difficulty (hard first)" },
];

const field = "rounded-md border border-line-strong bg-white px-3 py-2 text-sm font-normal";

/**
 * Question explorer. Filters live in the URL, so a reload or a shared link keeps them; the server does
 * the searching, filtering, sorting and paging. Used for /dsa/questions and /dsa/companies/:companyId.
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
        { replace: true },
      );
    },
    [setParams],
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
      .getQuestions({ company, search: q, difficulty, topic, sort, order, page, page_size: PAGE_SIZE })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [company, q, difficulty, topic, sortValue, page, attempt]);

  const filtersActive = Boolean(q || difficulty || topic);
  const title = companyInfo ? companyInfo.company.name : "All questions";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-muted">
        <Link to={routes.dsa} className="underline">
          DSA Arena
        </Link>{" "}
        / {title}
      </nav>
      <h1 className="text-2xl font-bold text-ink-primary">{title}</h1>
      {companyInfo && (
        <p className="mt-1 text-sm text-ink-secondary">
          {companyInfo.company.catalogue_available
            ? `${companyInfo.company.question_count} question${companyInfo.company.question_count === 1 ? "" : "s"} in the catalogue`
            : "No catalogue is available for this company."}
        </p>
      )}
      {data && <SourceBanner source={data.source} className="my-4" />}

      <form role="search" aria-label="Filter questions" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary lg:col-span-2">
          Search by title
          <input type="search" className={field} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
          Difficulty
          <select className={field} value={difficulty} onChange={(e) => setParam({ difficulty: e.target.value })}>
            <option value="">All difficulties</option>
            {(data?.facets.difficulties ?? []).map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
          Topic
          <select className={field} value={topic} onChange={(e) => setParam({ topic: e.target.value })}>
            <option value="">All topics</option>
            {(data?.facets.topics ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
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
      </form>
      {filtersActive && (
        <button
          type="button"
          className="mb-4 text-sm text-primary underline"
          onClick={() => {
            setSearchText("");
            setParam({ q: null, difficulty: null, topic: null });
          }}
        >
          Clear filters
        </button>
      )}

      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {error === null && data === null && <LoadingState message="Loading questions…" />}

      {error === null && data && (
        <>
          <p className="mb-2 text-sm text-ink-secondary" aria-live="polite">
            {data.total} question{data.total === 1 ? "" : "s"}
            {filtersActive ? " match your filters" : ""}
          </p>
          {data.questions.length === 0 ? (
            <p className="rounded-md border border-line bg-white p-4 text-sm text-ink-secondary">
              {data.source === null
                ? "No catalogue is loaded, so there are no questions to show."
                : filtersActive
                  ? "No questions match these filters. Try clearing some."
                  : company
                    ? "No questions are available for this company in the loaded catalogue."
                    : "The loaded catalogue contains no questions."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.questions.map((question) => {
                const mine = progress.byQuestion.get(question.id);
                return (
                  <li key={question.id} className="rounded-lg border border-line bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link to={routes.dsaQuestion(question.id)} className="font-semibold text-ink-primary underline-offset-2 hover:underline">
                        {question.title}
                      </Link>
                      <div className="flex items-center gap-3">
                        <DifficultyBadge difficulty={question.difficulty} />
                        {mine && <ProgressBadge status={mine.status} bookmarked={mine.bookmarked} />}
                      </div>
                    </div>
                    <div className="mt-2">
                      <TopicTags topics={question.topics} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <Pager page={data.page} totalPages={data.total_pages} onPage={(p) => setParam({ page: p === 1 ? null : String(p) }, false)} />
        </>
      )}
      {!progress.signedIn && !progress.authLoading && (
        <p className="mt-6 text-sm text-ink-muted">
          <Link to={routes.login} className="text-primary underline">
            Sign in
          </Link>{" "}
          to track progress, bookmarks and notes.
        </p>
      )}
    </div>
  );
};

export default DsaQuestionsPage;
