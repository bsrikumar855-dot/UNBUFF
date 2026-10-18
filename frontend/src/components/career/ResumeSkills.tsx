import React, { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ResumeInput } from "@/components/setup/ResumeInput";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tag } from "@/components/ui/Tag";
import { routes } from "@/lib/routes";
import type { ResumeSkillSuggestion, ResumeSkillsResponse } from "@/types/contract";

/**
 * Skills taken directly from the student's own resume, for Career matching. The PDF is read in the browser; only its
 * text is sent, only to find skills, and neither the file nor the text is stored. The student reviews what was found
 * and keeps only what they confirm. A skill from a resume is a claim: it is labelled "from your resume" and never
 * counts as verified.
 */
export const ResumeSkillsSection: React.FC = () => {
  const headingId = useId();
  const [saved, setSaved] = useState<ResumeSkillsResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [text, setText] = useState("");
  const [found, setFound] = useState<ResumeSkillSuggestion[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"find" | "save" | "remove" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getResumeSkills())
      .then((r) => !cancelled && r && setSaved(r))
      .catch((e: unknown) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  const find = async () => {
    setBusy("find");
    setError(null);
    setNotice(null);
    try {
      const r = await api.extractResumeSkills(text);
      setFound(r.skills);
      setChosen(new Set(r.skills.map((s) => s.slug)));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const r = await api.saveResumeSkills([...chosen]);
      setSaved(r);
      setFound(null);
      setText("");
      setNotice(
        r.skills.length
          ? `Saved ${r.skills.length} skill${r.skills.length === 1 ? "" : "s"}. Career will use them from now on.`
          : "Nothing was kept."
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    try {
      await api.deleteResumeSkills();
      setSaved({ skills: [], saved_at: null });
      setNotice("Your resume skills were removed.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (slug: string) =>
    setChosen((c) => {
      const n = new Set(c);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  return (
    <section aria-labelledby={headingId} className="mt-10 border-t border-line pt-8">
      <h2 id={headingId} className="text-lg font-semibold text-ink-primary">
        Skills from your resume
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
        Upload your resume and UNBLUFF finds the technical skills it mentions, so{" "}
        <Link to={routes.career} className="text-redline underline underline-offset-4">
          Career
        </Link>{" "}
        can match jobs to what you actually list. Your PDF is read in your browser. Only
        its text is sent, only to find skills, and neither the file nor the text is
        stored: you keep just the skills you confirm below, and you can remove them
        whenever you like. Skills from a resume count as stated by you, not as verified.
      </p>

      {loadError !== null && <ErrorState className="mt-4" error={loadError} />}

      {saved && saved.skills.length > 0 && (
        <div className="mt-5" aria-label="Saved resume skills">
          <p className="text-sm font-medium text-ink-primary">
            Kept from your resume
            {saved.saved_at ? ` (${new Date(saved.saved_at).toLocaleDateString()})` : ""}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {saved.skills.map((s) => (
              <Tag key={s.slug} tone="self">
                {s.label}
              </Tag>
            ))}
          </p>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void remove()}
          >
            Remove my resume skills
          </Button>
        </div>
      )}
      {saved && saved.skills.length === 0 && !found && (
        <p className="mt-4 text-sm text-ink-secondary">No resume skills saved yet.</p>
      )}

      {notice && (
        <p
          role="status"
          className="mt-4 border-l-2 border-line-strong pl-3 text-sm text-ink-primary"
        >
          {notice}
        </p>
      )}

      {!found && (
        <div className="mt-6 max-w-3xl">
          <ResumeInput value={text} onChange={setText} />
          <Button
            className="mt-3"
            disabled={busy !== null || text.trim().length === 0}
            onClick={() => void find()}
          >
            {busy === "find"
              ? "Reading…"
              : saved && saved.skills.length > 0
                ? "Find skills in this resume and replace"
                : "Find skills in this resume"}
          </Button>
        </div>
      )}

      {found && (
        <div className="mt-6 max-w-3xl" aria-label="Skills found in your resume">
          {found.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              No skills this app recognises were found in that text. Check that it is the
              full text of your resume, or add skills by hand in your Career preferences.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-primary">
                Found {found.length} skill{found.length === 1 ? "" : "s"}. Keep the ones
                that are true for you.
              </p>
              <div className="mt-2 flex gap-3 text-sm">
                <button
                  type="button"
                  className="text-redline underline underline-offset-4"
                  onClick={() => setChosen(new Set(found.map((s) => s.slug)))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-redline underline underline-offset-4"
                  onClick={() => setChosen(new Set())}
                >
                  Select none
                </button>
              </div>
              <ul className="mt-3 border-t border-line">
                {found.map((s) => (
                  <li key={s.slug} className="border-b border-line py-2.5">
                    <label className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                      <input
                        type="checkbox"
                        checked={chosen.has(s.slug)}
                        onChange={() => toggle(s.slug)}
                      />
                      <span className="font-medium text-ink-primary">{s.label}</span>
                      <span className="text-xs text-ink-muted">
                        mentioned {s.mentions} time{s.mentions === 1 ? "" : "s"}
                      </span>
                      <span className="basis-full break-words pl-7 text-xs text-ink-secondary">
                        “{s.evidence}”
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {found.length > 0 && (
              <Button disabled={busy !== null} onClick={() => void save()}>
                {busy === "save"
                  ? "Saving…"
                  : chosen.size === 0
                    ? "Save none (clears saved skills)"
                    : `Save ${chosen.size} skill${chosen.size === 1 ? "" : "s"}`}
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setFound(null)}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {error !== null && <ErrorState className="mt-4 max-w-3xl" error={error} />}
    </section>
  );
};
