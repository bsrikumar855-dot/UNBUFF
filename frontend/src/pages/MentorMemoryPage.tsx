import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import { Pager } from "@/components/dsa/DsaBits";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PROVENANCE_LABEL, TYPE_EXPLAIN, TYPE_LABEL } from "@/lib/mentor";
import { routes } from "@/lib/routes";
import type { CodeLanguageId, ExplanationStyle, MemoryType, MentorMemoriesResponse, MentorMemory, MentorProfile, SkillLevel } from "@/types/contract";

const TYPES: MemoryType[] = ["profile", "learning", "summary", "goal"];
const LANGS: { id: CodeLanguageId; label: string }[] = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
];
const field = "w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm";
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

/** Everything the mentor keeps, in one place: view it, correct your profile, edit or delete anything, or clear it all. */
const MentorMemoryPage: React.FC = () => {
  const [tab, setTab] = useState<MemoryType | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MentorMemoriesResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listMentorMemories({ type: tab === "all" ? undefined : tab, page, page_size: 20 })
      .then((r) => !cancelled && setData(r))
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [tab, page, attempt]);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-muted">
        <Link to={routes.mentor()} className="underline">
          AI Mentor
        </Link>{" "}
        / Memory
      </nav>
      <h1 className="text-2xl font-bold text-ink-primary">What your mentor remembers</h1>

      <section aria-labelledby="why-heading" className="mt-4 rounded-lg border border-line bg-white p-4 text-sm text-ink-secondary">
        <h2 id="why-heading" className="mb-1 text-base font-semibold text-ink-primary">
          What is kept, and why
        </h2>
        <p>
          The mentor saves a few things so it does not start from zero each time: your profile and goals, notes about what you say you understand or find hard, and short summaries of longer conversations. Only things you actually said are saved
          as notes. Your practice results are never copied here: the mentor reads them live from your verified submissions, so they cannot go stale.
        </p>
        {data && (
          <ul className="mt-2 list-disc pl-5">
            <li>Conversations are deleted {data.retention.conversation_days} days after their last message.</li>
            <li>Learning notes expire after {data.retention.learning_days} days; summaries after {data.retention.summary_days} days.</li>
            <li>Profile and goals stay {data.retention.profile_and_goals}.</li>
          </ul>
        )}
        <p className="mt-2">Deleting memory here never deletes your submissions, progress, analytics or interview results. Messages are sent to the AI model to produce answers; avoid sharing passwords or personal identifiers.</p>
      </section>

      <ProfileForm onSaved={reload} />

      <section aria-labelledby="memories-heading" className="mt-8">
        <h2 id="memories-heading" className="mb-3 text-lg font-semibold text-ink-primary">
          Saved memories
        </h2>
        <div role="tablist" aria-label="Memory type" className="mb-3 flex flex-wrap gap-2">
          {(["all", ...TYPES] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${tab === t ? "border-primary bg-primary-soft text-primary-dark" : "border-line-strong bg-white text-ink-primary hover:bg-surface-100"}`}
            >
              {t === "all" ? "All" : TYPE_LABEL[t]}
              {data && ` (${t === "all" ? Object.values(data.counts).reduce((a, b) => a + b, 0) : data.counts[t]})`}
            </button>
          ))}
        </div>
        {tab !== "all" && <p className="mb-3 text-sm text-ink-secondary">{TYPE_EXPLAIN[tab]}</p>}

        {error !== null && <ErrorState error={error} onRetry={reload} />}
        {actionError !== null && <ErrorState error={actionError} className="mb-3" />}
        {error === null && data === null && <LoadingState message="Loading your memories…" />}
        {data && data.memories.length === 0 && <p className="rounded-md border border-line bg-white p-4 text-sm text-ink-secondary">Nothing saved here.</p>}
        {data && data.memories.length > 0 && (
          <ul className="flex flex-col gap-3">
            {data.memories.map((m) => (
              <MemoryItem key={m.id} memory={m} onSave={(body) => run(() => api.patchMentorMemory(m.id, body))} onDelete={() => run(() => api.deleteMentorMemory(m.id))} />
            ))}
          </ul>
        )}
        {data && <Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />}
        <AddGoal onAdd={(content, questionId) => run(() => api.createMentorMemory({ type: "goal", content, ...(questionId ? { track: { kind: "question_solved" as const, question_id: questionId } } : {}) }))} />
      </section>

      <ClearAll onClear={(withConversations) => run(() => api.clearMentorMemories(withConversations))} />
    </div>
  );
};

const MemoryItem: React.FC<{
  memory: MentorMemory;
  onSave: (body: { content?: string; status?: "active" | "completed" | "dismissed" }) => Promise<void>;
  onDelete: () => Promise<void>;
}> = ({ memory: m, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [confirm, setConfirm] = useState(false);
  const expires = when(m.expires_at);
  return (
    <li className="rounded-lg border border-line bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink-primary">
          {TYPE_LABEL[m.type]}
          {m.topic ? ` · ${m.topic}` : ""}
          {m.signal ? ` · ${m.signal}` : ""}
        </span>
        <span className="text-xs text-ink-muted">{PROVENANCE_LABEL[m.provenance]}</span>
      </div>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <label className="sr-only" htmlFor={`edit-${m.id}`}>
            Edit memory
          </label>
          <textarea id={`edit-${m.id}`} className={field} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await onSave({ content: text });
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-ink-secondary">{m.content}</p>
      )}
      <p className="mt-2 text-xs text-ink-muted">
        Updated {new Date(m.updated_at).toLocaleDateString()} · {expires ? `expires ${expires}` : "kept until you delete it"}
        {m.review_at ? ` · review ${when(m.review_at)}` : ""}
        {m.type === "goal" && m.status ? ` · ${m.status}${m.completed_by === "verified_activity" ? " (verified by your practice)" : m.completed_by === "student" ? " (marked by you)" : ""}` : ""}
        {m.track ? ` · tracked: ${m.track.kind.replace(/_/g, " ")}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {m.type !== "profile" && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        {m.type === "goal" && m.status === "active" && (
          <>
            <Button variant="secondary" size="sm" onClick={() => void onSave({ status: "completed" })}>
              Mark done
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void onSave({ status: "dismissed" })}>
              Dismiss
            </Button>
          </>
        )}
        {m.type === "goal" && m.status !== "active" && (
          <Button variant="ghost" size="sm" onClick={() => void onSave({ status: "active" })}>
            Reactivate
          </Button>
        )}
        {confirm ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => void onDelete()}>
              Confirm delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        )}
      </div>
    </li>
  );
};

