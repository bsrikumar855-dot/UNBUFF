import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { api } from "@/api/endpoints";
import type { CompaniesResponse } from "@/types/contract";
import { Pager, SourceBanner } from "@/components/dsa/DsaBits";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";
import { useAuth } from "@/auth/context";

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

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Practice"
        title="DSA Arena"
        description="Browse practice problems by company, track what you have solved, and keep notes."
        actions={
          <>
            <Link to={routes.dsaQuestions} className={buttonClasses("primary", "sm")}>
              Browse all questions
            </Link>
            {status === "signedIn" && (
              <>
                <Link
                  to={routes.dsaProgress}
                  className={buttonClasses("secondary", "sm")}
                >
                  My progress
                </Link>
                <Link
                  to={routes.dsaAnalytics}
                  className={buttonClasses("secondary", "sm")}
                >
                  Analytics
                </Link>
                <Link
                  to={routes.dsaRevision}
                  className={buttonClasses("secondary", "sm")}
                >
                  Revision
                </Link>
              </>
            )}
          </>
        }
      />

      {data && <SourceBanner source={data.source} className="mb-8" />}

      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section id="companies" title="Companies" index="01">
          <label className="mb-4 flex max-w-md flex-col gap-1.5 text-sm font-medium text-ink-primary">
            Search companies
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Acme"
              className="min-h-10 rounded-md border border-line-strong bg-surface px-3 py-2 font-normal"
            />
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
            <ul className="border-t border-line">
              {data.companies.map((c) => (
                <li key={c.id} className="border-b border-line">
                  <Link
                    to={routes.dsaCompany(c.id)}
                    className="group flex items-baseline justify-between gap-4 py-3.5 transition-colors hover:bg-surface"
                  >
                    <span>
                      <span className="block font-semibold text-ink-primary group-hover:text-redline">
                        {c.name}
                      </span>
                      <span className="block text-sm text-ink-secondary">
                        {c.catalogue_available
                          ? `${c.question_count} question${c.question_count === 1 ? "" : "s"} in the catalogue`
                          : "No catalogue available for this company"}
                      </span>
                    </span>
                    <ArrowUpRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-ink-muted group-hover:text-redline"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data && (
            <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
          )}
        </Section>

        {topics.length > 0 && (
          <Section
            id="topics"
            title="Topics"
            index="02"
            description="Every topic that has questions in the loaded catalogue."
          >
            <ul className="border-t border-line">
              {topics.map((t) => (
                <li key={t} className="border-b border-line">
                  <Link
                    to={`${routes.dsaQuestions}?topic=${encodeURIComponent(t)}`}
                    className="group relative isolate flex min-h-11 items-center justify-between gap-3 overflow-hidden px-2 py-2 text-[15px] text-ink-primary transition-colors duration-300 hover:text-background focus-visible:text-background"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 translate-y-full bg-foreground transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0 motion-reduce:transition-none"
                    />
                    <span className="transition-transform duration-300 group-hover:translate-x-1.5 motion-reduce:transition-none">
                      {t}
                    </span>
                    <ArrowUpRight
                      size={14}
                      aria-hidden="true"
                      className="text-ink-muted transition-colors group-hover:text-background group-focus-visible:text-background"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </Page>
  );
};

export default DsaArenaPage;
