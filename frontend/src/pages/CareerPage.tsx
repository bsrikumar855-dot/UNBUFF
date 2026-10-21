import { m } from "motion/react";
import {
  ArrowUpDown,
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  Compass,
  Database,
  FileText,
  Filter,
  Info,
  Settings2,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Enter } from "@/components/motion/Enter";
import { RISE } from "@/components/motion/tokens";
import { GLASS, TILE } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { SPRING_GLIDE } from "@/components/motion/ease";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type CareerFeedParams } from "@/api/endpoints";
import { FilterBar } from "@/components/career/FilterBar";
import { JobRow } from "@/components/career/JobRow";
import { PreferencesSheet } from "@/components/career/PreferencesSheet";
import { TrackedList } from "@/components/career/TrackedList";
import { Pager } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Page } from "@/components/ui/Page";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/Tag";
import {
  ALL_TABS,
  DEFAULT_FILTERS,
  FEED_TABS,
  activeFilters,
  isTab,
  words,
  type CareerFilters,
  type CareerTabValue,
} from "@/lib/career";
import { routes } from "@/lib/routes";
import type {
  CareerFacetsResponse,
  CareerFeedResponse,
  CareerPreferencesResponse,
  CareerTab,
  CareerTrackedResponse,
  CareerTracker,
} from "@/types/contract";

const PAGE_SIZE = 20;
/** Freehire does not serve rows past offset + limit = 10,000, so page numbers stop there. */
const MAX_PAGES = Math.floor(10_000 / PAGE_SIZE);

const toParams = (
  tab: CareerTab,
  f: CareerFilters,
  offset: number
): CareerFeedParams => ({
  tab,
  q: f.q.trim() || undefined,
  search_in: f.q.trim() && f.search_in !== "all" ? f.search_in : undefined,
  category: f.category,
  skills: f.skills,
  countries: f.countries,
  cities: f.cities,
  work_mode: f.work_mode,
  seniority: tab === "explore" || tab === "internships" ? f.seniority : undefined,
  employment_type: tab === "explore" ? f.employment_type : undefined,
  include_stale: f.include_stale || undefined,
  tech_only: f.tech_only ? undefined : false,
  broaden: tab === "jobs" && f.broaden ? true : undefined,
  sort: tab === "for_you" ? undefined : (f.sort ?? undefined),
  posted_within_days: f.posted_within_days ?? undefined,
  salary_min: tab === "explore" ? (f.salary_min ?? undefined) : undefined,
  offset: offset || undefined,
  limit: PAGE_SIZE,
});

const TAB_ICON: Record<CareerTabValue, LucideIcon> = {
  for_you: Sparkles,
  internships: Briefcase,
  jobs: Building2,
  explore: Compass,
  saved: Bookmark,
  applications: FileText,
};

/** One fact about the student's career profile: a round icon, a title and what is known. */
const Fact: React.FC<{ icon: LucideIcon; title: string; children: React.ReactNode }> = ({
  icon: Icon,
  title,
  children,
}) => (
  <div className="flex min-w-0 items-start gap-3.5">
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.35)]"
    >
      <Icon size={20} strokeWidth={1.75} />
    </span>
    <div className="min-w-0">
      <p className="font-semibold text-ink-primary">{title}</p>
      {children}
    </div>
  </div>
);

const PrefsLink: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  to?: string;
}> = ({ children, onClick, to }) => {
  const cls =
    "mt-0.5 inline-flex items-center gap-1 text-sm text-redline underline underline-offset-4";
  return to ? (
    <Link to={to} className={cls}>
      {children} <span aria-hidden="true">→</span>
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children} <span aria-hidden="true">→</span>
    </button>
  );
};

const SkeletonRows: React.FC = () => (
  <div role="status" aria-label="Loading listings" className="flex flex-col gap-3">
    {Array.from({ length: 5 }, (_v, i) => (
      <div key={i} className={cn(TILE, "flex items-start gap-5 p-4")}>
        <Skeleton className="h-10 w-16" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))}
    <span className="sr-only">Loading listings from Freehire…</span>
  </div>
);

