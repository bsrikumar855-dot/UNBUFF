import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  FileText,
  ListChecks,
  Sparkles,
  SquareCode,
  Target,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/api/endpoints";
import type { DsaProgress, QuestionSummary } from "@/types/contract";
import { StatTile } from "@/components/dsa/AnalyticsBits";
import { DifficultyBadge, ProgressBadge } from "@/components/dsa/DsaBits";
import { SPRING_GLIDE } from "@/components/motion/ease";
import { ErrorState } from "@/components/ui/ErrorState";
import { GLASS, GlassCard, TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { LoadingState } from "@/components/ui/LoadingState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
import { useDsaProgress } from "@/hooks/useDsaProgress";
import { routes } from "@/lib/routes";

const MAX_LOOKUPS = 100;

type TabValue = "overview" | "solved" | "bookmarks" | "notes" | "topics";
const TABS: { value: TabValue; label: string; icon: LucideIcon }[] = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "solved", label: "Solved questions", icon: CheckCircle2 },
  { value: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { value: "notes", label: "Notes", icon: FileText },
  { value: "topics", label: "Topic progress", icon: Target },
];

const EMPTY: Record<Exclude<TabValue, "topics">, { title: string; text: string }> = {
  overview: {
    title: "Nothing tracked yet.",
    text: "Mark your status, bookmark or add notes on a question to see your progress here.",
  },
  solved: {
    title: "No solved questions yet.",
    text: "Questions you mark as solved appear here.",
  },
  bookmarks: {
    title: "No bookmarks yet.",
    text: "Bookmark a question to find it again quickly.",
  },
  notes: {
    title: "No notes yet.",
    text: "Notes you add on a question page appear here.",
  },
};

/** A round icon, a title, a sentence and the two ways forward: the empty state of every tab. */
const Empty: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="flex flex-col items-center px-4 py-10 text-center">
    <span
      aria-hidden="true"
      className="relative grid size-24 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_10px_22px_-12px_rgba(24,24,27,0.35)]"
    >
      <ListChecks size={40} strokeWidth={1.5} />
      <Sparkles size={16} className="absolute -right-1 top-2 text-redline/70" />
    </span>
    <h3 className="serif mt-5 text-heading font-medium text-ink-primary">{title}</h3>
    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-secondary">{text}</p>
    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Link to={routes.dsaQuestions} className={buttonClasses("primary", "md", "rounded-full")}>
        <SquareCode aria-hidden="true" />
        Browse questions
      </Link>
      <Link
        to={routes.dsaQuestions}
        className={buttonClasses("secondary", "md", "rounded-full bg-white/70")}
      >
        <FileText aria-hidden="true" />
        Add a note
      </Link>
    </div>
  </div>
);

