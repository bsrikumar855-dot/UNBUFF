import type { Firestore } from "@google-cloud/firestore";

/**
 * Composite Firestore indexes the application's queries need. Single-field equality queries (including several
 * equality filters together, e.g. owner_uid == x AND analytics_status == "counted") are served by Firestore's
 * automatic single-field indexes and need nothing here. A query that combines an equality filter with orderBy on a
 * different field needs a composite index.
 *
 * Keep this list and firestore.indexes.json in step; tests fail if they drift.
 */
export interface RequiredIndex {
  collection: string;
  fields: [string, "ASCENDING" | "DESCENDING"][];
  usedBy: string;
}

export const SUBMISSIONS_COLLECTION = "unbluff_code_submissions";

export const REQUIRED_COMPOSITE_INDEXES: RequiredIndex[] = [
  {
    collection: SUBMISSIONS_COLLECTION,
    fields: [
      ["owner_uid", "ASCENDING"],
      ["created_at", "DESCENDING"],
    ],
    usedBy: "FirestoreSubmissionStore.listRecentByOwner (the excluded-submission counts on the analytics dashboard)",
  },
];

interface IndexesFile {
  indexes?: { collectionGroup?: string; queryScope?: string; fields?: { fieldPath?: string; order?: string }[] }[];
}

/** Returns what is missing or wrong in a parsed firestore.indexes.json (empty means it covers every required index). */
export function indexFileProblems(file: IndexesFile): string[] {
  const problems: string[] = [];
  for (const req of REQUIRED_COMPOSITE_INDEXES) {
    const found = (file.indexes ?? []).some(
      (i) =>
        i.collectionGroup === req.collection &&
        i.queryScope === "COLLECTION" &&
        (i.fields ?? []).length === req.fields.length &&
        req.fields.every(([path, order], n) => i.fields?.[n]?.fieldPath === path && i.fields?.[n]?.order === order),
    );
    if (!found) problems.push(`missing composite index on ${req.collection}(${req.fields.map(([f, o]) => `${f} ${o}`).join(", ")}), needed by ${req.usedBy}`);
  }
  return problems;
}

export interface IndexCheckResult {
  ok: boolean;
  detail: string;
}

/**
 * Runs the exact query that needs the composite index (read-only, for a made-up owner id, limit 1). Against a real
 * project a missing index fails with FAILED_PRECONDITION (gRPC code 9). The Firestore emulator does NOT enforce
 * indexes, so a pass there says nothing about a deployed project.
 */
export async function checkSubmissionIndex(db: Firestore, collection = SUBMISSIONS_COLLECTION): Promise<IndexCheckResult> {
  try {
    await db.collection(collection).where("owner_uid", "==", "index-check-no-such-user").orderBy("created_at", "desc").limit(1).get();
    return { ok: true, detail: `query on ${collection}(owner_uid ==, created_at desc) succeeded` };
  } catch (err) {
    const e = err as { code?: number | string; message?: string };
    if (e.code === 9 || e.code === "failed-precondition" || /requires an index|FAILED_PRECONDITION/i.test(e.message ?? "")) {
      return { ok: false, detail: `the composite index is missing or still building (FAILED_PRECONDITION). ${e.message ?? ""}`.trim() };
    }
    if (e.code === 7 || e.code === 16) return { ok: false, detail: "permission or credential problem (not an index problem): check FIREBASE_PROJECT_ID and the service account" };
    return { ok: false, detail: `unexpected error ${String(e.code ?? "")}: ${e.message ?? "unknown"}` };
  }
}
