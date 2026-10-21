import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Bookmark,
  Building2,
  ChevronRight,
  Code2,
  FileText,
  PieChart,
  Search,
  SquareCode,
} from "lucide-react";
import { api } from "@/api/endpoints";
import type { CompaniesResponse } from "@/types/contract";
import { Pager, SourceBanner } from "@/components/dsa/DsaBits";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";
import { useAuth } from "@/auth/context";

const ROW =
  "group flex items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/70 focus-visible:bg-white/70";
/** The round arrow at the end of a row. It lights up when the row is pointed at. */
const Go: React.FC = () => (
  <span
    aria-hidden="true"
    className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80 text-ink-muted shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07)] transition-colors group-hover:bg-ink-primary group-hover:text-surface-50 group-focus-visible:bg-ink-primary group-focus-visible:text-surface-50"
  >
    <ChevronRight size={15} />
  </span>
);

/**
 * Company-wise DSA Arena landing: searchable companies beside a topic index. Counts come only from loaded
 * catalogue data. The topic index is read from the catalogue's own facets, so it never lists a topic that has no questions.
 */
export const DsaArenaPage: React.FC = () => {
  const { status } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CompaniesResponse | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [questionTotal, setQuestionTotal] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .getCompanies({ search: debounced, page, page_size: 24 })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [debounced, page, attempt]);

  // Topics come from the catalogue's own facets; if they cannot be read the section simply stays hidden.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getQuestions({ page: 1, page_size: 1 }))
      .then((r) => {
        if (cancelled) return;
        setTopics(r?.facets?.topics ?? []);
        setQuestionTotal(typeof r?.total === "number" ? r.total : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pill = "rounded-full";
  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Practice"
        title={
          <>
            DSA <em>Arena</em>
          </>
        }
        description="Browse practice problems by company, track what you have solved, and keep notes."
        actions={
          <>
            <Link
              to={routes.dsaQuestions}
              className={buttonClasses("primary", "md", pill)}
            >
              <SquareCode aria-hidden="true" />
              Browse all questions
            </Link>
            {status === "signedIn" && (
              <>
                <Link
                  to={routes.dsaProgress}
                  className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
                >
                  <BarChart3 aria-hidden="true" />
                  My progress
                </Link>
                <Link
                  to={routes.dsaAnalytics}
                  className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
                >
                  <PieChart aria-hidden="true" />
                  Analytics
                </Link>
                <Link
                  to={routes.dsaRevision}
                  className={buttonClasses("secondary", "md", `${pill} bg-white/70`)}
                >
                  <Bookmark aria-hidden="true" />
                  Revision
                </Link>
              </>
            )}
          </>
        }
      />

      {data && <SourceBanner source={data.source} className="mb-6" />}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_27rem]">
        <GlassCard
          id="companies"
          icon={Building2}
          title="Companies"
          sub="Search and browse companies to find practice questions."
        >
          <label className="mb-4 block text-sm font-medium text-ink-primary">
            <span className="sr-only">Search companies</span>
            <span className="relative block">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="e.g. Acme"
                className="min-h-11 w-full rounded-2xl border border-line-strong bg-white/70 py-2 pl-10 pr-3 font-normal"
              />
            </span>
          </label>

          {error !== null && (
            <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />
          )}
          {error === null && data === null && (
            <LoadingState message="Loading companies…" />
          )}

          {data && data.companies.length === 0 && (
            <EmptyState title="No companies to list">
              {data.source === null
                ? "Nothing to browse until a catalogue is loaded."
                : debounced
                  ? `No companies match "${debounced}".`
                  : "This catalogue lists no companies."}
              {data.source !== null &&
                !debounced &&
                `${
                  questionTotal !== null
                    ? ` It holds ${questionTotal} question${questionTotal === 1 ? "" : "s"}, none linked to a company.`
                    : ""
                } Company-wise lists appear only after an approved dataset with company links is imported. Use the topic index, or browse all questions.`}
            </EmptyState>
          )}

          {data && data.companies.length > 0 && (
            <ul className="divide-y divide-line">
              {data.companies.map((c) => (
                <li key={c.id}>
                  <Link to={routes.dsaCompany(c.id)} className={ROW}>
                    <span
                      aria-hidden="true"
                      className="grid size-11 shrink-0 place-items-center rounded-xl bg-white font-serif text-lg font-semibold uppercase text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
                    >
                      {c.name.trim().slice(0, 1) || "·"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink-primary">
                        {c.name}
                      </span>
                      <span className="block text-sm text-ink-secondary">
                        {c.catalogue_available
                          ? `${c.question_count} question${c.question_count === 1 ? "" : "s"} in the catalogue`
                          : "No catalogue available for this company"}
                      </span>
                    </span>
                    <Go />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data && (
            <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
          )}
        </GlassCard>

        {topics.length > 0 && (
          <GlassCard
            id="topics"
            icon={Code2}
            title="Topics"
            sub="Every topic that has questions in the loaded catalogue."
            className="xl:sticky xl:top-4"
          >
            <ul className="max-h-[calc(100vh-13rem)] divide-y divide-line overflow-y-auto pr-1">
              {topics.map((t) => (
                <li key={t}>
                  <Link
                    to={`${routes.dsaQuestions}?topic=${encodeURIComponent(t)}`}
                    className={ROW}
                  >
                    <FileText
                      size={17}
                      strokeWidth={1.6}
                      aria-hidden="true"
                      className="shrink-0 text-ink-muted"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink-primary">
                      {t}
                    </span>
                    <Go />
                  </Link>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </div>
    </Page>
  );
};

export default DsaArenaPage;
