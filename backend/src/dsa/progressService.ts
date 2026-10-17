import { ApiError } from "../errors.js";
import type { DsaProgress, DsaProgressListResponse, DsaProgressUpdate } from "../types.js";
import type { Catalogue } from "./catalogue.js";
import type { ProgressRecord, ProgressStore } from "./progressStore.js";

const toPublic = ({ owner_uid: _owner, ...rest }: ProgressRecord): DsaProgress => rest;

/**
 * A student's own DSA progress. The uid always comes from the verified token (passed in by the route);
 * records are keyed by (uid, question), so nobody can address another student's data.
 */
export class DsaProgressService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: ProgressStore,
    private readonly catalogue: () => Catalogue,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(uid: string): Promise<DsaProgressListResponse> {
    const records = await this.store.listByOwner(uid);
    return { progress: records.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(toPublic) };
  }

  /** Creates or updates the single record for (uid, question). Omitted fields keep their current value. */
  put(uid: string, questionId: string, update: DsaProgressUpdate): Promise<DsaProgress> {
    return this.serialize(`${uid}~${questionId}`, async () => {
      const existing = await this.store.get(uid, questionId);
      // New records need a question that is in the catalogue; existing ones stay editable even if it later left.
      if (!existing && !this.catalogue().hasQuestion(questionId)) {
        throw new ApiError("QUESTION_NOT_FOUND", `Question ${questionId} not found`);
      }
      const at = this.now().toISOString();
      const next: ProgressRecord = {
        owner_uid: uid,
        question_id: questionId,
        status: update.status ?? existing?.status ?? "not_started",
        bookmarked: update.bookmarked ?? existing?.bookmarked ?? false,
        notes: update.notes ?? existing?.notes ?? "",
        created_at: existing?.created_at ?? at,
        updated_at: at,
      };
      await this.store.put(next);
      return toPublic(next);
    });
  }

  /** Removes the caller's record. Idempotent: deleting a missing record succeeds. */
  delete(uid: string, questionId: string): Promise<void> {
    return this.serialize(`${uid}~${questionId}`, () => this.store.delete(uid, questionId));
  }

  private async serialize<T>(k: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(k) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    this.locks.set(k, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(k) === run) this.locks.delete(k);
    }
  }
}
