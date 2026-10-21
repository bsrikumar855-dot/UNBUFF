import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Code2,
  Database,
  FolderOpen,
  Gauge,
  Globe,
  Laptop,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { CardHead, GLASS } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { EXPERIENCE_LABEL, PRIORITY_CHOICES, WEEKDAYS, csv } from "@/lib/placement";
import type {
  CodeLanguageId,
  PlacementExperience,
  PlacementPriority,
  PlacementProfile,
  PlacementProfileResponse,
} from "@/types/contract";

const field =
  "w-full rounded-xl border border-line-strong bg-white/70 px-3.5 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted";
const LANGS: { id: CodeLanguageId; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
];
const PRIORITY_ICON: Record<PlacementPriority, LucideIcon> = {
  dsa: Code2,
  interview: Laptop,
  dbms: Database,
  communication: Users,
  projects: FolderOpen,
};

/** A label with a small icon in front of it. The icon is decoration, so the label's text is its whole name. */
const Labelled: React.FC<{
  htmlFor: string;
  icon: LucideIcon;
  children: React.ReactNode;
}> = ({ htmlFor, icon: Icon, children }) => (
  <div className="mb-1.5 flex items-center gap-2">
    <Icon
      size={16}
      strokeWidth={1.75}
      aria-hidden="true"
      className="shrink-0 text-ink-muted"
    />
    <label htmlFor={htmlFor} className="text-sm font-medium text-ink-primary">
      {children}
    </label>
  </div>
);

export interface ProfileFormProps {
  data: PlacementProfileResponse;
  saving: boolean;
  error: unknown;
  onSave: (p: PlacementProfile) => void;
  /** Shown beside the save button when editing an existing plan. */
  onCancel?: () => void;
}

