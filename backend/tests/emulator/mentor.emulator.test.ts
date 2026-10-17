import { Firestore } from "@google-cloud/firestore";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnalyticsService } from "../../src/analytics/service.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../../src/analytics/stores.js";
import { MemorySubmissionStore } from "../../src/code/submissionStore.js";
import { DsaProgressService } from "../../src/dsa/progressService.js";
import { MemoryProgressStore } from "../../src/dsa/progressStore.js";
import { MentorService } from "../../src/mentor/service.js";
import { FirestoreMentorStore, type ConversationRecord, type MemoryRecord } from "../../src/mentor/store.js";
import { MemoryStore } from "../../src/store/memoryStore.js";
import { roles, silentLogger } from "../helpers.js";
import { RecordingLlm } from "../mentor/recordingLlm.js";
import { bearer, fixtureCatalogue, testApp } from "../integration/app.js";
import { PROJECT_ID, requireEmulators } from "./emulator.js";

/** Mentor storage on the real Firestore emulator (the model is the deterministic mock). The emulator is not a live project. */
const run = randomUUID();
const names = { conversations: `t_conv_${run}`, memories: `t_mem_${run}` };
let db: Firestore;

beforeAll(() => {
  requireEmulators();
  db = new Firestore({ projectId: PROJECT_ID, ignoreUndefinedProperties: true });
});

afterAll(async () => {
  for (const c of Object.values(names)) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await db.terminate();
});

const conversation = (id: string, owner: string): ConversationRecord => ({
  id, owner_uid: owner, title: "t", mode: "dsa_coach", hint_level: 0, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", turns: 1, summarized_turns: 0,
  expires_at: "2099-01-01T00:00:00.000Z", messages: [{ id: "m1", role: "user", content: "hi", at: "2026-01-01T00:00:00.000Z", client_message_id: "client-0001" }],
});

const memory = (id: string, owner: string): MemoryRecord => ({
  id, owner_uid: owner, type: "learning", key: null, topic: "graphs", content: "c", provenance: "student_provided", confidence: "medium", signal: "difficult", status: null, track: null,
  completed_by: null, source_conversation_id: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", expires_at: null, review_at: null,
});

describe("FirestoreMentorStore on the emulator", () => {
  it("saves, reads, lists by owner and deletes conversations and memories", async () => {
    const store = new FirestoreMentorStore(names, db);
    await store.saveConversation(conversation("conv_a1", "owner-a"));
    await store.saveConversation(conversation("conv_b1", "owner-b"));
    await store.saveMemory({ ...memory("mem_a1", "owner-a"), value: ["x"] });
    await store.saveMemory(memory("mem_b1", "owner-b"));
    expect((await store.getConversation("conv_a1"))?.messages[0]?.client_message_id).toBe("client-0001");
    expect((await store.listConversations("owner-a", 50)).map((c) => c.id)).toEqual(["conv_a1"]);
    expect((await store.listMemories("owner-b", 50)).map((m) => m.id)).toEqual(["mem_b1"]);
    expect(await store.getMemory("not a valid id")).toBeNull();
    await store.deleteMemory("mem_a1");
    expect(await store.getMemory("mem_a1")).toBeNull();
    await store.deleteConversation("conv_a1");
    expect(await store.getConversation("conv_a1")).toBeNull();
  });

  it("deletes every record of one student (in batches) and leaves other students' records alone", async () => {
    const store = new FirestoreMentorStore(names, db);
    for (let i = 0; i < 430; i++) await store.saveMemory(memory(`mem_bulk_${i}`, "owner-bulk"));
    await store.saveMemory(memory("mem_keep", "owner-keep"));
    await store.saveConversation(conversation("conv_bulk", "owner-bulk"));
    expect(await store.deleteMemoriesByOwner("owner-bulk")).toBe(430);
    expect(await store.listMemories("owner-bulk", 500)).toEqual([]);
    expect((await store.listMemories("owner-keep", 10)).map((m) => m.id)).toEqual(["mem_keep"]);
    expect(await store.deleteConversationsByOwner("owner-bulk")).toBe(1);
    expect(await store.getConversation("conv_bulk")).toBeNull();
  }, 60_000);
});

describe("mentor API over Firestore on the emulator", () => {
  function app(llm = new RecordingLlm()) {
    const catalogue = fixtureCatalogue();
    const progress = new DsaProgressService(new MemoryProgressStore(), () => catalogue);
    const stats = new MemoryStatsStore();
    const revisions = new MemoryRevisionStore();
    const analytics = new AnalyticsService({ stats, revisions, submissions: new MemorySubmissionStore(), progress, catalogue: () => catalogue, logger: silentLogger });
    const mentor = new MentorService({ store: new FirestoreMentorStore(names, db), llm, stats, revisions, analytics, progress, catalogue: () => catalogue, sessions: new MemoryStore(), roles, logger: silentLogger });
    return { llm, app: testApp({ autoAuth: false, mentor, analytics, catalogue, llm, rateLimits: { globalPerMinute: 10_000, llmPerMinute: 10_000, mentorChatPerMinute: 10_000 } }) };
  }

  it("persists memories and conversations across a simulated restart, keeps students apart, and deletes for real", async () => {
    const as = (uid: string) => ({ Authorization: bearer(uid) });
    const first = app();
    const chat = (a: ReturnType<typeof app>, uid: string, body: object) => request(a.app).post("/api/mentor/chat").set(as(uid)).send({ mode: "placement_mentor", client_message_id: `cm_${randomUUID().slice(0, 12)}`, ...body });

    const res = await chat(first, "emu-alice", { message: "My target role is Backend Engineer. I find graph theory hard." }).expect(200);
    expect(res.body.persistence).toEqual({ conversation: "saved", memory: "saved" });
    const conv = res.body.conversation.id as string;

    const second = app(); // new service instances over the same database
    await chat(second, "emu-alice", { conversation_id: conv, message: "Where were we?" }).expect(200);
    expect(second.llm.chats[0]!.prompt).toContain('"text":"Target roles: Backend Engineer"');
    expect(second.llm.chats[0]!.prompt).toContain("user: My target role is Backend Engineer.");
    expect((await request(second.app).get("/api/mentor/memories").set(as("emu-alice")).expect(200)).body.counts).toMatchObject({ profile: 1, learning: 1 });

    expect((await request(second.app).get(`/api/mentor/conversations/${conv}`).set(as("emu-bob"))).status).toBe(404);
    expect((await request(second.app).get("/api/mentor/memories").set(as("emu-bob")).expect(200)).body.total).toBe(0);

    await request(second.app).delete("/api/mentor/memories?conversations=true").set(as("emu-alice")).expect(204);
    const store = new FirestoreMentorStore(names, db);
    expect(await store.listMemories("emu-alice", 50)).toEqual([]);
    expect(await store.listConversations("emu-alice", 50)).toEqual([]);
  });
});
