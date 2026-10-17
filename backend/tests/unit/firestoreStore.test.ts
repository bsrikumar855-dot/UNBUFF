import type { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreStore } from "../../src/store/firestoreStore.js";
import type { Session } from "../../src/store/SessionStore.js";
import { claim } from "../helpers.js";

/** In-memory stand-in for the Firestore client: collection(name).doc(id).get()/set(). */
function fakeFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  const writes: { path: string; data: Record<string, unknown> }[] = [];
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
          set: async (data: Record<string, unknown>) => {
            writes.push({ path, data });
            docs.set(path, data);
          },
        };
      },
    }),
  };
  return { db: db as unknown as Firestore, docs, writes };
}

function session(): Session {
  const c = claim("CL-001", "react_state", "shaky", 0.25, {
    levels_passed: 1,
    missing_concepts: ["reconciliation"],
    evidence: [{ level: 1, criterion: "ownership", passed: true, quote: "I wrote the cart slice" }],
    qa: [
      {
        level: 1,
        kind: "question",
        mode: "assess",
        question: "What did you build?",
        answer: "I wrote the cart slice",
        grade: {
          criteria: {
            accuracy: { passed: true, evidence_quote: "I wrote the cart slice", missing_concept: null },
            specificity: { passed: true, evidence_quote: "cart slice", missing_concept: null },
            mechanism: { passed: false, evidence_quote: null, missing_concept: "how it re-renders" },
            ownership: { passed: true, evidence_quote: "I wrote", missing_concept: null },
            tradeoff: { passed: false, evidence_quote: null, missing_concept: null },
          },
          admits_gap: false,
          needs_clarification: false,
          level_passed: true,
          guard_flips: [],
          root_cause: null,
        },
        asked_at: "2026-09-26T10:00:00.000Z",
      },
    ],
    retest: { attempted: true, passed: false, before: 0.25, after: 0.25, interleaved_claims: 2 },
    root_cause: "Reconciliation",
    retest_status: "done",
  });
  return {
    id: "s_fs",
    role_id: "frontend_developer",
    created_at: "2026-09-26T10:00:00.000Z",
    resume_text: "Built a React dashboard\n\nUsed Git",
    declared_skills: ["React"],
    claims: [c],
    next_seq: 2,
    mode: "prepare",
    cursors: { "CL-001": { mode: "retest", level: 2, start_level: 2, clarify_used: true, interleaved_claims: 2 } },
    history: [{ at: "2026-09-26T10:01:00.000Z", mode: "assess", claim_id: "CL-001", skill_id: "react_state", proficiency: 0.25 }],
    guard_flips: 3,
    completions: 5,
    schedule: { "CL-001": { teach_completed_at_claims_done: 3, order: 1 } },
  };
}

describe("FirestoreStore (mocked client)", () => {
  it("round-trips a session through save → get", async () => {
    const { db } = fakeFirestore();
    const store = new FirestoreStore("sessions", db);
    const s = session();
    await store.save(s);
    expect(await store.get("s_fs")).toEqual(s);
  });

  it("returns null for a missing session", async () => {
    const store = new FirestoreStore("sessions", fakeFirestore().db);
    expect(await store.get("s_missing")).toBeNull();
  });

  it("returns null for a document without the json payload", async () => {
    const fake = fakeFirestore();
    fake.docs.set("sessions/s_odd", { updated_at: new Date() });
    expect(await new FirestoreStore("sessions", fake.db).get("s_odd")).toBeNull();
  });

  it("serializes nested claims, qa, grades, cursors and history as one JSON document", async () => {
    const fake = fakeFirestore();
    await new FirestoreStore("sessions", fake.db).save(session());
    expect(fake.writes).toHaveLength(1);
    const write = fake.writes[0]!;
    expect(write.path).toBe("sessions/s_fs");
    expect(typeof write.data.json).toBe("string");
    expect(write.data.updated_at).toBeInstanceOf(Date);
    const parsed = JSON.parse(write.data.json as string) as Session;
    expect(parsed.claims[0]?.qa[0]?.grade?.criteria.mechanism.missing_concept).toBe("how it re-renders");
    expect(parsed.cursors["CL-001"]).toEqual({ mode: "retest", level: 2, start_level: 2, clarify_used: true, interleaved_claims: 2 });
    expect(parsed.schedule["CL-001"]).toEqual({ teach_completed_at_claims_done: 3, order: 1 });
    expect(parsed.history[0]?.skill_id).toBe("react_state");
  });

  it("overwrites on re-save (latest state wins)", async () => {
    const fake = fakeFirestore();
    const store = new FirestoreStore("sessions", fake.db);
    const s = session();
    await store.save(s);
    s.guard_flips = 7;
    s.claims[0]!.verdict = "defended";
    await store.save(s);
    const got = await store.get("s_fs");
    expect(got?.guard_flips).toBe(7);
    expect(got?.claims[0]?.verdict).toBe("defended");
  });
});
