import type { PlacementDashboard, PlacementIntent, PlacementProposedChange, PlacementTask } from "../types.js";

/**
 * The conversational side of the plan. Intent detection, the factual answer and the proposed changes are all computed
 * here from stored records, deterministically; the AI mentor only gets the facts to explain in its own words and can
 * never change a task. A proposed change does nothing until the student applies it, and is validated again then.
 */

export function classifyIntent(message: string): PlacementIntent {
  const m = message.toLowerCase();
  if (/(lighter|easier|shorter|reduce|less work|too much|overwhelm)/.test(m) && /(plan|today|day|work|load)/.test(m)) return "lighter";
  if (/(what changed|changed since|since (last|the last) week|what.?s new|any changes)/.test(m)) return "changes";
  if (/(can i|will i|am i able).*(finish|complete|make it|get through|in time)|enough time|before (my )?(placement|interview|deadline|date)|on track|feasib/.test(m)) return "feasibility";
  if (/(weakest|worst|least|lowest).*(skill|topic|area)|(explain|tell me about) my weak/.test(m)) return "weakest";
  if (/(revise|revision|review).*(fail|yesterday|topic|question)|help me revise|failed yesterday/.test(m)) return "revise";
  if (/why.*(prioriti[sz]|recommend|suggest|this|first|so high)/.test(m)) return "why";
  if (/(what (should|do) i (study|do|work on|practi[sc]e)|today|what.?s next|plan for)/.test(m)) return "today";
  return "other";
}

const line = (t: PlacementTask) => `- ${t.title} (${t.estimated_minutes} min, priority ${t.priority}${t.blocked ? ", waits for an earlier task" : ""}): ${t.reason}`;

/** The weakest area with enough evidence to say so, or null. Areas without enough verified evidence are never called weak. */
export function weakestVerified(d: PlacementDashboard) {
  return d.skills.skills
    .filter((s) => s.category !== "project" && s.estimate !== null && (s.confidence === "medium" || s.confidence === "high"))
    .sort((a, b) => (a.estimate as number) - (b.estimate as number))[0];
}

/** The application's own answer, built only from the dashboard. Always available, with or without the AI mentor. */
export function answerFor(intent: PlacementIntent, d: PlacementDashboard): string {
  if (d.needs_profile) return "Set your goals and availability first (role, placement date, study days and daily time). Then I can build a plan from your real results.";
  if (!d.plan) return "Your plan has not been generated yet. Generate it from the Placement page and I can explain it.";
  const tasks = d.today_tasks;
  switch (intent) {
    case "today":
    case "other":
      return tasks.length === 0
        ? `Nothing is scheduled for today (${d.today}). ${d.today_capacity_minutes === 0 ? "Today is not one of your study days." : "You can use the time to review, or refresh the plan."}`
        : `Today you have ${tasks.length} task(s), about ${d.today_minutes} of your ${d.today_capacity_minutes} available minutes:\n${tasks.map(line).join("\n")}`;
    case "why": {
      const top = tasks[0] ?? d.outstanding_priorities[0];
      return top ? `Your top task is "${top.title}". Why: ${top.reason} (Source: ${top.evidence_source}.)` : "There is no open task to explain right now.";
    }
    case "changes": {
      const recent = d.history.changes.slice(0, 6);
      return recent.length === 0 ? "No plan changes have been recorded yet." : `Recent changes to your plan:\n${recent.map((c) => `- ${c.at.slice(0, 10)}: ${c.summary}. ${c.reason}`).join("\n")}`;
    }
    case "feasibility": {
      const f = d.plan.feasibility;
      return f ? `${f.message}${d.plan.days_until_placement !== null ? ` There are ${d.plan.days_until_placement} day(s) until your placement date.` : ""} This compares your planned work with your own availability. It is not a prediction of your result.` : "Feasibility has not been calculated yet.";
    }
    case "weakest": {
      const w = weakestVerified(d);
      if (!w) return `I cannot name a weakest skill yet: no skill area has enough verified evidence (${d.skills.coverage.sufficient_evidence} of ${d.skills.coverage.in_scope} areas have medium confidence or better). ${d.readiness.next_diagnostics[0] ? `A good next step: ${d.readiness.next_diagnostics[0].description}` : ""}`.trim();
      return `Your weakest area with enough verified evidence is ${w.label}: estimate ${Math.round((w.estimate as number) * 100)}% from ${w.evidence.count} ${w.evidence.unit}, confidence ${w.confidence}, last evidence ${w.evidence.last_at?.slice(0, 10) ?? "unknown"}. ${w.gaps.length > 0 ? `Gaps: ${w.gaps.join("; ")}.` : ""}`;
    }
    case "lighter":
      return `A lighter plan means moving some of today's ${d.today_minutes} minutes to later days. I prepared a proposal below; nothing changes until you apply it.`;
    case "revise": {
      const rev = [...d.today_tasks, ...d.outstanding_priorities].filter((t) => t.type === "dsa_revision");
      return rev.length === 0 ? `No revision task is scheduled. ${d.history.revision.due} revision item(s) are due in your revision queue.` : `Revision tasks in your plan:\n${rev.map(line).join("\n")}`;
    }
  }
}

