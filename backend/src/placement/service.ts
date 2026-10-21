import { ApiError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { RoleRegistry } from "../services/roles.js";
import type {
  MentorSavedMemory,
  PlacementApplyChangeRequest,
  PlacementApplyChangeResponse,
  PlacementAssistantResponse,
  PlacementChange,
  PlacementDashboard,
  PlacementDay,
  PlacementFeasibility,
  PlacementImprovement,
  PlacementProfile,
  PlacementProfileResponse,
  PlacementTask,
  PlacementTaskActionRequest,
  PlacementProposedChange,
} from "../types.js";
import { addDays, diffDays, weekdayName, weekStart, ymd } from "./dates.js";
import { EvidenceService, type EvidenceBundle } from "./evidence.js";
import { assessSkills } from "./skills.js";
import { answerFor, classifyIntent, planContext, proposalsFor } from "./assistant.js";
import { assessFeasibility, buildCandidates, capacityOn, findSlot, lastPlanDay, PLAN_RULES, taskIdFor, usedByDate, type Candidate } from "./planner.js";
import { normalizeProfile } from "./profile.js";
import type { PlacementStore, PlanRecord, ProfileRecord, TaskRecord } from "./store.js";

export interface PlanMentorPort {
  tutorHelp(uid: string, input: { context: string; message: string; topics: string[] }): Promise<{ reply: string; mock: boolean; memory_saved: MentorSavedMemory[] }>;
}

export interface PlacementDeps {
  store: PlacementStore;
  evidence: EvidenceService;
  roles: RoleRegistry;
  topics: () => string[];
  /** Optional: the plan is fully usable without the AI mentor. */
  mentor?: PlanMentorPort;
  logger: Logger;
  now?: () => Date;
  /** Reads the mentor's saved language/minutes to suggest (never apply) defaults. */
  suggestions?: (uid: string) => Promise<{ preferred_language: PlacementProfile["preferred_language"]; daily_minutes: number | null } | null>;
}

const MAX_TASKS = 400;
const MAX_CHANGES = 60;
const MAX_HISTORY = 20;
const KEEP_CLOSED = 120;
const ACTIVE = new Set(["planned", "in_progress"]);

export class PlacementService {
  private readonly now: () => Date;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: PlacementDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private today(): string {
    return ymd(this.now());
  }

  private async serialize<T>(uid: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(uid) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.locks.set(uid, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(uid) === run) this.locks.delete(uid);
    }
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      this.deps.logger.error({ err: (err as Error).message }, "placement: storage failure");
      throw new ApiError("INTERNAL", "Your placement plan could not be loaded or saved right now. Try again.");
    }
  }

  // ---------------- profile ----------------

  async getProfile(uid: string): Promise<PlacementProfileResponse> {
    return this.guard(async () => {
      const rec = await this.deps.store.getProfile(uid);
      const suggestions = rec ? null : await this.deps.suggestions?.(uid).catch(() => null) ?? null;
      return { profile: rec?.profile ?? null, updated_at: rec?.updated_at ?? null, suggestions, roles: this.deps.roles.list(), topics: this.deps.topics() };
    });
  }

  async putProfile(uid: string, raw: unknown): Promise<PlacementProfileResponse> {
    const profile = normalizeProfile(raw, { roles: this.deps.roles, today: this.today() });
    return this.serialize(uid, () =>
      this.guard(async () => {
        const at = this.now().toISOString();
        const prev = await this.deps.store.getProfile(uid);
        await this.deps.store.saveProfile({ owner_uid: uid, profile, created_at: prev?.created_at ?? at, updated_at: at });
        const plan = await this.deps.store.getPlan(uid);
        if (plan && plan.generation > 0 && prev) {
          // Changed goals or availability: keep every task, move work that no longer fits, record why.
          const tasks = await this.deps.store.listTasks(uid, MAX_TASKS);
          const changes: PlacementChange[] = [{ at, kind: "profile_changed", summary: describeProfileChange(prev.profile, profile), reason: "You updated your goals or availability.", task_id: null }];
          const moved = rebalance(tasks, profile, this.today(), at, changes, "Your availability changed, so it no longer fit on its day.");
          if (moved.length > 0) await this.deps.store.saveTasks(moved);
          await this.deps.store.savePlan({ ...plan, changes: [...changes, ...plan.changes].slice(0, MAX_CHANGES), updated_at: at });
        }
        return this.getProfile(uid);
      }),
    );
  }

  // ---------------- dashboard ----------------

  async dashboard(uid: string): Promise<PlacementDashboard> {
    return this.guard(() => this.buildDashboard(uid));
  }

  /** Applies verified events, moves missed work, tops the plan up (creating it the first time), then returns the dashboard. */
  async refresh(uid: string): Promise<PlacementDashboard> {
    return this.serialize(uid, () =>
      this.guard(async () => {
        await this.reconcile(uid, { regenerate: false, mode: "default" });
        return this.buildDashboard(uid);
      }),
    );
  }

  async generate(uid: string, mode: "default" | "reduced"): Promise<PlacementDashboard> {
    return this.serialize(uid, () =>
      this.guard(async () => {
        const ran = await this.reconcile(uid, { regenerate: true, mode });
        if (!ran) throw new ApiError("PLACEMENT_PROFILE_REQUIRED", "Set your goals and availability first, then generate your plan.");
        return this.buildDashboard(uid);
      }),
    );
  }

  async deleteAll(uid: string): Promise<void> {
    await this.serialize(uid, () => this.guard(() => this.deps.store.deleteAll(uid)));
  }

  // ---------------- reconcile: the one place plan state changes automatically ----------------

  private async reconcile(uid: string, opts: { regenerate: boolean; mode: "default" | "reduced" }): Promise<boolean> {
    const { store } = this.deps;
    const profileRec = await store.getProfile(uid);
    if (!profileRec) return false;
    const profile = profileRec.profile;
    const now = this.now();
    const at = now.toISOString();
    const today = ymd(now);
    const plan: PlanRecord = (await store.getPlan(uid)) ?? { owner_uid: uid, generation: 0, generated_at: null, feasibility: null, changes: [], last_refresh_at: null, updated_at: at };
    const tasks = await store.listTasks(uid, MAX_TASKS);
    const ev = await this.deps.evidence.collect(uid);
    const skills = assessSkills(ev, profile, this.deps.roles, now);
    const changes: PlacementChange[] = [];
    const dirty = new Map<string, TaskRecord>();
    const touch = (t: TaskRecord) => void dirty.set(t.id, t);
    const log = (t: TaskRecord, event: string, detail: string | null) => {
      t.history = [...t.history, { at, event, detail }].slice(-MAX_HISTORY);
      t.updated_at = at;
      touch(t);
    };
    const first = plan.generation === 0;

    // 1. completions that the real records prove (each is idempotent: a completed task is never completed again)
    for (const t of tasks) {
      if (!ACTIVE.has(t.status) || t.completion_check !== "verified_event") continue;
      const proof = completionProof(t, ev);
      if (!proof) continue;
      t.status = "completed";
      t.completed_at = at;
      t.completed_by = "verified_event";
      log(t, "completed", proof);
      changes.push({ at, kind: "task_completed", summary: `Completed: ${t.title}`, reason: proof, task_id: t.id });
    }

    // 2. planned work that can no longer be done or no longer applies (only tasks not started)
    for (const t of tasks) {
      if (t.status !== "planned") continue;
      const why = obsoleteReason(t, ev, today);
      if (!why) continue;
      t.status = "superseded";
      log(t, "superseded", why);
      changes.push({ at, kind: "task_superseded", summary: `Removed from the plan: ${t.title}`, reason: why, task_id: t.id });
    }

    // 3. revision tasks follow the revision queue's own priority
    for (const t of tasks) {
      if (!ACTIVE.has(t.status) || t.type !== "dsa_revision") continue;
      const item = ev.dsa.revision.find((r) => r.question_id === t.ref.id);
      if (!item) continue;
      const p = (item.priority <= 1 ? 1 : item.priority <= 3 ? 2 : 3) as PlacementTask["priority"];
      if (p !== t.priority) {
        changes.push({ at, kind: "task_reprioritized", summary: `${t.title}: priority ${t.priority} to ${p}`, reason: "The revision queue's own priority for this question changed after new results.", task_id: t.id });
        t.priority = p;
        log(t, "reprioritized", `priority ${p}`);
      }
    }

    // 4. what the rules recommend now
    let mode = opts.mode;
    let cands = buildCandidates({ uid, today, profile, evidence: ev, skills, roles: this.deps.roles, existing: tasks, mode });
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const incompleteMust = () => tasks.filter((t) => ACTIVE.has(t.status) && t.priority <= PLAN_RULES.mustDoPriority).reduce((n, t) => n + t.estimated_minutes, 0);
    const newMust = (cs: Candidate[]) => cs.filter((c) => c.priority <= PLAN_RULES.mustDoPriority && !byId.has(taskIdFor(uid, c.key))).reduce((n, c) => n + c.minutes, 0);
    let feas = assessFeasibility(profile, today, incompleteMust() + newMust(cands), [], mode === "reduced");
    if (feas.status === "insufficient" && mode === "default") {
      mode = "reduced";
      cands = buildCandidates({ uid, today, profile, evidence: ev, skills, roles: this.deps.roles, existing: tasks, mode });
      feas = assessFeasibility(profile, today, incompleteMust() + newMust(cands), [], true);
    }
    const candIds = new Set(cands.map((c) => taskIdFor(uid, c.key)));

    // 5. regenerating replaces recommendations for the future only: finished, skipped, removed, started and
    //    student-scheduled tasks all stay
    if (opts.regenerate) {
      for (const t of tasks) {
        if (t.status === "planned" && !t.student_scheduled && !candIds.has(t.id)) {
          t.status = "superseded";
          log(t, "superseded", mode === "reduced" ? "A reduced plan keeps only the highest-priority work." : "The planning rules no longer recommend it.");
          changes.push({ at, kind: "task_superseded", summary: `Replaced: ${t.title}`, reason: mode === "reduced" ? "A reduced plan keeps only the highest-priority work." : "The planning rules no longer recommend it after your latest results.", task_id: t.id });
        }
      }
    }

    // 6. missed days: move unfinished work forward without treating it as a failure
    const last = lastPlanDay(profile, today);
    const used = usedByDate(tasks.filter((t) => t.due_date >= today && ACTIVE.has(t.status)));
    const overdue = tasks.filter((t) => ACTIVE.has(t.status) && t.due_date < today).sort((a, b) => a.priority - b.priority || a.original_due_date.localeCompare(b.original_due_date));
    for (const t of overdue) {
      const slot = findSlot(profile, used, t.estimated_minutes, today, addDays(today, PLAN_RULES.horizonDays + 14));
      if (!slot) continue;
      used.set(slot, (used.get(slot) ?? 0) + t.estimated_minutes);
      const from = t.due_date;
      t.due_date = slot;
      log(t, "rescheduled", `Moved from ${from} to ${slot} after a missed day`);
      changes.push({ at, kind: "task_rescheduled", summary: `"${t.title}" moved from ${from} to ${slot}`, reason: "It was not done on its day, so it was moved forward. This is not counted as a failure.", task_id: t.id });
    }

    // 7. bring back superseded tasks the rules want again, and add new ones that fit
    const deferred: string[] = [];
    let active = tasks.filter((t) => ACTIVE.has(t.status)).length;
    const createdIds = new Map<string, TaskRecord>();
    for (const c of cands) {
      const id = taskIdFor(uid, c.key);
      const existing = byId.get(id);
      if (existing && existing.status !== "superseded") continue; // already planned, done, skipped or removed: never duplicated
      if (active >= PLAN_RULES.maxActiveTasks) {
        deferred.push(id);
        continue;
      }
      const depDue = c.depends_on_keys.map((k) => (byId.get(taskIdFor(uid, k)) ?? createdIds.get(taskIdFor(uid, k)))?.due_date).filter((d): d is string => d !== undefined);
      const from = depDue.reduce((m, d) => (d > m ? d : m), today);
      const slot = findSlot(profile, used, c.minutes, from, last);
      if (!slot) {
        deferred.push(id);
        continue;
      }
      used.set(slot, (used.get(slot) ?? 0) + c.minutes);
      const rec: TaskRecord = existing
        ? { ...existing, ...taskFrom(uid, c, slot, at, id), created_at: at, history: [...existing.history, { at, event: "reactivated", detail: "Recommended again" }].slice(-MAX_HISTORY) }
        : { ...taskFrom(uid, c, slot, at, id), history: [{ at, event: "created", detail: c.reason }] };
      createdIds.set(id, rec);
      touch(rec);
      active += 1;
      changes.push({ at, kind: "task_added", summary: `Added: ${c.title} (${slot})`, reason: c.reason, task_id: id });
    }
    feas = { ...feas, deferred_task_ids: deferred, reduced: mode === "reduced" };
    if (feas.status === "insufficient" && deferred.length === 0) feas = { ...feas, reduced: true };

    // 8. persist (closed tasks beyond the newest KEEP_CLOSED are dropped, so reads stay bounded)
    const all = [...tasks.filter((t) => !createdIds.has(t.id)), ...createdIds.values()];
    const closed = all.filter((t) => !ACTIVE.has(t.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const drop = closed.slice(KEEP_CLOSED).filter((t) => t.status !== "removed" && t.status !== "skipped").map((t) => t.id);
    if (dirty.size > 0) await store.saveTasks([...dirty.values()]);
    if (drop.length > 0) await store.deleteTasks(drop);
    const generated = opts.regenerate || first;
    const log2: PlacementChange[] = generated ? [{ at, kind: "plan_generated", summary: first ? "Your plan was created" : mode === "reduced" ? "Your plan was regenerated as a reduced plan" : "Your future recommendations were regenerated", reason: "Based on your goals, availability and the results recorded so far. Completed tasks were kept.", task_id: null }] : [];
    await store.savePlan({
      ...plan,
      generation: generated ? plan.generation + 1 : plan.generation,
      generated_at: generated ? at : plan.generated_at,
      feasibility: feas,
      changes: [...log2, ...changes.slice().reverse(), ...plan.changes].slice(0, MAX_CHANGES),
      last_refresh_at: at,
      updated_at: at,
    });
    return true;
  }

  // ---------------- task actions ----------------

  async taskAction(uid: string, taskId: string, req: PlacementTaskActionRequest): Promise<PlacementTask> {
    return this.serialize(uid, () =>
      this.guard(async () => {
        const { store } = this.deps;
        const rec = await store.getTask(taskId);
        if (!rec || rec.owner_uid !== uid) throw new ApiError("PLACEMENT_TASK_NOT_FOUND", `Task ${taskId} not found`);
        const profileRec = await store.getProfile(uid);
        const at = this.now().toISOString();
        const today = ymd(this.now());
        const tasks = await store.listTasks(uid, MAX_TASKS);
        const t = tasks.find((x) => x.id === taskId) ?? rec;
        const active = ACTIVE.has(t.status);
        const note = (event: string, detail: string | null) => {
          t.history = [...t.history, { at, event, detail }].slice(-MAX_HISTORY);
          t.updated_at = at;
        };
        const change = (kind: PlacementChange["kind"], summary: string, reason: string): PlacementChange => ({ at, kind, summary, reason, task_id: t.id });
        const blockedBy = () => {
          const byId = new Map(tasks.map((x) => [x.id, x]));
          return t.depends_on.map((id) => byId.get(id)).find((d) => d && ACTIVE.has(d.status));
        };
        let logged: PlacementChange | null = null;

        switch (req.action) {
          case "start": {
            if (t.status !== "planned") throw new ApiError("BAD_REQUEST", "Only a planned task can be started.");
            const b = blockedBy();
            if (b) throw new ApiError("BAD_REQUEST", `Finish "${b.title}" first: this task follows it.`);
            t.status = "in_progress";
            note("started", null);
            break;
          }
          case "complete": {
            if (!active) throw new ApiError("BAD_REQUEST", "Only a planned or started task can be completed.");
            const b = blockedBy();
            if (b) throw new ApiError("BAD_REQUEST", `Finish "${b.title}" first: this task follows it.`);
            t.status = "completed";
            t.completed_at = at;
            t.completed_by = "student";
            note("completed", t.completion_check === "verified_event" ? "Marked done by you; this is not counted as verified evidence." : "Marked done by you");
            logged = change("task_completed", `Completed: ${t.title}`, t.completion_check === "verified_event" ? "You marked it done. It will not count as verified evidence unless the real record appears." : "You marked it done.");
            break;
          }
          case "postpone": {
            if (!active) throw new ApiError("BAD_REQUEST", "Only a planned or started task can be postponed.");
            const days = req.days ?? 1;
            const base = t.due_date < today ? today : t.due_date;
            const target = this.nextAvailable(profileRec?.profile ?? null, addDays(base, days));
            const from = t.due_date;
            t.due_date = target;
            t.postponed_count += 1;
            t.student_scheduled = true;
            if (t.status === "in_progress") t.status = "planned";
            note("postponed", `From ${from} to ${target}`);
            logged = change("task_rescheduled", `"${t.title}" postponed to ${target}`, "You postponed it.");
            break;
          }
          case "reschedule": {
            if (!active) throw new ApiError("BAD_REQUEST", "Only a planned or started task can be moved.");
            const date = req.date as string;
            if (date < today || date > addDays(today, PLAN_RULES.maxLookaheadDays)) throw new ApiError("BAD_REQUEST", "Choose a date from today to 90 days ahead.");
            const from = t.due_date;
            t.due_date = date;
            t.student_scheduled = true;
            note("rescheduled", `From ${from} to ${date}`);
            logged = change("task_rescheduled", `"${t.title}" moved to ${date}`, "You chose a new date.");
            break;
          }
          case "skip": {
            if (!active) throw new ApiError("BAD_REQUEST", "Only a planned or started task can be skipped.");
            t.status = "skipped";
            t.skip_reason = req.reason as string;
            note("skipped", req.reason as string);
            logged = change("plan_adjusted", `Skipped: ${t.title}`, `You skipped it: ${req.reason as string}`);
            break;
          }
          case "remove": {
            if (!active && t.status !== "superseded") throw new ApiError("BAD_REQUEST", "This task is already closed.");
            t.status = "removed";
            note("removed", null);
            logged = change("plan_adjusted", `Removed: ${t.title}`, "You removed it from your plan; it will not be suggested again.");
            break;
          }
          case "reopen": {
            if (active) throw new ApiError("BAD_REQUEST", "This task is already open.");
            t.status = "planned";
            t.completed_at = null;
            t.completed_by = null;
            t.skip_reason = null;
            t.due_date = this.nextAvailable(profileRec?.profile ?? null, today);
            t.student_scheduled = true;
            note("reopened", null);
            logged = change("plan_adjusted", `Reopened: ${t.title}`, "You reopened it.");
            break;
          }
        }
        await store.saveTasks([t]);
        if (logged) {
          const plan = (await store.getPlan(uid)) ?? { owner_uid: uid, generation: 0, generated_at: null, feasibility: null, changes: [], last_refresh_at: null, updated_at: at };
          await store.savePlan({ ...plan, changes: [logged, ...plan.changes].slice(0, MAX_CHANGES), updated_at: at });
        }
        const byId = new Map(tasks.map((x) => [x.id, x]));
        return present(t, byId);
      }),
    );
  }

  private nextAvailable(profile: PlacementProfile | null, from: string): string {
    if (!profile) return from;
    for (let d = from, i = 0; i < 14; d = addDays(d, 1), i++) if (capacityOn(profile, d) > 0) return d;
    return from;
  }

  // ---------------- assistant ----------------

  async assistant(uid: string, message: string): Promise<PlacementAssistantResponse> {
    const intent = classifyIntent(message);
    const dash = await this.dashboard(uid);
    const proposed = proposalsFor(intent, message, dash);
    const answer = answerFor(intent, dash);
    let mentor_reply: string | null = null;
    let memory: MentorSavedMemory[] = [];
    const meta = { available: false, mock: false, error: null as string | null };
    if (this.deps.mentor) {
      try {
        const out = await this.deps.mentor.tutorHelp(uid, { context: planContext(dash, intent, proposed), message, topics: dash.skills.skills.filter((s) => s.category === "dsa" && (s.status === "weak" || s.status === "unassessed")).map((s) => s.area.slice(4)).slice(0, 5) });
        mentor_reply = out.reply;
        memory = out.memory_saved;
        meta.available = true;
        meta.mock = out.mock;
      } catch (err) {
        meta.error = err instanceof ApiError ? err.message : "The AI mentor could not answer right now.";
      }
    } else meta.error = "The AI mentor is not available.";
    return { intent, answer, mentor_reply, mentor: meta, proposed_changes: proposed, memory_saved: memory };
  }

  /** Applies a change the student accepted. The change is validated here again: nothing arrives pre-approved. */
  async applyChange(uid: string, req: PlacementApplyChangeRequest["change"]): Promise<PlacementApplyChangeResponse> {
    return this.serialize(uid, () =>
      this.guard(async () => {
        const { store } = this.deps;
        const profileRec = await store.getProfile(uid);
        if (!profileRec) throw new ApiError("PLACEMENT_PROFILE_REQUIRED", "Set your goals and availability first.");
        const at = this.now().toISOString();
        const today = ymd(this.now());
        const plan = (await store.getPlan(uid)) ?? { owner_uid: uid, generation: 0, generated_at: null, feasibility: null, changes: [], last_refresh_at: null, updated_at: at };
        const tasks = await store.listTasks(uid, MAX_TASKS);
        const changes: PlacementChange[] = [];
        let summary: string;
        let moved: TaskRecord[] = [];
        let profile = profileRec.profile;
        if (req.kind === "set_daily_minutes") {
          if (!Number.isInteger(req.minutes) || req.minutes < 15 || req.minutes > 480) throw new ApiError("BAD_REQUEST", "Daily minutes must be between 15 and 480.");
          profile = { ...profile, daily_minutes: req.minutes };
          await store.saveProfile({ ...profileRec, profile, updated_at: at });
          changes.push({ at, kind: "profile_changed", summary: `Daily study time set to ${req.minutes} minutes`, reason: "You accepted a suggested change.", task_id: null });
          moved = rebalance(tasks, profile, today, at, changes, "Your daily time changed, so it no longer fit on its day.");
          summary = `Daily study time is now ${req.minutes} minutes; ${moved.length} task(s) were moved to fit.`;
        } else {
          if (req.date < today || req.date > addDays(today, 60)) throw new ApiError("BAD_REQUEST", "Choose a date from today to 60 days ahead.");
          const dayTasks = tasks.filter((t) => ACTIVE.has(t.status) && t.due_date === req.date);
          const used = usedByDate(tasks.filter((t) => ACTIVE.has(t.status) && t.due_date !== req.date));
          if (req.kind === "lighter_day") {
            if (!Number.isInteger(req.max_minutes) || req.max_minutes < 0 || req.max_minutes > 480) throw new ApiError("BAD_REQUEST", "Choose between 0 and 480 minutes.");
            let total = dayTasks.reduce((n, t) => n + t.estimated_minutes, 0);
            for (const t of dayTasks.slice().sort((a, b) => b.priority - a.priority || b.estimated_minutes - a.estimated_minutes)) {
              if (total <= req.max_minutes) break;
              const slot = findSlot(profile, used, t.estimated_minutes, addDays(req.date, 1), addDays(req.date, 28));
              if (!slot) continue;
              used.set(slot, (used.get(slot) ?? 0) + t.estimated_minutes);
              total -= t.estimated_minutes;
              this.move(t, slot, at, changes, "You asked for a lighter day.");
              moved.push(t);
            }
            summary = `${req.date} now holds ${total} minutes; ${moved.length} task(s) moved to later days.`;
          } else {
            if (!Number.isInteger(req.days) || req.days < 1 || req.days > 14) throw new ApiError("BAD_REQUEST", "Postpone by 1 to 14 days.");
            for (const t of dayTasks.slice().sort((a, b) => a.priority - b.priority)) {
              const slot = findSlot(profile, used, t.estimated_minutes, addDays(req.date, req.days), addDays(req.date, req.days + 28));
              if (!slot) continue;
              used.set(slot, (used.get(slot) ?? 0) + t.estimated_minutes);
              this.move(t, slot, at, changes, `You postponed ${req.date} by ${req.days} day(s).`);
              moved.push(t);
            }
            summary = `${moved.length} task(s) from ${req.date} were postponed by ${req.days} day(s).`;
          }
        }
        if (moved.length > 0) await store.saveTasks(moved);
        await store.savePlan({ ...plan, changes: [...changes.slice().reverse(), ...plan.changes].slice(0, MAX_CHANGES), updated_at: at });
        return { summary, dashboard: await this.buildDashboard(uid) };
      }),
    );
  }

  private move(t: TaskRecord, slot: string, at: string, changes: PlacementChange[], reason: string): void {
    const from = t.due_date;
    t.due_date = slot;
    t.student_scheduled = true;
    t.history = [...t.history, { at, event: "rescheduled", detail: `From ${from} to ${slot}` }].slice(-MAX_HISTORY);
    t.updated_at = at;
    changes.push({ at, kind: "task_rescheduled", summary: `"${t.title}" moved from ${from} to ${slot}`, reason, task_id: t.id });
  }

  // ---------------- read model ----------------

  private async buildDashboard(uid: string): Promise<PlacementDashboard> {
    const { store } = this.deps;
    const now = this.now();
    const today = ymd(now);
    const [profileRec, plan, tasks, ev] = await Promise.all([store.getProfile(uid), store.getPlan(uid), store.listTasks(uid, MAX_TASKS), this.deps.evidence.collect(uid)]);
    const profile = profileRec?.profile ?? null;
    const skills = assessSkills(ev, profile, this.deps.roles, now);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const live = tasks.filter((t) => ACTIVE.has(t.status)).map((t) => present(t, byId));
    // Tasks that wait for another one come after it; otherwise by priority, then date.
    const order = (a: PlacementTask, b: PlacementTask) => Number(a.blocked) - Number(b.blocked) || a.priority - b.priority || a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id);
    const todayTasks = live.filter((t) => t.due_date <= today).sort(order);
    const days: PlacementDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const onDay = tasks.filter((t) => t.due_date === date && (ACTIVE.has(t.status) || t.status === "completed")).map((t) => present(t, byId)).sort(order);
      days.push({
        date,
        weekday: weekdayName(date),
        available: profile ? capacityOn(profile, date) > 0 : false,
        capacity_minutes: profile ? capacityOn(profile, date) : 0,
        planned_minutes: onDay.filter((t) => t.status !== "completed").reduce((n, t) => n + t.estimated_minutes, 0),
        completed_minutes: onDay.filter((t) => t.status === "completed").reduce((n, t) => n + t.estimated_minutes, 0),
        tasks: onDay,
      });
    }
    const weakSkills = skills.skills.filter((s) => s.category !== "project" && s.status === "weak").map((s) => s.label);
    const unassessed = skills.skills.filter((s) => s.category !== "project" && s.status === "unassessed").map((s) => s.label);
    const completed = tasks.filter((t) => t.status === "completed").sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
    return {
      generated_at: now.toISOString(),
      today,
      needs_profile: profile === null,
      profile,
      plan: profile && plan && plan.generation > 0 ? { generation: plan.generation, generated_at: plan.generated_at, feasibility: plan.feasibility, days_until_placement: profile.placement_date ? diffDays(profile.placement_date, today) : null } : null,
      today_tasks: todayTasks,
      today_minutes: todayTasks.reduce((n, t) => n + t.estimated_minutes, 0),
      today_capacity_minutes: profile ? capacityOn(profile, today) : 0,
      week: days,
      counts: {
        planned: tasks.filter((t) => t.status === "planned").length,
        in_progress: tasks.filter((t) => t.status === "in_progress").length,
        completed: completed.length,
        skipped: tasks.filter((t) => t.status === "skipped").length,
      },
      outstanding_priorities: live.filter((t) => t.priority <= PLAN_RULES.mustDoPriority).sort(order),
      skills,
      history: {
        recent_completed: completed.slice(0, 10).map((t) => present(t, byId)),
        changes: (plan?.changes ?? []).slice(0, 15),
        improvements: improvements(ev, completed, today),
        repeated_difficulties: repeatedDifficulties(ev),
        revision: { due: ev.dsa.overview?.revision_due ?? 0, items: ev.dsa.revision.length },
      },
      readiness: {
        sufficient_evidence: skills.skills.filter((s) => s.category !== "project" && (s.confidence === "medium" || s.confidence === "high")).map((s) => s.label),
        weak: weakSkills,
        unassessed,
        next_diagnostics: skills.skills.filter((s) => s.next_assessment && (s.next_assessment.type === "diagnostic" || s.next_assessment.type === "technical_interview" || s.next_assessment.type === "dbms") && s.status === "unassessed").slice(0, 5).map((s) => ({ area: s.label, description: s.next_assessment!.description })),
        note: "Readiness here means how much has been measured per skill. There is no overall score and no probability of an offer.",
      },
      limitations: skills.limitations,
    };
  }
}

