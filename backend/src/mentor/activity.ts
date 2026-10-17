import type { AnalyticsService } from "../analytics/service.js";
import type { Catalogue } from "../dsa/catalogue.js";
import type { DsaProgressService } from "../dsa/progressService.js";
import type { RoleRegistry } from "../services/roles.js";
import type { SessionStore } from "../store/SessionStore.js";
import type { MentorReference } from "../types.js";
import { cleanText } from "./memories.js";

/**
 * The deterministic "what the application knows about this student's practice" block. Every number comes from the
 * backend's own calculations (analytics over counted judged submissions, the revision queue, interview scoring).
 * The model is told to quote it, never to recompute it, and never to invent statistics when it is thin or missing.
 * Demonstration, mock, sample-only, unverified-provider and unknown-provenance records are not in it as achievements.
 */

export interface ActivityDeps {
  analytics: AnalyticsService;
  progress: DsaProgressService;
  catalogue: () => Catalogue;
  sessions: SessionStore;
  roles: RoleRegistry;
}

export interface ActivityContext {
  text: string;
  references: MentorReference[];
  analytics_note: string | null;
}

const pct = (m: { available: boolean; value: number | null; numerator: number; denominator: number }) =>
  m.available && m.value !== null ? `${Math.round(m.value * 100)}% (${m.numerator} of ${m.denominator})` : `not enough data yet (${m.denominator} submissions)`;

export async function buildActivityContext(uid: string, deps: ActivityDeps, opts: { questionId?: string; topics: string[] }): Promise<ActivityContext> {
  const lines: string[] = [];
  const references: MentorReference[] = [];
  let note: string | null = null;
  const title = (id: string) => deps.catalogue().summary(id)?.title ?? null;
  const add = (r: MentorReference) => {
    if (references.length < 6 && !references.some((x) => x.question_id === r.question_id && x.relation === r.relation)) references.push(r);
  };

  let analytics: Awaited<ReturnType<AnalyticsService["overview"]>> | null = null;
  try {
    analytics = await deps.analytics.overview(uid);
  } catch {
    note = "Your practice analytics could not be loaded right now, so no performance numbers are used.";
  }

  if (analytics) {
    const a = analytics;
    if (a.has_eligible_activity) {
      lines.push("VERIFIED PRACTICE (counted judged submissions only; calculated by the application):");
      lines.push(`- solved questions: ${a.totals.solved_unique}; attempted questions: ${a.totals.attempted_unique}; accepted submissions: ${pct(a.submission_success)}`);
      const wanted = a.weaknesses.filter((w) => w.status === "weak" || w.status === "watch" || w.status === "technical_issues");
      const relevant = wanted.filter((w) => opts.topics.some((t) => t.toLowerCase() === w.topic.toLowerCase()));
      for (const w of (relevant.length > 0 ? relevant : wanted).slice(0, 3)) {
        lines.push(`- topic ${w.topic}: ${w.status.replace(/_/g, " ")}. ${w.explanation.slice(0, 2).join(" ")}`);
      }
      for (const r of a.repeated_failures.slice(0, 3)) {
        lines.push(`- repeatedly failing: "${title(r.question_id) ?? r.question_id}" (${r.consecutive_failures} failures in a row)`);
        add({ question_id: r.question_id, title: title(r.question_id), relation: "verified_attempt", label: `Verified: ${r.consecutive_failures} failed judged submissions in a row` });
      }
      const queue = await deps.analytics.queue(uid, "due", 1, 5).catch(() => null);
      for (const i of queue?.items ?? []) {
        lines.push(`- revision due: "${i.title ?? i.question_id}" (${i.explanation})`);
        add({ question_id: i.question_id, title: i.title, relation: "revision_due", label: "In your revision queue and due now" });
      }
      if (a.comparison.available) lines.push(`- last 28 days: ${a.comparison.current.accepted} of ${a.comparison.current.attempts} accepted; the 28 days before: ${a.comparison.previous.accepted} of ${a.comparison.previous.attempts}`);
    } else {
      const ex = a.exclusions;
      const parts: string[] = [];
      if (ex.demonstration > 0) parts.push(`${ex.demonstration} on demonstration exercises`);
      if (ex.mock_execution > 0) parts.push(`${ex.mock_execution} judged by a mock execution service`);
      if (ex.unverified_provider > 0) parts.push(`${ex.unverified_provider} judged by a service not confirmed as a real deployment`);
      if (ex.ineligible_suite > 0) parts.push(`${ex.ineligible_suite} on exercises not eligible for analytics`);
      if (ex.unknown_provenance > 0) parts.push(`${ex.unknown_provenance} without provenance`);
      note = `No verified judged practice is recorded yet${parts.length > 0 ? ` (${parts.join(", ")} are not counted)` : ""}. Performance statistics are not available, so the mentor will not quote any.`;
      lines.push("VERIFIED PRACTICE: none recorded. " + note);
    }

    const selfReported = a.self_reported;
    if (selfReported.solved + selfReported.attempted + selfReported.needs_revision > 0) {
      lines.push(`NOT VERIFIED, marked by the student themselves (not judged): ${selfReported.solved} solved, ${selfReported.attempted} attempted, ${selfReported.needs_revision} need revision.`);
    }
  }

  if (opts.questionId) {
    const t = title(opts.questionId);
    const verifiedSolved = analytics?.recent.some((r) => r.question_id === opts.questionId && r.verdict === "accepted");
    const progress = (await deps.progress.list(uid).catch(() => ({ progress: [] }))).progress.find((p) => p.question_id === opts.questionId);
    if (verifiedSolved) add({ question_id: opts.questionId, title: t, relation: "verified_solved", label: "Verified: an accepted judged submission is on record" });
    else if (progress && progress.status !== "not_started") add({ question_id: opts.questionId, title: t, relation: "self_reported", label: `Marked "${progress.status.replace(/_/g, " ")}" by you (not judged, so not verified)` });
    lines.push(`QUESTION IN FOCUS: "${t ?? opts.questionId}". Its statement lives in the app; the mentor must not claim to know hidden test cases.`);
  }

  const sessions = await deps.sessions.listByOwner(uid).catch(() => []);
  const latest = [...sessions].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 3);
  if (latest.length > 0) {
    lines.push("INTERVIEW PRACTICE (deterministic scoring by the application, latest sessions):");
    for (const s of latest) {
      const counts = new Map<string, number>();
      for (const c of s.claims) if (c.verdict !== "pending") counts.set(c.verdict, (counts.get(c.verdict) ?? 0) + 1);
      const role = deps.roles.get(s.role_id)?.name ?? s.role_id;
      lines.push(`- ${cleanText(role, 60)} (${s.mode}): ${[...counts.entries()].map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ") || "no claims finished yet"}`);
    }
  }

  return { text: lines.join("\n").slice(0, 2800), references, analytics_note: note };
}