/** Changes the application can apply for this request. Nothing is applied here. */
export function proposalsFor(intent: PlacementIntent, message: string, d: PlacementDashboard): PlacementProposedChange[] {
  if (d.needs_profile || !d.plan) return [];
  const out: PlacementProposedChange[] = [];
  const m = message.toLowerCase();
  if (intent === "lighter" && d.today_minutes > 15) {
    const target = Math.max(15, Math.round(d.today_minutes / 2 / 5) * 5);
    out.push({ kind: "lighter_day", date: d.today, max_minutes: target, description: `Keep about ${target} minutes today and move the lowest-priority tasks to later days.` });
  }
  if (/(postpone|push|move|delay).*(today|everything|all)/.test(m) && d.today_tasks.length > 0) {
    out.push({ kind: "postpone_day", date: d.today, days: 1, description: "Move all of today's tasks one day later." });
  }
  const mins = /(?:i (?:can|could|only|have|will)[^.\d]{0,30})(\d{1,3})\s*(minutes|min|m)\b/.exec(m);
  const hrs = /(?:i (?:can|could|only|have|will)[^.\d]{0,30})(\d(?:\.\d)?)\s*(hours|hour|hrs|hr|h)\b/.exec(m);
  const wanted = mins ? Number(mins[1]) : hrs ? Math.round(Number(hrs[1]) * 60) : null;
  if (wanted !== null && wanted >= 15 && wanted <= 480 && d.profile && wanted !== d.profile.daily_minutes) {
    out.push({ kind: "set_daily_minutes", minutes: wanted, description: `Set your daily study time to ${wanted} minutes and move any work that no longer fits.` });
  }
  return out;
}

/** The facts handed to the AI mentor. Application-calculated numbers are authoritative; free text from students is not included here. */
export function planContext(d: PlacementDashboard, intent: PlacementIntent, proposals: PlacementProposedChange[]): string {
  const lines: string[] = [`INTENT DETECTED BY THE APPLICATION: ${intent}`, `TODAY: ${d.today}`];
  if (d.needs_profile || !d.plan) {
    lines.push("The student has not set up goals or generated a plan yet.");
  } else {
    lines.push(`PLAN: generation ${d.plan.generation}${d.plan.days_until_placement !== null ? `, ${d.plan.days_until_placement} days until the placement date` : ", no placement date set"}`);
    if (d.plan.feasibility) lines.push(`FEASIBILITY (calculated by the application): ${d.plan.feasibility.message}`);
    lines.push(`TODAY'S TASKS (${d.today_minutes} of ${d.today_capacity_minutes} minutes):\n${d.today_tasks.slice(0, 8).map(line).join("\n") || "none"}`);
    lines.push(`OPEN HIGH-PRIORITY TASKS: ${d.outstanding_priorities.slice(0, 6).map((t) => `${t.title} (due ${t.due_date})`).join("; ") || "none"}`);
    lines.push(`RECENT PLAN CHANGES:\n${d.history.changes.slice(0, 5).map((c) => `- ${c.at.slice(0, 10)} ${c.summary}: ${c.reason}`).join("\n") || "none"}`);
  }
  const skills = d.skills.skills.filter((s) => s.category !== "project").slice(0, 14).map((s) => `- ${s.label}: status ${s.status}, estimate ${s.estimate === null ? "none" : `${Math.round(s.estimate * 100)}%`}, confidence ${s.confidence}, evidence ${s.evidence.count} ${s.evidence.unit} (${s.evidence.provenance}), recency ${s.evidence.recency}${s.self_reported ? `, self-reported: ${s.self_reported}` : ""}`);
  lines.push(`SKILL ASSESSMENTS (calculated by the application from recorded results):\n${skills.join("\n") || "none"}`);
  lines.push(`EVIDENCE COVERAGE: ${d.skills.coverage.sufficient_evidence} of ${d.skills.coverage.in_scope} areas have medium confidence or better. There is no overall score.`);
  lines.push(`LIMITATIONS:\n${d.limitations.map((l) => `- [${l.severity}] ${l.message}`).join("\n") || "none"}`);
  if (proposals.length > 0) lines.push(`CHANGES THE APPLICATION HAS PREPARED (the student must apply them; you cannot):\n${proposals.map((p) => `- ${p.description}`).join("\n")}`);
  return lines.join("\n\n").slice(0, 6000);
}

