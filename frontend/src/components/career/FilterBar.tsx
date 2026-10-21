import React, { useEffect, useId, useState } from "react";
import { Check, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { GLASS } from "@/components/ui/GlassCard";
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
  "min-h-10 w-full rounded-xl border border-line-strong bg-white/70 px-3 py-2 text-sm font-normal text-ink-primary placeholder:text-ink-muted";

/** The box in front of a checkbox label. The real input stays in the page, hidden, so keyboards and screen readers use it. */
const Box: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    aria-hidden="true"
    className={cn(
      "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-primary peer-focus-visible:ring-offset-2",
      on
        ? "border-ink-primary bg-ink-primary text-surface-50"
        : "border-line-strong bg-white"
    )}
  >
    {on && <Check size={12} strokeWidth={3} />}
  </span>
);

/** A list of checkboxes with how many postings each would match, when Freehire has said so. */
const CheckList: React.FC<{
  legend: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
  counts?: Map<string, number>;
  format?: (v: string) => string;
}> = ({
  legend,
  options,
  value,
  onChange,
  counts,
  format = (v) => v.replace("_", "-"),
}) => (
  <fieldset className="min-w-0">
    <legend className="mb-1.5 text-sm font-semibold text-ink-primary">{legend}</legend>
    <div className="flex flex-col">
      {options.map((o) => {
        const on = value.includes(o);
        const n = counts?.get(o);
        return (
          <div
            key={o}
            className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-white/60"
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm text-ink-primary">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={on}
                onChange={() =>
                  onChange(on ? value.filter((v) => v !== o) : [...value, o])
                }
              />
              <Box on={on} />
              {format(o)}
            </label>
            {n !== undefined && (
              <span aria-hidden="true" className="num text-xs text-ink-muted">
                {n.toLocaleString("en-US")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  </fieldset>
);

/** One checkbox on its own line. */
const Check1: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}> = ({ checked, onChange, children }) => (
  <label className="flex cursor-pointer items-start gap-2.5 px-1 py-1 text-sm leading-snug text-ink-primary">
    <input
      type="checkbox"
      className="peer sr-only"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="mt-px">
      <Box on={checked} />
    </span>
    <span>{children}</span>
  </label>
);

const countsOf = (facets: CareerFacetsResponse | null, name: string) =>
  new Map((facets?.facets[name] ?? []).map((f) => [f.value, f.count]));

/**
 * Search and filters for the job feeds, as a card beside the results. Nothing is sent until the student applies, and
 * every filter that is applied is shown as a removable chip by the page, so the result list never silently reflects a
 * hidden setting.
 */
export const FilterBar: React.FC<{
  tab: CareerTab;
  filters: CareerFilters;
  facets: CareerFacetsResponse | null;
  onApply: (f: CareerFilters) => void;
  onReset: () => void;
  onOpenFacets: () => void;
  busy?: boolean;
  className?: string;
}> = ({ tab, filters, facets, onApply, onReset, onOpenFacets, busy, className }) => {
  const id = useId();
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters]);
  useEffect(() => onOpenFacets(), [onOpenFacets]);
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
      className={cn(GLASS, "flex flex-col gap-5 p-5", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink-primary">
          <Filter size={20} strokeWidth={1.75} aria-hidden="true" />
          Filters
        </h2>
        <button
          type="button"
          className="text-sm font-medium text-redline underline underline-offset-4"
          onClick={() => {
            setDraft({ ...DEFAULT_FILTERS });
            onReset();
          }}
        >
          Reset all
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-q`} className="text-sm font-semibold text-ink-primary">
          Search
        </label>
        <span className="relative">
          <input
            id={`${id}-q`}
            type="search"
            className={cn(field, "pr-11")}
            value={draft.q}
            maxLength={200}
            onChange={(e) => set("q", e.target.value)}
            placeholder={
              personal ? "Narrow the recommendations…" : "Title, company or keyword"
            }
          />
          <button
            type="submit"
            disabled={busy}
            className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-full text-ink-muted transition-colors hover:text-ink-primary disabled:opacity-50"
          >
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search</span>
          </button>
        </span>
      </div>

      <label
        className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
        htmlFor={`${id}-in`}
      >
        Search in
        <select
          id={`${id}-in`}
          className={field}
          value={draft.search_in}
          onChange={(e) => set("search_in", e.target.value as CareerFilters["search_in"])}
        >
          <option value="all">Everything</option>
          <option value="title">Job title</option>
          <option value="company">Company</option>
        </select>
      </label>

      <CheckList
        legend="Work mode"
        options={WORK_MODES}
        value={draft.work_mode}
        onChange={(v) => set("work_mode", v)}
        counts={countsOf(facets, "work_mode")}
      />

      {explore && (
        <CheckList
          legend="Employment type"
          options={EMPLOYMENT}
          value={draft.employment_type}
          onChange={(v) => set("employment_type", v)}
          counts={countsOf(facets, "employment_type")}
        />
      )}
      {explore && (
        <CheckList
          legend="Seniority"
          options={SENIORITIES}
          value={draft.seniority}
          onChange={(v) => set("seniority", v)}
          counts={countsOf(facets, "seniority")}
          format={(v) => v}
        />
      )}

      {!personal && (
        <label
          className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
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
          className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
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
            Names must match Freehire's city list, and a country plus a city means either,
            not both.
          </span>
        </label>
      )}

      {!personal && (
        <label
          className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
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
          className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
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

      <label
        className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
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
          className="flex flex-col gap-1.5 text-sm font-semibold text-ink-primary"
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

      <div className="flex flex-col gap-0.5">
        {tab === "jobs" && (
          <Check1 checked={draft.broaden} onChange={(v) => set("broaden", v)}>
            Include mid-level roles (few intern or junior postings match some searches)
          </Check1>
        )}
        <Check1 checked={draft.include_stale} onChange={(v) => set("include_stale", v)}>
          Include older postings (by default only postings Freehire rates fresh are shown)
        </Check1>
        {explore && (
          <Check1 checked={!draft.tech_only} onChange={(v) => set("tech_only", !v)}>
            Include non-technical roles
          </Check1>
        )}
      </div>

      <Button type="submit" disabled={busy} className="min-h-11 w-full rounded-full">
        Apply filters
      </Button>
    </form>
  );
};
