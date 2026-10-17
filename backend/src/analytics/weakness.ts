import type { TopicWeakness, WeaknessStatus, WeaknessTrend } from "../types.js";
import type { WeaknessConfig } from "./config.js";
import { algorithmicFailures, technicalFailures, type StatsRecord } from "./stats.js";

/**
 * Deterministic topic weakness rules. No model, no hidden score: each status follows from counts that are
 * returned alongside it. A topic is only judged once it has enough questions AND attempts; before that it is
 * "insufficient_data". One failed question never makes a topic weak.
 *
 * Failures are split: wrong answer / time limit = algorithmic (a possible knowledge gap); compile / runtime
 * errors = technical (often syntax, input handling or environment). Technical problems are reported as
 * their own status instead of being blamed on topic understanding.
 */

const DAY_MS = 86_400_000;
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;

function trendOf(records: StatsRecord[], now: Date, cfg: WeaknessConfig): WeaknessTrend {
  const span = cfg.trendWindowDays * DAY_MS;
  const t = now.getTime();
  const win = (lo: number, hi: number) => {
    let attempts = 0;
    let accepted = 0;
    for (const r of records) {
      for (const e of r.events) {
        const at = Date.parse(e.at);
        if (at >= lo && at < hi) {
          attempts += 1;
          if (e.verdict === "accepted") accepted += 1;
        }
      }
    }
    return { attempts, accepted };
  };
  const recent = win(t - span, t + 1);
  const before = win(t - 2 * span, t - span);
  if (recent.attempts < cfg.trendMinAttempts || before.attempts < cfg.trendMinAttempts) return "insufficient_data";
  const delta = recent.accepted / recent.attempts - before.accepted / before.attempts;
  return delta >= cfg.trendDelta ? "improving" : delta <= -cfg.trendDelta ? "declining" : "stable";
}

export function detectWeaknesses(records: StatsRecord[], now: Date, cfg: WeaknessConfig): TopicWeakness[] {
  const byTopic = new Map<string, StatsRecord[]>();
  for (const r of records) {
    if (r.attempts === 0) continue;
    for (const topic of new Set(r.topics)) byTopic.set(topic, [...(byTopic.get(topic) ?? []), r]);
  }

  const out: TopicWeakness[] = [];
  for (const [topic, recs] of byTopic) {
    const questionsAttempted = recs.length;
    const questionsSolved = recs.filter((r) => r.accepted > 0).length;
    const attempts = recs.reduce((s, r) => s + r.attempts, 0);
    const accepted = recs.reduce((s, r) => s + r.accepted, 0);
    const alg = recs.reduce((s, r) => s + algorithmicFailures(r), 0);
    const tech = recs.reduce((s, r) => s + technicalFailures(r), 0);
    const repeated = recs.filter((r) => r.consecutive_failures >= cfg.repeatedFailureThreshold).length;
    const regressions = recs.filter((r) => r.failures_after_solved >= cfg.regressionFailures).length;
    const solveRate = questionsSolved / questionsAttempted;
    const accuracy = accepted / attempts;
    const trend = trendOf(recs, now, cfg);

    const explanation: string[] = [];
    let status: WeaknessStatus;

    if (questionsAttempted < cfg.minQuestions || attempts < cfg.minAttempts) {
      status = "insufficient_data";
      explanation.push(
        `Not enough activity to judge: ${questionsAttempted} question${questionsAttempted === 1 ? "" : "s"} and ${attempts} submission${attempts === 1 ? "" : "s"} so far (needs at least ${cfg.minQuestions} questions and ${cfg.minAttempts} submissions).`,
      );
    } else if ((alg >= cfg.minAlgorithmicFailures && solveRate <= cfg.weakSolveRate) || regressions >= cfg.regressionQuestions) {
      status = "weak";
      if (alg >= cfg.minAlgorithmicFailures && solveRate <= cfg.weakSolveRate) {
        explanation.push(`${questionsAttempted - questionsSolved} of ${questionsAttempted} attempted questions are still unsolved (solve rate ${pct(questionsSolved, questionsAttempted)}).`);
        explanation.push(`${alg} wrong-answer or time-limit failures across ${attempts} submissions point at the approach rather than syntax.`);
      }
      if (regressions >= cfg.regressionQuestions) {
        explanation.push(`${regressions} questions you had solved failed again afterwards (${cfg.regressionFailures}+ failures each), which suggests the idea is not sticking.`);
      }
      if (repeated > 0) explanation.push(`${repeated} question${repeated === 1 ? " has" : "s have"} failed ${cfg.repeatedFailureThreshold}+ times in a row.`);
    } else if (tech >= cfg.technicalMinFailures && tech >= alg) {
      status = "technical_issues";
      explanation.push(`${tech} compilation or runtime errors against ${alg} wrong-answer or time-limit failures: mostly technical problems (syntax, input parsing, crashes), not evidence of a topic gap.`);
    } else if (alg >= cfg.watchAlgorithmicFailures && solveRate < cfg.watchSolveRate) {
      status = "watch";
      explanation.push(`${alg} wrong-answer or time-limit failures and a solve rate of ${pct(questionsSolved, questionsAttempted)} (${questionsSolved} of ${questionsAttempted} questions). Not enough to call it a weakness yet.`);
    } else if (solveRate >= cfg.strongSolveRate && accuracy >= cfg.strongAccuracy) {
      status = "strong";
      explanation.push(`${questionsSolved} of ${questionsAttempted} attempted questions solved (${pct(questionsSolved, questionsAttempted)}) and ${pct(accepted, attempts)} of submissions accepted.`);
    } else {
      status = "watch";
      explanation.push(`Mixed results: ${questionsSolved} of ${questionsAttempted} questions solved and ${pct(accepted, attempts)} of submissions accepted.`);
    }

    if (status !== "insufficient_data") {
      if (trend === "improving") explanation.push("Recent submissions are accepted noticeably more often than in the period before.");
      if (trend === "declining") explanation.push("Recent submissions are accepted noticeably less often than in the period before.");
      if (tech > 0 && status !== "technical_issues") explanation.push(`${tech} of the failures were compilation or runtime errors; they are not counted as topic gaps.`);
    }

    out.push({
      topic,
      status,
      trend,
      explanation,
      evidence: {
        questions_attempted: questionsAttempted,
        questions_solved: questionsSolved,
        attempts,
        accepted,
        algorithmic_failures: alg,
        technical_failures: tech,
        repeated_failure_questions: repeated,
        revision_regressions: regressions,
      },
    });
  }

  const rank: Record<WeaknessStatus, number> = { weak: 0, technical_issues: 1, watch: 2, insufficient_data: 3, strong: 4 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.evidence.attempts - a.evidence.attempts || a.topic.localeCompare(b.topic));
}