// ---------------- pure helpers ----------------

function taskFrom(uid: string, c: Candidate, due: string, at: string, id: string): Omit<TaskRecord, "history"> {
  return {
    id,
    owner_uid: uid,
    type: c.type,
    title: c.title,
    description: c.description,
    skill_area: c.skill_area,
    priority: c.priority,
    estimated_minutes: c.minutes,
    due_date: due,
    original_due_date: due,
    link: c.link,
    ref: c.ref,
    completion_criteria: c.completion_criteria,
    completion_check: c.completion_check,
    evidence_source: c.evidence_source,
    reason: c.reason,
    reason_codes: c.reason_codes,
    depends_on: c.depends_on_keys.map((k) => taskIdFor(uid, k)),
    blocked: false,
    status: "planned",
    postponed_count: 0,
    skip_reason: null,
    completed_at: null,
    completed_by: null,
    student_scheduled: false,
    created_at: at,
    updated_at: at,
  };
}

/** The API view of a task: no owner, and `blocked` computed from its prerequisites. */
export function present(t: TaskRecord, byId: Map<string, TaskRecord>): PlacementTask {
  const { owner_uid: _owner, ...rest } = t;
  return { ...rest, blocked: ACTIVE.has(t.status) && t.depends_on.some((id) => {
    const d = byId.get(id);
    return d !== undefined && ACTIVE.has(d.status);
  }) };
}

