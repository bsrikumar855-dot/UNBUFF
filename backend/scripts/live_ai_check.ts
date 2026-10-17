/**
 * Controlled LIVE check of the AI mentor against the real configured model. Operator tool, not part of the test suite.
 *
 *   npx tsx scripts/live_ai_check.ts
 *
 * Needs GEMINI_API_KEY (from backend/.env or the environment). Sends a handful of short SYNTHETIC messages (no real
 * student data, no tokens, no credentials). Prints only pass/fail lines and non-secret facts: never the key, never a
 * full reply. Storage is IN MEMORY, so this proves the live model path and the memory logic, not durable persistence.
 * Exit status 0 only when every check passed.
 */
import "dotenv/config";
import { ThinkingLevel } from "@google/genai";
import { pino } from "pino";
import { AnalyticsService } from "../src/analytics/service.js";
import { MemoryRevisionStore, MemoryStatsStore } from "../src/analytics/stores.js";
import { MemorySubmissionStore } from "../src/code/submissionStore.js";
import { Catalogue, parseCatalogueFile } from "../src/dsa/catalogue.js";
import { DsaProgressService } from "../src/dsa/progressService.js";
import { MemoryProgressStore } from "../src/dsa/progressStore.js";
import { GeminiProvider } from "../src/llm/gemini.js";
import { LlmError, type LLMProvider } from "../src/llm/provider.js";
import { MentorService } from "../src/mentor/service.js";
import { MemoryMentorStore } from "../src/mentor/store.js";
import { RoleRegistry } from "../src/services/roles.js";
import { MemoryStore } from "../src/store/memoryStore.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const key = process.env.GEMINI_API_KEY ?? "";
if (!key) {
  console.log("BLOCKED: GEMINI_API_KEY is not set. Nothing was sent.");
  process.exit(2);
}

const lines: string[] = [];
const sink = { write: (s: string) => void lines.push(s) };
const logger = pino({ level: "debug" }, sink);

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const live = new GeminiProvider({
  apiKey: key,
  model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
  fallbackModel: process.env.GEMINI_FALLBACK_MODEL,
  gradeThinking: (process.env.GRADE_THINKING ?? "LOW") as ThinkingLevel,
  mentorModel: process.env.MENTOR_MODEL,
  logger,
});

/** Records every prompt the model is given, to show what context was assembled. */
const prompts: { system: string; prompt: string }[] = [];
const recording: LLMProvider = new Proxy(live, {
  get(target, prop, receiver) {
    const v = Reflect.get(target, prop, receiver) as unknown;
    if (prop === "mentorChat" && typeof v === "function") {
      return async (input: { system: string; prompt: string }) => {
        prompts.push(input);
        return (v as (i: typeof input) => Promise<unknown>).call(target, input);
      };
    }
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
  },
});

const root = join(import.meta.dirname, "..");
const catalogue = new Catalogue(parseCatalogueFile(JSON.parse(readFileSync(join(root, "data", "dsa", "practice-pack.json"), "utf8"))));
const roles = RoleRegistry.fromDirectory(join(root, "data", "roles"));
const stats = new MemoryStatsStore();
const revisions = new MemoryRevisionStore();
const progress = new DsaProgressService(new MemoryProgressStore(), () => catalogue);
const analytics = new AnalyticsService({ stats, revisions, submissions: new MemorySubmissionStore(), progress, catalogue: () => catalogue, logger });
const mentor = new MentorService({ store: new MemoryMentorStore(), llm: recording, stats, revisions, analytics, progress, catalogue: () => catalogue, sessions: new MemoryStore(), roles, logger });

const A = "live-check-student-a";
const B = "live-check-student-b";
const MARKER = "zebra-quartz-check";
const chat = (uid: string, message: string, id: string) => mentor.chat(uid, { mode: "placement_mentor", message, client_message_id: id });

