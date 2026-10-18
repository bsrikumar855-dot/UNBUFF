import React, { useEffect, useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  DEFAULT_FILTERS,
  EMPLOYMENT,
  SENIORITIES,
  WORK_MODES,
  splitList,
  words,
  type CareerFilters,
} from "@/lib/career";
import type { CareerFacetsResponse, CareerTab } from "@/types/contract";

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-ink-primary";

const Toggle: React.FC<{
  legend: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  format?: (v: string) => string;
}> = ({ legend, options, value, onChange, format = (v) => v.replace("_", "-") }) => (
  <fieldset className="min-w-0">
    <legend className="mb-1.5 text-sm font-medium text-ink-primary">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <label
            key={o}
            className={cn(
              "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
              on
                ? "border-ink-primary bg-ink-primary text-surface-50"
                : "border-line-strong bg-surface text-ink-primary hover:border-ink-primary"
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={on}
              onChange={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            />
            {format(o)}
          </label>
        );
      })}
    </div>
  </fieldset>
);

/**
 * Search and filters for the job feeds. Nothing is sent until the student applies, and every filter that is applied is
 * shown as a removable chip by the page, so the result list never silently reflects a hidden setting.
 */
export const FilterBar: React.FC<{
  tab: CareerTab;
  filters: CareerFilters;
  facets: CareerFacetsResponse | null;
  onApply: (f: CareerFilters) => void;
  onReset: () => void;
  onOpenFacets: () => void;
  busy?: boolean;
}> = ({ tab, filters, facets, onApply, onReset, onOpenFacets, busy }) => {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const [more, setMore] = useState(false);
  useEffect(() => setDraft(filters), [filters]);
  const set = <K extends keyof CareerFilters>(k: K, v: CareerFilters[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const explore = tab === "explore";
  const personal = tab === "for_you";
  const categories = facets?.facets.category?.slice(0, 40) ?? [];
  const countries = facets?.facets.countries?.slice(0, 40) ?? [];
  const skills = facets?.facets.skills?.slice(0, 60) ?? [];

  return (
    <form
      role="search"
      aria-label="Search and filter jobs"
      className="flex flex-col gap-4 border-y border-line py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto_auto]">
        <label
          className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
          htmlFor={`${id}-q`}
        >
          Search
          <input
            id={`${id}-q`}
            type="search"
            className={field}
            value={draft.q}
            maxLength={200}
            onChange={(e) => set("q", e.target.value)}
            placeholder={
              personal ? "Narrow the recommendations…" : "Title, company or keyword"
            }
          />
        </label>
        <label
          className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
          htmlFor={`${id}-in`}
        >
          Search in
          <select
            id={`${id}-in`}
            className={field}
            value={draft.search_in}
            onChange={(e) =>
              set("search_in", e.target.value as CareerFilters["search_in"])
            }
          >
            <option value="all">Everything</option>
            <option value="title">Job title</option>
            <option value="company">Company</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">
            Search
          </Button>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            aria-expanded={more}
            onClick={() => {
              setMore((v) => !v);
              if (!more) onOpenFacets();
            }}
            className="w-full sm:w-auto"
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
          </Button>
        </div>
      </div>

      {more && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Toggle
            legend="Work mode"
            options={WORK_MODES}
            value={draft.work_mode}
            onChange={(v) => set("work_mode", v)}
          />
          {!personal && (
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-country`}
            >
              Country
              <select
                id={`${id}-country`}
                className={field}
                value={draft.countries[0] ?? ""}
                onChange={(e) => set("countries", e.target.value ? [e.target.value] : [])}
              >
                <option value="">Any country</option>
                {countries.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value.toUpperCase()} ({c.count.toLocaleString("en-US")})
                  </option>
                ))}
              </select>
            </label>
          )}
          {explore && (
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-city`}
            >
              Cities (comma separated)
              <input
                id={`${id}-city`}
                className={field}
                value={draft.cities.join(", ")}
                onChange={(e) => set("cities", splitList(e.target.value))}
                placeholder="Bengaluru, London"
              />
              <span className="text-xs font-normal text-ink-muted">
                Names must match Freehire's city list, and a country plus a city means
                either, not both.
              </span>
            </label>
          )}
          {!personal && (
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-cat`}
            >
              Role category
              <select
                id={`${id}-cat`}
                className={field}
                value={draft.category[0] ?? ""}
                onChange={(e) => set("category", e.target.value ? [e.target.value] : [])}
              >
                <option value="">Any category</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {words(c.value)} ({c.count.toLocaleString("en-US")})
                  </option>
                ))}
              </select>
            </label>
          )}
          {!personal && (
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-skills`}
            >
              Skills (comma separated)
              <input
                id={`${id}-skills`}
                className={field}
                list={`${id}-skill-list`}
                value={draft.skills.join(", ")}
                onChange={(e) => set("skills", splitList(e.target.value))}
                placeholder="react, typescript"
              />
              <datalist id={`${id}-skill-list`}>
                {skills.map((s) => (
                  <option key={s.value} value={s.value} />
                ))}
              </datalist>
              <span className="text-xs font-normal text-ink-muted">
                Postings that list any of these skills. Use Freehire's skill names, for
                example nodejs or cpp.
              </span>
            </label>
          )}
          {explore && (
            <Toggle
              legend="Seniority"
              options={SENIORITIES}
              value={draft.seniority}
              onChange={(v) => set("seniority", v)}
              format={(v) => v}
            />
          )}
          {explore && (
            <Toggle
              legend="Employment type"
              options={EMPLOYMENT}
              value={draft.employment_type}
              onChange={(v) => set("employment_type", v)}
            />
          )}
          {tab === "jobs" && (
            <label className="flex items-center gap-2 text-sm text-ink-primary">
              <input
                type="checkbox"
                checked={draft.broaden}
                onChange={(e) => set("broaden", e.target.checked)}
              />
              Include mid-level roles (few intern or junior postings match some searches)
            </label>
          )}
          {!personal && (
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-sort`}
            >
              Order
              <select
                id={`${id}-sort`}
                className={field}
                value={draft.sort ?? ""}
                onChange={(e) =>
                  set("sort", (e.target.value || null) as CareerFilters["sort"])
                }
              >
                <option value="">
                  {explore
                    ? "Freehire's order (newest first, or relevance when searching)"
                    : "Best match (the 100 most recent, ranked)"}
                </option>
                {!explore && (
                  <option value="newest">
                    Newest first (pages through every posting)
                  </option>
                )}
                {explore && (
                  <option value="best_match">
                    Best match (the 100 most recent, ranked)
                  </option>
                )}
              </select>
            </label>
          )}
          <label
            className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
            htmlFor={`${id}-days`}
          >
            Posted within
            <select
              id={`${id}-days`}
              className={field}
              value={draft.posted_within_days ?? ""}
              onChange={(e) =>
                set("posted_within_days", e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Any time</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          {explore && (
            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-salary`}
            >
              Minimum salary
              <input
                id={`${id}-salary`}
                type="number"
                min={0}
                className={field}
                value={draft.salary_min ?? ""}
                onChange={(e) =>
                  set("salary_min", e.target.value ? Number(e.target.value) : null)
                }
              />
              <span className="text-xs font-normal text-ink-muted">
                Only postings that state a salary can match; most do not.
              </span>
            </label>
          )}
          <div className="flex flex-col gap-2 text-sm text-ink-primary">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.include_stale}
                onChange={(e) => set("include_stale", e.target.checked)}
              />
              Include older postings (by default only postings Freehire rates fresh are
              shown)
            </label>
            {explore && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!draft.tech_only}
                  onChange={(e) => set("tech_only", !e.target.checked)}
                />
                Include non-technical roles
              </label>
            )}
          </div>
        </div>
      )}
      {more && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            Apply filters
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft({ ...DEFAULT_FILTERS });
              onReset();
            }}
          >
            Reset all
          </Button>
        </div>
      )}
    </form>
  );
};