/** The real record proving a verified-event task is done, or null. */
export function completionProof(t: TaskRecord, ev: EvidenceBundle): string | null {
  switch (t.ref.kind) {
    case "revision": {
      const item = ev.dsa.revision.find((r) => r.question_id === t.ref.id);
      return item?.last_reviewed_at && item.last_reviewed_at > t.created_at && !item.due ? "The revision queue recorded your review." : null;
    }
    case "question": {
      const o = ev.dsa.outcomes.find((x) => x.question_id === t.ref.id);
      if (!o) return null;
      if (t.type === "diagnostic") return o.attempts > 0 && o.last_attempt_at !== null && o.last_attempt_at > t.created_at ? "A counted judged submission now exists for this question." : null;
      return o.solved ? "A judged submission for this question was accepted." : null;
    }
    case "dbms_topic":
      return ev.dbms.topics.find((x) => x.id === t.ref.id)?.passed ? "The server recorded a passed quiz for this DBMS topic." : null;
    case "role":
      return ev.interview.sessions.some((s) => s.role_id === t.ref.id && s.created_at > t.created_at && s.assessed_skill_ids.length > 0) ? "An interview session with an assessed claim was recorded." : null;
    case "mentor_mode":
      return ev.conversations.some((c) => c.mode === t.ref.id && c.updated_at > t.created_at && c.messages >= 4) ? "A conversation of at least two exchanges was recorded in the AI mentor." : null;
    case "github_check":
      return ev.github.status === "available" && ev.github.syncedAt !== null && ev.github.syncedAt > t.created_at && !ev.github.gaps.some((g) => `${g.repository}:${g.check}` === t.ref.id) ? "The latest GitHub synchronisation shows the check passing." : null;
    default:
      return null;
  }
}