/** Jobs and internships from Freehire's public listings, matched against the student's own profile. */
const CareerPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const tab: CareerTabValue = isTab(rawTab) ? rawTab : "for_you";
  const feedTab = (
    FEED_TABS.some((t) => t.value === tab) ? tab : null
  ) as CareerTab | null;

  const [prefs, setPrefs] = useState<CareerPreferencesResponse | null>(null);
  const [prefsError, setPrefsError] = useState<unknown>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [facets, setFacets] = useState<CareerFacetsResponse | null>(null);
  const facetsRequested = useRef(false);

  const [filters, setFilters] = useState<Record<CareerTab, CareerFilters>>({
    for_you: { ...DEFAULT_FILTERS },
    internships: { ...DEFAULT_FILTERS },
    jobs: { ...DEFAULT_FILTERS },
    explore: { ...DEFAULT_FILTERS },
  });
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState<CareerFeedResponse | null>(null);
  const [feedError, setFeedError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  const [tracked, setTracked] = useState<CareerTrackedResponse | null>(null);
  const [trackedError, setTrackedError] = useState<unknown>(null);
  const [trackedAttempt, setTrackedAttempt] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getCareerPreferences())
      .then((r) => !cancelled && setPrefs(r))
      .catch((e: unknown) => !cancelled && setPrefsError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFacets = useCallback(() => {
    if (facetsRequested.current) return;
    facetsRequested.current = true;
    Promise.resolve(api.getCareerFacets({}))
      .then(setFacets)
      .catch(() => {
        facetsRequested.current = false; // filters still work as free text; try again next time they are opened
      });
  }, []);

  const current = feedTab ? filters[feedTab] : DEFAULT_FILTERS;
  const offset = (page - 1) * PAGE_SIZE;

  useEffect(() => {
    if (!feedTab) return;
    let cancelled = false;
    setLoading(true);
    setFeedError(null);
    Promise.resolve(api.getCareerJobs(toParams(feedTab, current, offset)))
      .then((r) => {
        if (!cancelled) setFeed(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFeed(null);
          setFeedError(e);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [feedTab, current, offset, attempt]);

  useEffect(() => {
    if (tab !== "saved" && tab !== "applications") return;
    let cancelled = false;
    setTrackedError(null);
    Promise.resolve(api.getCareerTracked(tab))
      .then((r) => !cancelled && setTracked(r))
      .catch((e: unknown) => !cancelled && setTrackedError(e));
    return () => {
      cancelled = true;
    };
  }, [tab, trackedAttempt]);

  const setTab = (t: string) => {
    setPage(1);
    setFeed(null);
    setTracked(null);
    setParams(t === "for_you" ? {} : { tab: t }, { replace: true });
  };
  const applyFilters = (f: CareerFilters) => {
    if (!feedTab) return;
    setPage(1);
    setFilters((all) => ({ ...all, [feedTab]: f }));
  };
  const reset = () => applyFilters({ ...DEFAULT_FILTERS });

  const onTracker = (slug: string, tracker: CareerTracker | null) =>
    setFeed((f) =>
      f
        ? { ...f, jobs: f.jobs.map((c) => (c.job.slug === slug ? { ...c, tracker } : c)) }
        : f
    );

  const chips = useMemo(
    () => (feedTab ? activeFilters(current, feedTab) : []),
    [feedTab, current]
  );
  const totalPages = feed
    ? Math.min(
        MAX_PAGES,
        feed.ranked_window !== null
          ? Math.max(1, Math.ceil(feed.ranked_window / PAGE_SIZE))
          : feed.total !== null
            ? Math.max(1, Math.ceil(feed.total / PAGE_SIZE))
            : feed.has_more
              ? page + 1
              : page
      )
    : 1;
  const from = feed && feed.jobs.length > 0 ? feed.offset + 1 : 0;
  const to = feed ? feed.offset + feed.jobs.length : 0;
  const pr = prefs?.preferences;

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <header className="mb-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_37rem]">
        <div className="min-w-0">
          <Enter y={RISE.sm}>
            <p className="eyebrow mb-2 text-redline">Plan</p>
          </Enter>
          <Enter index={1} y={RISE.sm}>
            <h1 className="serif text-title font-medium text-ink-primary">
              Career <em>Opportunities</em>
            </h1>
          </Enter>
          <Enter index={2} y={RISE.sm}>
            <p className="mt-3 max-w-2xl leading-relaxed text-ink-secondary">
              Jobs and internships from Freehire's public listings, compared with your own
              goals, skills and preferences. You apply on the employer's own page; UNBLUFF
              never applies for you.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-full bg-white/70"
                onClick={() => setPrefsOpen(true)}
              >
                <Settings2 aria-hidden="true" />
                Career preferences
              </Button>
              <Link
                to={`${routes.mentor()}?career=1`}
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Sparkles size={16} aria-hidden="true" />
                Ask the AI mentor
              </Link>
            </div>
          </Enter>
        </div>

        <section
          aria-label="Your career profile"
          className={cn(GLASS, "grid gap-x-6 gap-y-5 p-5 text-sm sm:grid-cols-2 sm:p-6")}
        >
          {prefsError !== null ? (
            <ErrorState className="sm:col-span-2" error={prefsError} />
          ) : !prefs ? (
            <p className="text-ink-secondary sm:col-span-2">Reading your profile…</p>
          ) : (
            <>
              <Fact icon={Target} title="Target role">
                <p className="text-ink-secondary">
                  {prefs.profile.role_names.length
                    ? prefs.profile.role_names.join(", ")
                    : "Not set"}
                </p>
                <p className="text-xs text-ink-muted">
                  {prefs.profile.experience_level
                    ? `${prefs.profile.experience_level} level`
                    : "Experience level not set"}
                </p>
                {!prefs.profile.role_names.length && (
                  <PrefsLink onClick={() => setPrefsOpen(true)}>
                    Set preferences
                  </PrefsLink>
                )}
              </Fact>
              <Fact icon={BarChart3} title="Skills">
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {prefs.profile.verified_skills.slice(0, 4).map((s) => (
                    <Tag key={s} tone="verified">
                      {s}
                    </Tag>
                  ))}
                  {prefs.profile.resume_skills.slice(0, 4).map((s) => (
                    <Tag key={`r-${s}`} tone="self">
                      {s}
                    </Tag>
                  ))}
                  {prefs.profile.self_reported_skills.slice(0, 4).map((s) => (
                    <Tag key={s} tone="self">
                      {s}
                    </Tag>
                  ))}
                  {prefs.profile.verified_skills.length +
                    prefs.profile.resume_skills.length +
                    prefs.profile.self_reported_skills.length ===
                    0 && <span className="text-ink-secondary">None to compare yet</span>}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {prefs.profile.verified_skills.length} verified,{" "}
                  {prefs.profile.resume_skills.length > 0
                    ? `${prefs.profile.resume_skills.length} from resume, `
                    : ""}
                  {prefs.profile.self_reported_skills.length} stated
                </p>
                {prefs.profile.resume_skills.length === 0 && (
                  <PrefsLink to="/mentor/memory">Add skills from your resume</PrefsLink>
                )}
              </Fact>
              <Fact icon={Filter} title="Preferences">
                {pr ? (
                  <>
                    <p className="text-ink-secondary">
                      {[
                        pr.countries.length
                          ? pr.countries.map((c) => c.toUpperCase()).join(", ")
                          : null,
                        pr.cities.join(", ") || null,
                        pr.work_modes.join(" or ") || null,
                        pr.employment_types
                          .map((e) => e.replace("_", "-"))
                          .join(" or ") || null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Open to anything"}
                    </p>
                    {pr.categories.length > 0 && (
                      <p className="text-xs text-ink-muted">
                        {pr.categories.map(words).join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-ink-secondary">Not set</p>
                    <PrefsLink onClick={() => setPrefsOpen(true)}>
                      Set preferences
                    </PrefsLink>
                  </>
                )}
              </Fact>
              <Fact icon={Database} title="Source">
                <p className="text-ink-secondary">Freehire public API</p>
                <p className="text-xs text-ink-muted">
                  Listings are read live. UNBLUFF does not store job descriptions.
                </p>
              </Fact>
            </>
          )}
        </section>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          aria-label="Career sections"
          className={cn(
            GLASS,
            "mb-5 flex h-auto w-full flex-wrap justify-start gap-1 p-2 text-ink-secondary"
          )}
        >
          {ALL_TABS.map((t) => {
            const Icon = TAB_ICON[t.value];
            return (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="relative isolate min-h-11 gap-2 rounded-full px-5 text-sm data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-ink-primary data-[state=active]:shadow-none"
              >
                {tab === t.value && (
                  <m.span
                    aria-hidden="true"
                    layoutId="career-tab-pill"
                    transition={SPRING_GLIDE}
                    className="absolute inset-0 -z-10 rounded-full bg-white shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.35)]"
                  />
                )}
                <Icon
                  size={17}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className={tab === t.value ? "text-redline" : "text-ink-muted"}
                />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={tab} className="mt-0 focus-visible:outline-hidden">
          {feedTab && (
            <div className="grid items-start gap-5 lg:grid-cols-[19.5rem_minmax(0,1fr)]">
              <FilterBar
                tab={feedTab}
                filters={current}
                facets={facets}
                onApply={applyFilters}
                onReset={reset}
                onOpenFacets={loadFacets}
                busy={loading}
                className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
              />
              <section
                aria-label={FEED_TABS.find((t) => t.value === feedTab)?.label}
                className={cn(GLASS, "min-w-0 p-5 sm:p-6")}
              >
                <p className="mb-4 text-sm text-ink-secondary">
                  {FEED_TABS.find((t) => t.value === feedTab)?.blurb}
                </p>

                {chips.length > 0 && (
                  <ul
                    aria-label="Active filters"
                    className="mb-4 flex flex-wrap items-center gap-2"
                  >
                    {chips.map((c) => (
                      <li key={c.key}>
                        <button
                          type="button"
                          onClick={() => applyFilters(c.clear(current))}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong bg-white/80 px-3 text-xs text-ink-primary hover:border-ink-primary"
                        >
                          {c.label}
                          <span aria-hidden="true">×</span>
                          <span className="sr-only"> remove filter</span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        onClick={reset}
                        className="text-xs text-redline underline underline-offset-4"
                      >
                        Reset all filters
                      </button>
                    </li>
                  </ul>
                )}

                {!online && (
                  <p
                    role="alert"
                    className="mb-4 border-l-2 border-redline pl-3 text-sm text-ink-primary"
                  >
                    You appear to be offline. Listings will load when you reconnect.
                  </p>
                )}

                <div aria-busy={loading}>
                  {feed && (
                    <div className="mb-4 flex flex-col gap-3 text-sm text-ink-secondary">
                      <div
                        className={cn(
                          "grid items-start gap-3",
                          feed.personalization.level !== "full" &&
                            "xl:grid-cols-[minmax(0,1fr)_19rem]"
                        )}
                      >
                        <div className={cn(TILE, "flex items-start gap-3 p-4")}>
                          <Info
                            size={18}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-redline"
                          />
                          <p aria-live="polite">
                            {feed.jobs.length === 0
                              ? "No postings in this view."
                              : feed.total !== null
                                ? `Showing ${from.toLocaleString("en-US")} to ${to.toLocaleString("en-US")} of ${feed.total.toLocaleString("en-US")} ${feed.tab === "for_you" ? "matching postings" : "postings"} on Freehire.`
                                : `Showing ${from} to ${to}. Freehire did not report a total.`}
                            {feed.ranked_window !== null && feed.ranked_window > 0
                              ? ` Ranked from the ${feed.ranked_window} most recent candidates, best match first.${feed.tab !== "for_you" ? " Choose newest first under Sort by to page through every posting." : ""} A posting that states more about itself ranks above one that states little at a similar score.`
                              : ""}
                          </p>
                        </div>
                        {feed.personalization.level !== "full" && (
                          <div
                            role="note"
                            className={cn(TILE, "flex items-start gap-3 p-4 text-xs")}
                          >
                            <Info
                              size={16}
                              strokeWidth={1.75}
                              aria-hidden="true"
                              className="mt-0.5 shrink-0 text-redline"
                            />
                            <p>
                              {feed.personalization.level === "none"
                                ? "Not personalised: "
                                : "Limited personalisation: "}
                              {feed.personalization.notes.join(" ") ||
                                "add more to your profile for better ranking."}{" "}
                              <button
                                type="button"
                                onClick={() => setPrefsOpen(true)}
                                className="text-redline underline underline-offset-4"
                              >
                                Improve this
                              </button>
                            </p>
                          </div>
                        )}
                      </div>
                      {feed.relaxed.length > 0 && (
                        <p role="note" className={cn(TILE, "p-3.5")}>
                          Nothing matched your {feed.relaxed.join(" and ")} filter, so it
                          was dropped to show general opportunities.
                        </p>
                      )}
                      {feed.ignored_params.length > 0 && (
                        <p
                          role="alert"
                          className={cn(
                            TILE,
                            "border-l-2 border-redline p-3.5 text-ink-primary"
                          )}
                        >
                          Freehire ignored{" "}
                          {feed.ignored_params
                            .map(
                              (p) =>
                                p.param +
                                (p.did_you_mean
                                  ? ` (did you mean ${p.did_you_mean}?)`
                                  : "")
                            )
                            .join(", ")}
                          , so these results may be broader than you asked for.
                        </p>
                      )}
                    </div>
                  )}

                  {feedTab !== "for_you" && (
                    <div className="mb-3 flex items-center justify-end gap-2">
                      <label
                        htmlFor="career-sort"
                        className="flex items-center gap-1.5 text-sm text-ink-secondary"
                      >
                        <ArrowUpDown size={14} aria-hidden="true" />
                        Sort by
                      </label>
                      <select
                        id="career-sort"
                        className="min-h-10 rounded-xl border border-line-strong bg-white/70 px-3 py-2 text-sm text-ink-primary"
                        value={current.sort ?? ""}
                        onChange={(e) =>
                          applyFilters({
                            ...current,
                            sort: (e.target.value || null) as CareerFilters["sort"],
                          })
                        }
                      >
                        <option value="">
                          {feedTab === "explore" ? "Freehire's order" : "Best match"}
                        </option>
                        {feedTab !== "explore" && (
                          <option value="newest">Newest first</option>
                        )}
                        {feedTab === "explore" && (
                          <option value="best_match">Best match</option>
                        )}
                      </select>
                    </div>
                  )}

                  {loading && !feed && <SkeletonRows />}
                  {feedError !== null && !loading && (
                    <ErrorState
                      error={feedError}
                      onRetry={() => setAttempt((a) => a + 1)}
                    />
                  )}
                  {feed && !feedError && feed.jobs.length === 0 && !loading && (
                    <EmptyState
                      live
                      title="Nothing matched"
                      action={
                        <div className="flex flex-wrap gap-2">
                          {chips.length > 0 && (
                            <Button variant="outline" size="sm" onClick={reset}>
                              Reset filters
                            </Button>
                          )}
                          {feedTab === "jobs" && !current.broaden && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => applyFilters({ ...current, broaden: true })}
                            >
                              Include mid-level roles
                            </Button>
                          )}
                          {!current.include_stale && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                applyFilters({ ...current, include_stale: true })
                              }
                            >
                              Include older postings
                            </Button>
                          )}
                        </div>
                      }
                    >
                      No open postings on Freehire fit this view right now. Widening the
                      search is usually the quickest fix. UNBLUFF never fills a gap with
                      listings it did not fetch.
                    </EmptyState>
                  )}
                  {feed && feed.jobs.length > 0 && (
                    <ul
                      key={`${feed.tab}:${feed.offset}:${feed.jobs[0]?.job.id ?? ""}`}
                      className="flex flex-col gap-3 transition-opacity duration-200"
                      aria-label="Listings"
                      style={loading ? { opacity: 0.6 } : undefined}
                    >
                      {feed.jobs.map((c, ci) => (
                        <JobRow
                          key={c.job.id}
                          card={c}
                          index={ci}
                          onTracker={onTracker}
                        />
                      ))}
                    </ul>
                  )}
                  {feed && feed.jobs.length > 0 && (
                    <Pager
                      page={page}
                      totalPages={totalPages}
                      onPage={(p) => setPage(p)}
                    />
                  )}
                  {feed && totalPages >= MAX_PAGES && (
                    <p className="mt-2 text-xs text-ink-muted">
                      Freehire does not serve results past page {MAX_PAGES}: narrow the
                      search with filters to see more.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}

          {(tab === "saved" || tab === "applications") && (
            <section
              aria-label={tab === "saved" ? "Saved jobs" : "Application tracker"}
              className={cn(GLASS, "p-5 sm:p-7")}
            >
              <p className="mb-4 max-w-3xl text-sm text-ink-secondary">
                {tab === "saved"
                  ? "Listings you bookmarked. Open the employer's page to apply; nothing is submitted from here."
                  : "Where each application stands, with your dates and private notes. Soonest follow-up first. Only you can see this."}
              </p>
              {trackedError !== null && (
                <ErrorState
                  error={trackedError}
                  onRetry={() => setTrackedAttempt((a) => a + 1)}
                />
              )}
              {trackedError === null && !tracked && <SkeletonRows />}
              {tracked && tracked.items.length === 0 && (
                <EmptyState
                  live
                  title={
                    tab === "saved" ? "No saved jobs yet" : "No applications tracked yet"
                  }
                  action={
                    <Button variant="outline" size="sm" onClick={() => setTab("for_you")}>
                      Browse jobs for you
                    </Button>
                  }
                >
                  {tab === "saved"
                    ? "Use Save on any listing to keep it here."
                    : "Open a listing and set a status such as Applied to start tracking it. Recording an application here does not apply for you."}
                </EmptyState>
              )}
              {tracked && tracked.items.length > 0 && (
                <TrackedList
                  items={tracked.items}
                  mode={tab}
                  onChanged={() => setTrackedAttempt((a) => a + 1)}
                />
              )}
            </section>
          )}
        </TabsContent>
      </Tabs>

      <PreferencesSheet
        open={prefsOpen}
        onOpenChange={(o) => {
          setPrefsOpen(o);
          if (o) loadFacets();
        }}
        data={prefs}
        facets={facets}
        onSaved={(r) => {
          setPrefs(r);
          setAttempt((a) => a + 1);
        }}
      />
    </Page>
  );
};

export default CareerPage;
