import React, { useEffect, useId, useState } from "react";
import { UserRound } from "lucide-react";
import { api } from "@/api/endpoints";
import { useAuth } from "@/auth/context";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { GlassCard } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { setCachedAccountProfile, useAccountProfile } from "@/hooks/useAccountProfile";
import { useRoles } from "@/hooks/useRoles";
import type { AccountProfileUpdate } from "@/types/contract";

export const FIELD =
  "w-full rounded-xl border border-line-strong bg-white/70 px-3.5 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

const THIS_YEAR = new Date().getFullYear();

/** Name, college, graduation year and target role. Saved to the student's own profile on the server. */
export const ProfilePanel: React.FC = () => {
  const auth = useAuth();
  const { profile, error: loadError, loading, reload } = useAccountProfile();
  const { roles } = useRoles();
  const [form, setForm] = useState({ display_name: "", college: "", graduation_year: "", target_role_id: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const ids = { name: useId(), college: useId(), year: useId(), role: useId() };

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name ?? "",
      college: profile.college ?? "",
      graduation_year: profile.graduation_year?.toString() ?? "",
      target_role_id: profile.target_role_id ?? "",
    });
  }, [profile]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const year = form.graduation_year.trim() === "" ? null : Number(form.graduation_year);
  const yearInvalid = year !== null && (!Number.isInteger(year) || year < 1990 || year > 2100);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (yearInvalid || !auth.user) return;
    setSaving(true);
    setSaveError(null);
    const body: AccountProfileUpdate = {
      display_name: form.display_name.trim() || null,
      college: form.college.trim() || null,
      graduation_year: year,
      target_role_id: form.target_role_id || null,
    };
    try {
      const r = await api.saveAccountProfile(body);
      setCachedAccountProfile(auth.user.uid, r.profile);
      setSaved(true);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard id="profile" icon={UserRound} title="Profile" sub="How UNBLUFF addresses you, and what you're preparing for.">
      {loading && <LoadingState message="Loading your profile…" />}
      {loadError !== null && <ErrorState error={loadError} onRetry={reload} />}
      {!loading && loadError === null && (
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor={ids.name} className={LABEL}>
              Display name
            </label>
            <input id={ids.name} className={FIELD} value={form.display_name} onChange={set("display_name")} maxLength={60} autoComplete="name" placeholder="e.g. Asha Rao" />
          </div>
          <div>
            <label htmlFor={ids.college} className={LABEL}>
              College
            </label>
            <input id={ids.college} className={FIELD} value={form.college} onChange={set("college")} maxLength={120} autoComplete="organization" placeholder="e.g. IIT Madras" />
          </div>
          <div>
            <label htmlFor={ids.year} className={LABEL}>
              Graduation year
            </label>
            <input
              id={ids.year}
              className={FIELD}
              value={form.graduation_year}
              onChange={set("graduation_year")}
              inputMode="numeric"
              placeholder={String(THIS_YEAR + 1)}
              aria-invalid={yearInvalid || undefined}
              aria-describedby={yearInvalid ? `${ids.year}-err` : undefined}
            />
            {yearInvalid && (
              <p id={`${ids.year}-err`} className="mt-1 text-xs text-verdict-bluff-fg">
                Enter a year between 1990 and 2100.
              </p>
            )}
          </div>
          <div>
            <label htmlFor={ids.role} className={LABEL}>
              Target role
            </label>
            <select id={ids.role} className={FIELD} value={form.target_role_id} onChange={set("target_role_id")}>
              <option value="">Not decided yet</option>
              {(roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" className="rounded-full" disabled={saving || yearInvalid}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
            {saved && (
              <p role="status" className="text-sm text-ink-secondary">
                Saved.
              </p>
            )}
          </div>
          {saveError !== null && <ErrorState error={saveError} className="sm:col-span-2" />}
        </form>
      )}
    </GlassCard>
  );
};