async function main() {
  console.log(`Live model: ${process.env.GEMINI_MODEL ?? "default"} (fallback ${process.env.GEMINI_FALLBACK_MODEL ?? "none"}). Storage: in memory.`);

  // 1. a real request returns a valid, structured answer
  const first = await chat(A, `My target role is Frontend Developer. I find ${MARKER} closures hard. Give me one short study tip.`, "cm_live_check_01");
  check("live model returns a non-empty reply", first.reply.content.trim().length > 0 && first.mock === false, `${first.reply.content.length} characters`);
  check("reply is not flagged as the mock mentor", first.mock === false);
  check("conversation was stored", first.persistence.conversation === "saved");

  // 2. memory: saved only through the evidence guard, with application-set provenance
  check("any saved memory has provenance set by the application", first.memory_saved.every((m) => m.provenance === "student_provided"), `${first.memory_saved.length} memory item(s) saved by the model's proposals`);
  const saved = (await mentor.listMemories(A, undefined, 1, 50)).memories;
  let memoryId = saved.find((m) => m.content.toLowerCase().includes("closure") || m.content.toLowerCase().includes(MARKER))?.id;
  if (!memoryId) {
    console.log("NOTE  the model proposed no usable memory this time; adding one as the student would (student_provided) to test retrieval");
    memoryId = (await mentor.createMemory(A, { type: "learning", content: `Finds ${MARKER} closures difficult`, topic: "closures", signal: "difficult" })).id;
  }

  // 3. a separate conversation retrieves the memory
  prompts.length = 0;
  const second = await chat(A, "What should I focus on this week? Keep it to two sentences.", "cm_live_check_02");
  const secondPrompt = prompts.at(-1)?.prompt ?? "";
  check("a new conversation gets the saved memory in its context", /closure/i.test(secondPrompt) && secondPrompt.includes("<student_memories>"));
  check("second conversation is a different conversation", second.conversation.id !== first.conversation.id);
  check("memory context holds only the student's own items", !secondPrompt.includes("live-check-student-b"));

  // 4. another student cannot see it
  prompts.length = 0;
  await chat(B, "What should I focus on this week? Keep it to two sentences.", "cm_live_check_03");
  const bPrompt = prompts.at(-1)?.prompt ?? "";
  check("another student's context contains none of this student's memory", !/closure/i.test(bPrompt) && !bPrompt.includes(MARKER));
  check("another student cannot list or read this student's conversation", (await mentor.listConversations(B, 1, 20)).conversations.every((c) => c.id !== first.conversation.id));
  let blocked = false;
  try {
    await mentor.getConversation(B, first.conversation.id);
  } catch {
    blocked = true;
  }
  check("reading someone else's conversation is refused", blocked);

  // 5. deletion is reflected in the next retrieval
  await mentor.deleteMemory(A, memoryId);
  prompts.length = 0;
  await chat(A, "Remind me what to practise next. Keep it to two sentences.", "cm_live_check_04");
  const afterDelete = prompts.at(-1)?.prompt ?? "";
  check("a deleted memory is no longer retrieved", !afterDelete.includes(MARKER));

  // 6. what is given to the model carries no credentials and no unverified evidence
  const everything = prompts.map((p) => p.system + p.prompt).join("\n");
  check("prompts contain no API key", !everything.includes(key));
  check("verified-activity block states that no verified practice exists (nothing was fabricated)", /<verified_activity>[\s\S]*?No verified judged practice is recorded yet[\s\S]*?<\/verified_activity>/.test(prompts.at(-1)?.prompt ?? ""), "student has no judged submissions in this check");

  // 7. failure behaviour of the real provider
  const timeoutProvider = new GeminiProvider({ apiKey: key, model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite", mentorTimeoutMs: 1, logger });
  let timeoutCode = "";
  try {
    await timeoutProvider.mentorChat({ system: "Reply with JSON.", prompt: "hello" });
  } catch (e) {
    timeoutCode = e instanceof LlmError ? e.code : `other:${(e as Error).name}`;
  }
  check("a provider timeout becomes LLM_TIMEOUT", timeoutCode === "LLM_TIMEOUT", timeoutCode || "no error");

  const badKeyProvider = new GeminiProvider({ apiKey: "invalid-key-for-test", model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite", logger });
  let badCode = "";
  try {
    await badKeyProvider.mentorChat({ system: "Reply with JSON.", prompt: "hello" });
  } catch (e) {
    badCode = e instanceof LlmError ? e.code : `other:${(e as Error).name}`;
  }
  check("an authentication failure becomes a handled LlmError (not a crash)", badCode === "LLM_INVALID_OUTPUT", badCode || "no error");

  // 8. logs
  const log = lines.join("\n");
  check("logs do not contain the API key", !log.includes(key));
  check("logs do not contain student message text", !log.includes(MARKER) && !log.includes("Frontend Developer. I find"));
}

main()
  .catch((e: unknown) => {
    failures += 1;
    console.log(`FAIL  unexpected error: ${(e as Error).name}: ${String((e as Error).message).replaceAll(key, "[key]").slice(0, 200)}`);
  })
  .finally(() => {
    console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
  });
