import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import type { CompaniesResponse } from "@/types/contract";
import { SourceBanner } from "@/components/dsa/DsaBits";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { buttonClasses } from "@/lib/buttonClasses";
import { routes } from "@/lib/routes";
import { Pager } from "@/components/dsa/DsaBits";
import { useAuth } from "@/auth/context";

/** Company-wise DSA Arena landing: searchable companies. Counts come only from loaded catalogue data. */
export const DsaArenaPage: React.FC = () => {
  const { status } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CompaniesResponse | null>(null);
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary">DSA Arena</h1>
          <p className="mt-1 text-sm text-ink-secondary">Browse practice problems by company, track what you have solved, and keep notes.</p>
        </div>
        <div className="flex gap-2">
          <Link to={routes.dsaQuestions} className={buttonClasses("primary", "sm")}>
            Browse all questions
          </Link>
          {status === "signedIn" && (
            <Link to={routes.dsaProgress} className={buttonClasses("secondary", "sm")}>
              My progress
            </Link>
          )}
        </div>
      </div>

      {data && <SourceBanner source={data.source} className="mb-6" />}

      <label className="mb-4 flex max-w-md flex-col gap-1 text-sm font-medium text-ink-primary">
        Search companies
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="e.g. Acme"
          className="rounded-md border border-line-strong bg-white px-3 py-2 font-normal"
        />
      </label>

      {error !== null && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {error === null && data === null && <LoadingState message="Loading companies…" />}

      {data && data.companies.length === 0 && (
        <p className="text-sm text-ink-secondary">
          {data.source === null ? "Nothing to browse until a catalogue is loaded." : debounced ? `No companies match "${debounced}".` : "This catalogue lists no companies."}
        </p>
      )}

      {data && data.companies.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.companies.map((c) => (
            <li key={c.id}>
              <Link
                to={routes.dsaCompany(c.id)}
                className="block h-full rounded-lg border border-line bg-white p-4 transition-colors hover:border-line-strong hover:bg-surface-50"
              >
                <p className="font-semibold text-ink-primary">{c.name}</p>
                <p className="mt-1 text-sm text-ink-secondary">
                  {c.catalogue_available ? `${c.question_count} question${c.question_count === 1 ? "" : "s"} in the catalogue` : "No catalogue available for this company"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />}
    </div>
  );
};

export default DsaArenaPage;