const AddGoal: React.FC<{ onAdd: (content: string, questionId: string) => Promise<void> }> = ({ onAdd }) => {
  const [content, setContent] = useState("");
  const [questionId, setQuestionId] = useState("");
  return (
    <form
      className="mt-4 flex flex-col gap-2 rounded-lg border border-line bg-white p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        await onAdd(content.trim(), questionId.trim());
        setContent("");
        setQuestionId("");
      }}
    >
      <h3 className="text-sm font-semibold text-ink-primary">Add a goal</h3>
      <label className="text-sm text-ink-primary" htmlFor="goal-content">
        Goal
      </label>
      <input id="goal-content" className={field} value={content} maxLength={300} onChange={(e) => setContent(e.target.value)} />
      <label className="text-sm text-ink-primary" htmlFor="goal-question">
        Track a question (optional question id): it completes when you solve it with a verified, judged submission
      </label>
      <input id="goal-question" className={field} value={questionId} placeholder="e.g. fp_002_pair_count" onChange={(e) => setQuestionId(e.target.value)} />
      <div>
        <Button type="submit" size="sm" disabled={!content.trim()}>
          Add goal
        </Button>
      </div>
    </form>
  );
};

const ProfileForm: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [profile, setProfile] = useState<MentorProfile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [skills, setSkills] = useState<{ topic: string; level: SkillLevel }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getMentorProfile()
      .then((r) => {
        if (cancelled) return;
        setProfile(r.profile);
        setSkills(Object.entries(r.profile.skill_self_assessment).map(([topic, level]) => ({ topic, level })));
      })
      .catch((e: unknown) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error !== null && !profile) return <ErrorState error={error} className="mt-6" />;
  if (!profile) return <LoadingState message="Loading your profile…" className="mt-6" />;

  const set = <K extends keyof MentorProfile>(k: K, v: MentorProfile[K]) => {
    setProfile({ ...profile, [k]: v });
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const skill_self_assessment: Record<string, SkillLevel> = {};
      for (const s of skills) if (s.topic.trim()) skill_self_assessment[s.topic.trim()] = s.level;
      const res = await api.putMentorProfile({ ...profile, skill_self_assessment });
      setProfile(res.profile);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} aria-labelledby="profile-heading" className="mt-8 flex flex-col gap-4 rounded-lg border border-line bg-white p-4">
      <h2 id="profile-heading" className="text-lg font-semibold text-ink-primary">
        Your profile
      </h2>
      <p className="text-sm text-ink-secondary">Correct anything here. The mentor treats this as what you told it.</p>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
        Target roles (comma separated)
        <input className={field} value={profile.target_roles.join(", ")} onChange={(e) => set("target_roles", csv(e.target.value))} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
        Target companies (comma separated)
        <input className={field} value={profile.target_companies.join(", ")} onChange={(e) => set("target_companies", csv(e.target.value))} />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-primary">Preferred programming languages</legend>
        <div className="flex flex-wrap gap-4">
          {LANGS.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm text-ink-secondary">
              <input
                type="checkbox"
                checked={profile.preferred_languages.includes(l.id)}
                onChange={(e) => set("preferred_languages", e.target.checked ? [...profile.preferred_languages, l.id] : profile.preferred_languages.filter((x) => x !== l.id))}
              />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
        Daily study time (minutes)
        <input className={field} type="number" min={10} max={720} value={profile.daily_study_minutes ?? ""} onChange={(e) => set("daily_study_minutes", e.target.value === "" ? null : Number(e.target.value))} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
        Placement timeline
        <input className={field} maxLength={100} value={profile.placement_timeline ?? ""} onChange={(e) => set("placement_timeline", e.target.value === "" ? null : e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
        Explanation style
        <select className={field} value={profile.explanation_style ?? ""} onChange={(e) => set("explanation_style", (e.target.value || null) as ExplanationStyle | null)}>
          <option value="">No preference</option>
          <option value="concise">Concise</option>
          <option value="detailed">Detailed</option>
          <option value="step_by_step">Step by step</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-ink-primary">
        Current preparation goals
        <input className={field} maxLength={300} value={profile.current_goals ?? ""} onChange={(e) => set("current_goals", e.target.value === "" ? null : e.target.value)} />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-ink-primary">Skills, in your own opinion (not measured)</legend>
        <ul className="flex flex-col gap-2">
          {skills.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input aria-label={`Skill ${i + 1}`} className={`${field} max-w-xs`} value={s.topic} onChange={(e) => setSkills(skills.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))} />
              <select aria-label={`Level for skill ${i + 1}`} className={`${field} max-w-[10rem]`} value={s.level} onChange={(e) => setSkills(skills.map((x, j) => (j === i ? { ...x, level: e.target.value as SkillLevel } : x)))}>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSkills(skills.filter((_x, j) => j !== i))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setSkills([...skills, { topic: "", level: "beginner" }])}>
          Add a skill
        </Button>
      </fieldset>
      {error !== null && <ErrorState error={error} />}
      <div className="flex items-center gap-3">
        <Button type="submit">Save profile</Button>
        <span role="status" aria-live="polite" className="text-sm text-ink-secondary">
          {saved ? "Profile saved" : ""}
        </span>
      </div>
    </form>
  );
};

const ClearAll: React.FC<{ onClear: (includeConversations: boolean) => Promise<void> }> = ({ onClear }) => {
  const [withConversations, setWithConversations] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <section aria-labelledby="clear-heading" className="mt-8 rounded-lg border border-line bg-white p-4">
      <h2 id="clear-heading" className="text-lg font-semibold text-ink-primary">
        Clear everything
      </h2>
      <p className="mt-1 text-sm text-ink-secondary">Deletes every saved memory: profile, learning notes, summaries and goals. Your submissions, progress, analytics and interview results are not touched.</p>
      <label className="mt-2 flex items-center gap-2 text-sm text-ink-secondary">
        <input type="checkbox" checked={withConversations} onChange={(e) => setWithConversations(e.target.checked)} />
        Also delete my conversation history
      </label>
      <div className="mt-3 flex gap-2">
        {confirm ? (
          <>
            <Button
              variant="secondary"
              onClick={async () => {
                await onClear(withConversations);
                setConfirm(false);
              }}
            >
              Yes, delete it all
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Clear all mentor memory
          </Button>
        )}
      </div>
    </section>
  );
};

export default MentorMemoryPage;
