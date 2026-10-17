import type { Claim, SessionMode, SkillHistoryEntry } from "../types.js";
import type { ScheduleState } from "../core/schedule.js";
import type { Cursor } from "../core/stateMachine.js";

/** Server-side session. Never sent to the client as-is. */
export interface Session {
  id: string;
  /** Firebase uid of the owner. Records without it (legacy) are never served to anyone. */
  owner_uid: string;
  role_id: string;
  mode: SessionMode;
  created_at: string;
  resume_text: string | null;
  declared_skills: string[];
  claims: Claim[];
  next_seq: number;
  /** In-progress ladders keyed by claim id. */
  cursors: Record<string, Cursor>;
  history: (SkillHistoryEntry & { skill_id: string })[];
  /** How many criteria the evidence guard forced to false in this session. */
  guard_flips: number;
  /** Count of assess/retest runs that reached `done` (drives retest scheduling). */
  completions: number;
  /** Internal retest schedule (teach time + order) keyed by claim id. */
  schedule: ScheduleState;
}

export interface SessionStore {
  get(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  /** Sessions owned by `uid` (records without an owner are never returned). */
  listByOwner(uid: string): Promise<Session[]>;
  /** Removes the session document entirely (resume text, answers, report data). No-op if absent. */
  delete(id: string): Promise<void>;
}
