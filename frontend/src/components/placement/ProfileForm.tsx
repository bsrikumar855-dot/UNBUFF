import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { EXPERIENCE_LABEL, PRIORITY_CHOICES, WEEKDAYS, csv } from "@/lib/placement";
import type {
  CodeLanguageId,
  PlacementExperience,
  PlacementPriority,
  PlacementProfile,
  PlacementProfileResponse,
} from "@/types/contract";

const field = "w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm";
const LANGS: { id: CodeLanguageId; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
];

export interface ProfileFormProps {
  data: PlacementProfileResponse;
  saving: boolean;
  error: unknown;
  onSave: (p: PlacementProfile) => void;
}

/** Goals and availability. Self-reported fields are the student's own words; they are shown beside, never inside, measured results. */
export const ProfileForm: React.FC<ProfileFormProps> = ({
  data,
  saving,
  error,
  onSave,
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
      className="flex flex-col gap-4"
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
          className="rounded-md border border-line bg-surface-50 p-3 text-sm text-ink-secondary"
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

      <fieldset>
        <legend className="text-sm font-medium text-ink-primary">
          Target roles (up to 3)
        </legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {data.roles.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-1.5 text-sm text-ink-secondary"
            >
              <input
                type="checkbox"
                checked={roles.includes(r.id)}
                onChange={() => toggle(roles, r.id, setRoles)}
              />
              {r.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="pl-date"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Placement or interview date (optional)
          </label>
          <input
            id="pl-date"
            type="date"
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="pl-minutes"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Study minutes on each available day
          </label>
          <input
            id="pl-minutes"
            type="number"
            min={15}
            max={480}
            className={field}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-primary">
          Days you can study
        </legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {WEEKDAYS.map((w) => (
            <label
              key={w.value}
              className="flex items-center gap-1.5 text-sm text-ink-secondary"
            >
              <input
                type="checkbox"
                checked={days.includes(w.value)}
                onChange={() => toggle(days, w.value, setDays)}
              />
              {w.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="pl-lang"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Preferred language
          </label>
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
          <label
            htmlFor="pl-level"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Your own view of your experience
          </label>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="pl-strengths"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Topics you feel strong in (comma separated)
          </label>
          <input
            id="pl-strengths"
            className={field}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            list="pl-topics"
          />
        </div>
        <div>
          <label
            htmlFor="pl-weak"
            className="mb-1 block text-sm font-medium text-ink-primary"
          >
            Topics you find hard (comma separated)
          </label>
          <input
            id="pl-weak"
            className={field}
            value={weak}
            onChange={(e) => setWeak(e.target.value)}
            list="pl-topics"
          />
        </div>
        <datalist id="pl-topics">
          {data.topics.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div>
        <label
          htmlFor="pl-companies"
          className="mb-1 block text-sm font-medium text-ink-primary"
        >
          Companies you are aiming for (optional, comma separated)
        </label>
        <input
          id="pl-companies"
          className={field}
          value={companies}
          onChange={(e) => setCompanies(e.target.value)}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Used only as your own goal. The planner does not know what any company asks and
          will not pretend to.
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-primary">
          What should the plan focus on?
        </legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {PRIORITY_CHOICES.map((c) => (
            <label
              key={c.value}
              className="flex items-center gap-1.5 text-sm text-ink-secondary"
            >
              <input
                type="checkbox"
                checked={priorities.includes(c.value)}
                onChange={() => toggle(priorities, c.value, setPriorities)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error !== null && <ErrorState error={error} />}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save goals and availability"}
        </Button>
      </div>
    </form>
  );
};