/** Why a planned (not started) task can no longer apply, or null. */
export function obsoleteReason(t: TaskRecord, ev: EvidenceBundle, today: string): string | null {
  if (t.type === "dsa_revision" && ev.dsa.overview !== null) {
    const item = ev.dsa.revision.find((r) => r.question_id === t.ref.id);
    return !item || (!item.due && item.status !== "in_progress") ? "It is no longer due in the revision queue." : null;
  }
  if ((t.type === "dsa_practice" || t.type === "diagnostic") && t.ref.kind === "question" && !ev.dsa.gradable.some((g) => g.summary.id === t.ref.id)) return "This question can no longer be judged.";
  if (t.type === "project" && ev.github.status !== "available") return "GitHub is no longer connected or synchronised, so this task cannot be completed. Your other tasks are unaffected.";
  if ((t.ref.kind === "role" || t.ref.kind === "mentor_mode" || t.ref.kind === "review") && t.due_date < weekStart(today)) return "That week has passed.";
  return null;
}

function improvements(ev: EvidenceBundle, completed: TaskRecord[], today: string): PlacementImprovement[] {
  const out: PlacementImprovement[] = [];
  const o = ev.dsa.overview;
  for (const w of o?.weaknesses ?? []) if (w.trend === "improving") out.push({ at: null, area: `dsa:${w.topic}`, message: `Your ${w.topic} results are improving (from judged submissions).`, source: "dsa_judged" });
  const cmp = o?.comparison;
  if (cmp?.available && cmp.current.accuracy.value !== null && cmp.previous.accuracy.value !== null && cmp.current.accuracy.value > cmp.previous.accuracy.value) {
    out.push({ at: cmp.current.to, area: "dsa", message: `Judged submission accuracy rose from ${Math.round(cmp.previous.accuracy.value * 100)}% to ${Math.round(cmp.current.accuracy.value * 100)}% between the last two 28-day periods.`, source: "dsa_judged" });
  }
  for (const t of ev.dbms.topics) {
    if (t.passed) out.push({ at: t.last_attempt_at, area: "dbms", message: `You passed the DBMS quiz "${t.title}".`, source: "dbms_quiz" });
  }
  for (const t of completed.filter((x) => x.completed_by === "verified_event" && (x.completed_at ?? "").slice(0, 10) >= addDays(today, -14)).slice(0, 5)) out.push({ at: t.completed_at, area: t.skill_area, message: `Completed with proof from your records: ${t.title}`, source: "plan" });
  return out.slice(0, 12);
}