/** The student's own records (status, bookmarks, notes), joined with catalogue titles. Removed questions are flagged, not hidden. */
const DsaProgressPage: React.FC = () => {
  const progress = useDsaProgress();
  const [titles, setTitles] = useState<Map<string, QuestionSummary | null>>(new Map());
  const [tab, setTab] = useState<TabValue>("overview");

  useEffect(() => {
    if (!progress.records) return;
    let cancelled = false;
    const ids = progress.records.slice(0, MAX_LOOKUPS).map((r) => r.question_id);
    void Promise.allSettled(ids.map((id) => api.getQuestion(id))).then((results) => {
      if (cancelled) return;
      setTitles(
        new Map(
          ids.map((id, i) => [
            id,
            results[i]!.status === "fulfilled"
              ? (results[i] as PromiseFulfilledResult<{ question: QuestionSummary }>)
                  .value.question
              : null,
          ])
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [progress.records]);

  const records = progress.records;
  const counts = useMemo(
    () => ({
      solved: records?.filter((r) => r.status === "solved").length ?? 0,
      attempted: records?.filter((r) => r.status === "attempted").length ?? 0,
      bookmarked: records?.filter((r) => r.bookmarked).length ?? 0,
      notes: records?.filter((r) => r.notes.trim() !== "").length ?? 0,
    }),
    [records]
  );

  const shown = (value: TabValue): DsaProgress[] => {
    const all = records ?? [];
    if (value === "solved") return all.filter((r) => r.status === "solved");
    if (value === "bookmarks") return all.filter((r) => r.bookmarked);
    if (value === "notes") return all.filter((r) => r.notes.trim() !== "");
    return all;
  };

  const topics = useMemo(() => {
    const byTopic = new Map<string, { tracked: number; solved: number }>();
    for (const r of records ?? []) {
      const q = titles.get(r.question_id);
      if (!q) continue;
      for (const t of q.topics) {
        const row = byTopic.get(t) ?? { tracked: 0, solved: 0 };
        row.tracked += 1;
        if (r.status === "solved") row.solved += 1;
        byTopic.set(t, row);
      }
    }
    return [...byTopic.entries()].sort(
      (a, b) =>
        b[1].solved - a[1].solved || b[1].tracked - a[1].tracked || a[0].localeCompare(b[0])
    );
  }, [records, titles]);

  const list = (rows: DsaProgress[]) => (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const q = titles.get(r.question_id);
        return (
          <li key={r.question_id} className={cn(TILE, "px-4 py-3.5")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              {q ? (
                <Link
                  to={routes.dsaQuestion(q.id)}
                  className="font-semibold text-ink-primary underline-offset-4 hover:text-redline hover:underline"
                >
                  {q.title}
                </Link>
              ) : q === null ? (
                <span className="font-semibold text-ink-primary">
                  {r.question_id}{" "}
                  <span className="text-sm font-normal text-ink-muted">
                    (no longer in the catalogue)
                  </span>
                </span>
              ) : (
                <span className="text-ink-muted">Loading…</span>
              )}
              <div className="flex items-center gap-3">
                {q && <DifficultyBadge difficulty={q.difficulty} />}
                <ProgressBadge status={r.status} bookmarked={r.bookmarked} />
              </div>
            </div>
            {r.notes && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-secondary">
                {r.notes.length > 200 ? `${r.notes.slice(0, 200)}…` : r.notes}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              Updated {new Date(r.updated_at).toLocaleString()}
            </p>
          </li>
        );
      })}
    </ul>
  );

  const rows = tab === "topics" ? [] : shown(tab);

  return (
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        crumbs={[{ label: "DSA Arena", to: routes.dsa }, { label: "My progress" }]}
        eyebrow="Practice"
        title={
          <>
            My <em>progress</em>
          </>
        }
        description="Your own marks, bookmarks and notes. These are self-reported and are never counted as judged results."
        actions={
          <div className={cn(GLASS, "flex max-w-sm items-center gap-3.5 px-5 py-4")}>
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
            >
              <BarChart3 size={22} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                Track your learning journey
              </p>
              <p className="mt-0.5 text-xs leading-snug text-ink-secondary">
                View solved questions, topic-wise progress, bookmarks and notes, all in one
                place.
              </p>
            </div>
          </div>
        }
      />

      {progress.error !== null && (
        <ErrorState error={progress.error} onRetry={() => void progress.reload()} />
      )}
      {progress.error === null && records === null && (
        <LoadingState message="Loading your progress…" />
      )}

      {records && (
        <>
          <section
            aria-label="Summary"
            className="mb-5 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <StatTile icon={Target} label="Questions solved" hint="Self-reported">
              {counts.solved}
            </StatTile>
            <StatTile icon={ListChecks} label="Attempted" hint="Questions you are working on">
              {counts.attempted}
            </StatTile>
            <StatTile icon={Bookmark} label="Bookmarked" hint="Questions you saved">
              {counts.bookmarked}
            </StatTile>
            <StatTile icon={FileText} label="Notes" hint="Your personal notes">
              {counts.notes}
            </StatTile>
          </section>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList
              aria-label="Progress sections"
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
                      layoutId="progress-tab-pill"
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

            <TabsContent value={tab} className="mt-0 focus-visible:outline-hidden">
              {tab !== "topics" && (
                <GlassCard
                  id="tracked"
                  icon={ListChecks}
                  title={TABS.find((t) => t.value === tab)?.label ?? "Tracked questions"}
                  sub={`${rows.length} question${rows.length === 1 ? "" : "s"}`}
                >
                  {rows.length === 0 ? <Empty {...EMPTY[tab]} /> : list(rows)}
                </GlassCard>
              )}

              {tab === "topics" && (
                <GlassCard
                  id="topic-progress"
                  icon={Target}
                  title="Topic progress"
                  sub="Your solved share of the tracked questions in each topic."
                >
                  {topics.length === 0 ? (
                    <Empty {...EMPTY.overview} />
                  ) : (
                    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2.5 md:grid-cols-2">
                      {topics.map(([topic, c]) => (
                        <li key={topic} className={cn(TILE, "px-4 py-3.5")}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span className="font-semibold text-ink-primary">{topic}</span>
                            <span className="text-ink-secondary">
                              {c.solved} solved of {c.tracked} tracked
                            </span>
                          </div>
                          <div
                            aria-hidden="true"
                            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-200"
                          >
                            <div
                              className="h-full rounded-full bg-verified"
                              style={{ width: `${(c.solved / c.tracked) * 100}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-xs text-ink-muted">
                    Counted from the tracked questions that are still in the catalogue (up
                    to {MAX_LOOKUPS}). Self-reported, not judged.
                  </p>
                </GlassCard>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
};

export default DsaProgressPage;