/** Goals and availability. Self-reported fields are the student's own words; they are shown beside, never inside, measured results. */
export const ProfileForm: React.FC<ProfileFormProps> = ({
  data,
  saving,
  error,
  onSave,
  onCancel,
}) => {
  const p = data.profile;
  const [roles, setRoles] = useState<string[]>(p?.role_ids ?? []);
  const [companies, setCompanies] = useState((p?.target_companies ?? []).join(", "));
  const [date, setDate] = useState(p?.placement_date ?? "");
  const [days, setDays] = useState<number[]>(p?.available_weekdays ?? [1, 2, 3, 4, 5]);
  const [minutes, setMinutes] = useState(String(p?.daily_minutes ?? 60));
  const [language, setLanguage] = useState<CodeLanguageId | "">(
    p?.preferred_language ?? ""
  );
  const [level, setLevel] = useState<PlacementExperience | "">(p?.experience_level ?? "");
  const [strengths, setStrengths] = useState((p?.strengths ?? []).join(", "));
  const [weak, setWeak] = useState((p?.weak_areas ?? []).join(", "));
  const [priorities, setPriorities] = useState<PlacementPriority[]>(
    p?.priorities ?? ["dsa", "interview"]
  );

  useEffect(() => {
    if (!p) return;
    setRoles(p.role_ids);
  }, [p]);

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const sugg = data.suggestions;

  return (
    <form
      aria-label="Placement goals and availability"
      className="grid items-stretch gap-5 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          role_ids: roles,
          target_companies: csv(companies),
          placement_date: date === "" ? null : date,
          available_weekdays: days,
          daily_minutes: Number(minutes),
          preferred_language: language === "" ? null : language,
          experience_level: level === "" ? null : level,
          strengths: csv(strengths),
          weak_areas: csv(weak),
          priorities,
        });
      }}
    >
      {sugg && (sugg.preferred_language || sugg.daily_minutes) && !p && (
        <p
          role="note"
          className="rounded-2xl border border-line bg-white/60 p-3 text-sm text-ink-secondary lg:col-span-2"
        >
          Your AI mentor remembers
          {sugg.preferred_language ? ` that you prefer ${sugg.preferred_language}` : ""}
          {sugg.daily_minutes
            ? `${sugg.preferred_language ? " and" : ""} about ${sugg.daily_minutes} minutes a day`
            : ""}
          .{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (sugg.preferred_language) setLanguage(sugg.preferred_language);
              if (sugg.daily_minutes)
                setMinutes(String(Math.max(15, Math.min(480, sugg.daily_minutes))));
            }}
          >
            Use these
          </button>{" "}
          (nothing is saved until you press Save).
        </p>
      )}

      <section
        aria-labelledby="pl-goals-h"
        className={cn(GLASS, "flex flex-col p-5 sm:p-7")}
      >
        <CardHead
          icon={Target}
          id="pl-goals-h"
          title="Your goals"
          sub="Help us understand what you're aiming for."
        />
        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-primary">
              Target roles (up to 3)
            </legend>
            <div className="flex flex-wrap gap-2">
              {data.roles.map((r) => {
                const on = roles.includes(r.id);
                return (
                  <label key={r.id} className="cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => toggle(roles, r.id, setRoles)}
                    />
                    <span
                      className={cn(
                        "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-primary peer-focus-visible:ring-offset-2",
                        on
                          ? "border-ink-primary bg-ink-primary text-surface-50"
                          : "border-line-strong bg-white/60 text-ink-secondary hover:border-ink-primary hover:text-ink-primary"
                      )}
                    >
                      {on && <Check size={14} aria-hidden="true" />}
                      {r.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div>
            <Labelled htmlFor="pl-date" icon={CalendarDays}>
              Placement or interview date (optional)
            </Labelled>
            <input
              id="pl-date"
              type="date"
              className={field}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Labelled htmlFor="pl-lang" icon={Globe}>
                Preferred language
              </Labelled>
              <select
                id="pl-lang"
                className={field}
                value={language}
                onChange={(e) => setLanguage(e.target.value as CodeLanguageId | "")}
              >
                <option value="">No preference</option>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Labelled htmlFor="pl-level" icon={Gauge}>
                Your own view of your experience
              </Labelled>
              <select
                id="pl-level"
                className={field}
                value={level}
                onChange={(e) => setLevel(e.target.value as PlacementExperience | "")}
              >
                <option value="">Not sure</option>
                {(Object.keys(EXPERIENCE_LABEL) as PlacementExperience[]).map((k) => (
                  <option key={k} value={k}>
                    {EXPERIENCE_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Labelled htmlFor="pl-strengths" icon={Sparkles}>
              Topics you feel strong in (comma separated)
            </Labelled>
            <input
              id="pl-strengths"
              className={field}
              value={strengths}
              placeholder="e.g. arrays, React, HTML, CSS"
              onChange={(e) => setStrengths(e.target.value)}
              list="pl-topics"
            />
          </div>
          <div>
            <Labelled htmlFor="pl-weak" icon={BookOpen}>
              Topics you find hard (comma separated)
            </Labelled>
            <input
              id="pl-weak"
              className={field}
              value={weak}
              placeholder="e.g. trees, DP, SQL, system design"
              onChange={(e) => setWeak(e.target.value)}
              list="pl-topics"
            />
          </div>
          <datalist id="pl-topics">
            {data.topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <div>
            <Labelled htmlFor="pl-companies" icon={Building2}>
              Companies you are aiming for (optional, comma separated)
            </Labelled>
            <input
              id="pl-companies"
              className={field}
              value={companies}
              placeholder="e.g. Google, Microsoft, Zoho"
              onChange={(e) => setCompanies(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink-muted">
              Used only as your own goal. The planner does not know what any company asks
              and will not pretend to.
            </p>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="pl-schedule-h"
        className={cn(GLASS, "flex flex-col p-5 sm:p-7")}
      >
        <CardHead
          icon={CalendarDays}
          id="pl-schedule-h"
          title="Your schedule"
          sub="Set your availability and choose what to focus on."
        />
        <div className="flex flex-1 flex-col gap-5">
          <div>
            <Labelled htmlFor="pl-minutes" icon={Clock}>
              Study minutes on each available day
            </Labelled>
            <div className="relative">
              <input
                id="pl-minutes"
                type="number"
                min={15}
                max={480}
                className={cn(field, "pr-20")}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-ink-muted"
              >
                minutes
              </span>
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 flex items-center gap-2 text-sm font-medium text-ink-primary">
              <CalendarDays
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 text-ink-muted"
              />
              Days you can study
            </legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => {
                const on = days.includes(w.value);
                return (
                  <label key={w.value} className="cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => toggle(days, w.value, setDays)}
                    />
                    <span
                      className={cn(
                        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-primary peer-focus-visible:ring-offset-2",
                        on
                          ? "border-ink-primary bg-ink-primary text-surface-50"
                          : "border-line-strong bg-white/60 text-ink-secondary hover:border-ink-primary hover:text-ink-primary"
                      )}
                    >
                      {on ? (
                        <CheckCircle2 size={15} aria-hidden="true" />
                      ) : (
                        <Circle size={15} aria-hidden="true" />
                      )}
                      {w.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="border-t border-black/5" />

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <Target
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 text-ink-muted"
              />
              What should the plan focus on?
            </legend>
            <p className="mb-2.5 mt-0.5 text-xs text-ink-muted">
              Choose the areas you want to prioritise. You can select several.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {PRIORITY_CHOICES.map((c) => {
                const on = priorities.includes(c.value);
                const Icon = PRIORITY_ICON[c.value];
                return (
                  <label key={c.value} className="cursor-pointer">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => toggle(priorities, c.value, setPriorities)}
                    />
                    <span
                      className={cn(
                        "flex min-h-16 items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-sm font-medium transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-primary peer-focus-visible:ring-offset-2",
                        on
                          ? "border-ink-primary bg-white text-ink-primary shadow-[0_8px_18px_-12px_rgba(24,24,27,0.4)]"
                          : "border-line-strong bg-white/50 text-ink-secondary hover:border-ink-primary hover:text-ink-primary"
                      )}
                    >
                      <Icon
                        size={20}
                        strokeWidth={1.6}
                        aria-hidden="true"
                        className={cn("shrink-0", on ? "text-redline" : "text-ink-muted")}
                      />
                      <span className="min-w-0 flex-1 leading-snug">{c.label}</span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
                          on
                            ? "border-ink-primary bg-ink-primary text-surface-50"
                            : "border-line-strong bg-white/70"
                        )}
                      >
                        {on && <Check size={13} strokeWidth={2.5} />}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {error !== null && <ErrorState error={error} />}
          <div className="mt-auto flex flex-col gap-2 pt-2">
            <Button type="submit" disabled={saving} className="min-h-12 w-full text-base">
              {saving ? "Saving…" : "Save goals and availability"}
              {!saving && <ArrowRight aria-hidden="true" />}
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </section>
    </form>
  );
};