function repeatedDifficulties(ev: EvidenceBundle): { area: string; detail: string }[] {
  const o = ev.dsa.overview;
  const out: { area: string; detail: string }[] = [];
  for (const r of o?.repeated_failures ?? []) out.push({ area: r.title ?? r.question_id, detail: `Failed ${r.consecutive_failures} times in a row in judged submissions (${r.attempts} attempts).` });
  for (const w of o?.weaknesses ?? []) if (w.status === "weak") out.push({ area: `dsa:${w.topic}`, detail: w.explanation[0] ?? "Weak by your judged submissions." });
  return out.slice(0, 8);
}

/**
 * Moves work that no longer fits its day (after a change of daily minutes or available weekdays): lowest priority first,
 * to the next days with room. Tasks that cannot be placed stay where they are. Returns the tasks that moved.
 */
export function rebalance(tasks: TaskRecord[], profile: PlacementProfile, today: string, at: string, changes: PlacementChange[], reason: string): TaskRecord[] {
  const active = tasks.filter((t) => ACTIVE.has(t.status) && t.due_date >= today);
  const moved: TaskRecord[] = [];
  const dates = [...new Set(active.map((t) => t.due_date))].sort();
  const used = usedByDate(active);
  for (const d of dates) {
    const cap = capacityOn(profile, d);
    const onDay = active.filter((t) => t.due_date === d).sort((a, b) => b.priority - a.priority || b.estimated_minutes - a.estimated_minutes);
    let total = onDay.reduce((n, t) => n + t.estimated_minutes, 0);
    for (const t of onDay) {
      const fits = cap > 0 && (total <= cap || onDay.length === 1);
      if (fits) break;
      used.set(d, (used.get(d) ?? 0) - t.estimated_minutes);
      const slot = findSlot(profile, used, t.estimated_minutes, addDays(d, 1), addDays(d, 42));
      if (!slot) {
        used.set(d, (used.get(d) ?? 0) + t.estimated_minutes);
        continue;
      }
      used.set(slot, (used.get(slot) ?? 0) + t.estimated_minutes);
      total -= t.estimated_minutes;
      t.due_date = slot;
      t.history = [...t.history, { at, event: "rescheduled", detail: `From ${d} to ${slot}` }].slice(-MAX_HISTORY);
      t.updated_at = at;
      changes.push({ at, kind: "task_rescheduled", summary: `"${t.title}" moved from ${d} to ${slot}`, reason, task_id: t.id });
      moved.push(t);
    }
  }
  return moved;
}

function describeProfileChange(a: PlacementProfile, b: PlacementProfile): string {
  const parts: string[] = [];
  if (a.daily_minutes !== b.daily_minutes) parts.push(`daily time ${a.daily_minutes} to ${b.daily_minutes} minutes`);
  if (a.available_weekdays.join() !== b.available_weekdays.join()) parts.push("study days");
  if (a.placement_date !== b.placement_date) parts.push(`placement date ${a.placement_date ?? "none"} to ${b.placement_date ?? "none"}`);
  if (a.role_ids.join() !== b.role_ids.join()) parts.push("target roles");
  if (a.priorities.join() !== b.priorities.join()) parts.push("priorities");
  return parts.length > 0 ? `Goals updated: ${parts.join(", ")}` : "Goals saved without changes to the plan inputs";
}

export type { PlacementFeasibility, PlacementProposedChange, ProfileRecord };
