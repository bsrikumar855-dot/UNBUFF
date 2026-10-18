import React, { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/Tag";
import {
  EMPLOYMENT,
  EMPTY_PREFERENCES,
  WORK_MODES,
  splitList,
  words,
} from "@/lib/career";
import { routes } from "@/lib/routes";
import type {
  CareerFacetsResponse,
  CareerPreferences,
  CareerPreferencesResponse,
} from "@/types/contract";

const field =
  "min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-normal text-ink-primary";

const Check: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex min-h-9 items-center gap-2 text-sm text-ink-primary">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    {label}
  </label>
);

/** What the matching engine uses from the student's own record, and the few preferences that only Career needs. */
export const PreferencesSheet: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: CareerPreferencesResponse | null;
  facets: CareerFacetsResponse | null;
  onSaved: (r: CareerPreferencesResponse) => void;
}> = ({ open, onOpenChange, data, facets, onSaved }) => {
  const id = useId();
  const [draft, setDraft] = useState<CareerPreferences>(
    data?.preferences ?? EMPTY_PREFERENCES
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (open) {
      setDraft(data?.preferences ?? EMPTY_PREFERENCES);
      setError(null);
    }
  }, [open, data]);
  const set = <K extends keyof CareerPreferences>(k: K, v: CareerPreferences[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const categories = facets?.facets.category?.slice(0, 30).map((c) => c.value) ?? [];
  const profile = data?.profile;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.putCareerPreferences({
        ...draft,
        countries: draft.countries.map((c) => c.toLowerCase()),
      });
      onSaved(r);
      onOpenChange(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <SheetTitle className="serif border-b border-border px-5 py-4 text-xl font-semibold">
          Career preferences
        </SheetTitle>
        <SheetDescription className="sr-only">
          Choose what Career should use to rank jobs and internships for you.
        </SheetDescription>
        <div className="flex flex-col gap-6 px-5 py-5">
          <section aria-label="From your placement profile">
            <h3 className="eyebrow mb-2">Already known from your profile</h3>
            {profile ? (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-ink-muted">Target roles</dt>
                <dd>
                  {profile.role_names.length
                    ? profile.role_names.join(", ")
                    : "None chosen"}
                </dd>
                <dt className="text-ink-muted">Experience</dt>
                <dd>{profile.experience_level ?? "Not set (early career is assumed)"}</dd>
                <dt className="text-ink-muted">Verified skills</dt>
                <dd className="flex flex-wrap gap-1">
                  {profile.verified_skills.length
                    ? profile.verified_skills.map((s) => (
                        <Tag key={s} tone="verified">
                          {s}
                        </Tag>
                      ))
                    : "None yet: they come from graded practice."}
                </dd>
                <dt className="text-ink-muted">From your resume</dt>
                <dd className="flex flex-wrap items-center gap-1">
                  {profile.resume_skills.length
                    ? profile.resume_skills.map((s) => (
                        <Tag key={s} tone="self">
                          {s}
                        </Tag>
                      ))
                    : "None yet."}{" "}
                  <Link
                    to="/mentor/memory"
                    className="text-redline underline underline-offset-4"
                  >
                    {profile.resume_skills.length
                      ? "Update in Memory"
                      : "Upload your resume in Memory"}
                  </Link>
                </dd>
                <dt className="text-ink-muted">Stated skills</dt>
                <dd className="flex flex-wrap gap-1">
                  {profile.self_reported_skills.length
                    ? profile.self_reported_skills.map((s) => (
                        <Tag key={s} tone="self">
                          {s}
                        </Tag>
                      ))
                    : "None"}
                </dd>
              </dl>
            ) : (
              <p className="text-sm text-ink-secondary">Loading…</p>
            )}
            <p className="mt-2 text-sm text-ink-secondary">
              Roles, experience and language come from{" "}
              <Link
                to={routes.placement}
                className="text-redline underline underline-offset-4"
              >
                your placement goals
              </Link>
              . Nothing is guessed for you.
            </p>
          </section>

          <form
            onSubmit={save}
            className="flex flex-col gap-5"
            aria-label="Career preferences form"
          >
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-primary">
                Role categories you want
              </legend>
              {categories.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Category choices load from Freehire when you open Filters on a job tab.
                  Current: {draft.categories.map(words).join(", ") || "none"}.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-x-3">
                  {categories.map((c) => (
                    <Check
                      key={c}
                      label={words(c)}
                      checked={draft.categories.includes(c)}
                      onChange={() =>
                        set("categories", toggle(draft.categories, c).slice(0, 6))
                      }
                    />
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-ink-muted">
                At most six. They add to the categories of your target roles.
              </p>
            </fieldset>

            <label
              className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
              htmlFor={`${id}-skills`}
            >
              Other skills you have
              <input
                id={`${id}-skills`}
                className={field}
                value={draft.skills.join(", ")}
                onChange={(e) =>
                  set("skills", splitList(e.target.value.toLowerCase()).slice(0, 20))
                }
                placeholder="python, sql, docker"
              />
              <span className="text-xs font-normal text-ink-muted">
                Counted as self-reported, below skills you have verified through graded
                practice. Use Freehire's skill names.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label
                className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
                htmlFor={`${id}-countries`}
              >
                Countries (two-letter codes)
                <input
                  id={`${id}-countries`}
                  className={field}
                  value={draft.countries.join(", ")}
                  onChange={(e) =>
                    set("countries", splitList(e.target.value.toLowerCase()).slice(0, 8))
                  }
                  placeholder="in, us, gb"
                />
              </label>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium text-ink-primary"
                htmlFor={`${id}-cities`}
              >
                Cities
                <input
                  id={`${id}-cities`}
                  className={field}
                  value={draft.cities.join(", ")}
                  onChange={(e) => set("cities", splitList(e.target.value).slice(0, 8))}
                  placeholder="Bengaluru, London"
                />
              </label>
            </div>

            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink-primary">
                Work mode
              </legend>
              <div className="flex flex-wrap gap-x-5">
                {WORK_MODES.map((m) => (
                  <Check
                    key={m}
                    label={m}
                    checked={draft.work_modes.includes(m)}
                    onChange={() => set("work_modes", toggle(draft.work_modes, m))}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink-primary">
                Employment type
              </legend>
              <div className="flex flex-wrap gap-x-5">
                {EMPLOYMENT.map((m) => (
                  <Check
                    key={m}
                    label={m.replace("_", "-")}
                    checked={draft.employment_types.includes(m)}
                    onChange={() =>
                      set("employment_types", toggle(draft.employment_types, m))
                    }
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Leave empty to see both internships and full-time roles in For you.
              </p>
            </fieldset>

            <fieldset className="border-t border-line pt-4">
              <legend className="mb-1 text-sm font-medium text-ink-primary">
                Treat as a must-have
              </legend>
              <Check
                label="Location (country or city above)"
                checked={draft.must_match_location}
                onChange={(v) => set("must_match_location", v)}
              />
              <Check
                label="Work mode"
                checked={draft.must_match_work_mode}
                onChange={(v) => set("must_match_work_mode", v)}
              />
              <Check
                label="Employment type"
                checked={draft.must_match_employment}
                onChange={(v) => set("must_match_employment", v)}
              />
              <p className="mt-1 text-xs text-ink-muted">
                A posting known to break a must-have is left out of For you. One that
                doesn't say is kept and marked as unconfirmed.
              </p>
            </fieldset>

            {error !== null && <ErrorState error={error} />}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save preferences"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
};
