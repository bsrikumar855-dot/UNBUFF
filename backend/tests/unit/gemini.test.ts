import { ApiError as GenAiApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { newClaim } from "../../src/core/claims.js";
import { GeminiProvider } from "../../src/llm/gemini.js";
import { LlmError } from "../../src/llm/provider.js";
import { role, silentLogger } from "../helpers.js";

interface Call {
  model: string;
  contents: string;
  config: { temperature?: number; responseMimeType?: string; responseJsonSchema?: unknown; abortSignal?: AbortSignal };
}
type Reply = string | Error | "hang";

/** Fake @google/genai client that replays scripted replies and records every request. */
function fakeClient(replies: Reply[]) {
  const calls: Call[] = [];
  const client = {
    models: {
      generateContent: async (req: Call) => {
        calls.push(req);
        const next = replies.shift() ?? "{}";
        if (next === "hang") {
          return new Promise<never>((_, reject) => {
            req.config.abortSignal?.addEventListener("abort", () => reject(new Error("This operation was aborted")));
          });
        }
        if (next instanceof Error) throw next;
        return { text: next };
      },
    },
  };
  return { client: client as unknown as ConstructorParameters<typeof GeminiProvider>[0]["client"], calls };
}

const skill = role.skills[1]!;
const claim = newClaim("CL-001", { text: "Built a dashboard", resume_line: null, skill_id: skill.id, source: "declared" });
const ctx = { role, skill, claim, level: 1 as const, history: [] };

function provider(replies: Reply[], extra: Partial<ConstructorParameters<typeof GeminiProvider>[0]> = {}) {
  const fake = fakeClient(replies);
  const p = new GeminiProvider({ model: "primary", logger: silentLogger, client: fake.client, ...extra });
  return { p, calls: fake.calls };
}

describe("GeminiProvider", () => {
  it("requests structured JSON with a schema and the right temperature", async () => {
    const { p, calls } = provider(['{"question":"What did you build?"}']);
    expect(await p.question(ctx)).toBe("What did you build?");
    expect(calls[0]?.config.responseMimeType).toBe("application/json");
    expect(calls[0]?.config.responseJsonSchema).toMatchObject({ type: "object", required: ["question"] });
    expect(calls[0]?.config.temperature).toBe(0.7);
    expect(calls[0]?.model).toBe("primary");
  });

  it("uses temperature 0.2 for grading", async () => {
    const criterion = { passed: false, evidence_quote: null, missing_concept: "x" };
    const grade = { criteria: { accuracy: criterion, specificity: criterion, mechanism: criterion, ownership: criterion, tradeoff: criterion }, admits_gap: false, needs_clarification: false };
    const { p, calls } = provider([JSON.stringify(grade)]);
    await p.grade({ ...ctx, question: "q", answer: "a" });
    expect(calls[0]?.config.temperature).toBe(0.2);
  });

  it("retries once with a note on invalid JSON, then succeeds", async () => {
    const { p, calls } = provider(["not json", '{"question":"Second try?"}']);
    expect(await p.question(ctx)).toBe("Second try?");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.contents).toContain("Your previous output was invalid JSON for the schema. Return only valid JSON.");
  });

  it("throws LLM_INVALID_OUTPUT after a second schema failure", async () => {
    const { p, calls } = provider(['{"wrong":1}', '{"question":""}']);
    await expect(p.question(ctx)).rejects.toMatchObject({ code: "LLM_INVALID_OUTPUT" });
    expect(calls).toHaveLength(2);
  });

  it("on 429 retries on the fallback model and skips the primary during the cooldown", async () => {
    const quota = new GenAiApiError({ message: "Quota exceeded. Please retry in 30.5s.", status: 429 });
    const { p, calls } = provider([quota, '{"question":"From fallback"}', '{"question":"Still fallback"}'], { fallbackModel: "fallback" });
    expect(await p.question(ctx)).toBe("From fallback");
    expect(await p.question(ctx)).toBe("Still fallback");
    expect(calls.map((c) => c.model)).toEqual(["primary", "fallback", "fallback"]);
    expect(calls[1]?.contents).not.toContain("invalid JSON"); // transient retry has no JSON note
  });

  it("gives up after two transient failures", async () => {
    const down = new GenAiApiError({ message: "overloaded", status: 503 });
    const { p } = provider([down, down]);
    await expect(p.question(ctx)).rejects.toBeInstanceOf(LlmError);
  });

  it("non-transient API errors (e.g. 400) fail immediately without retry", async () => {
    const bad = new GenAiApiError({ message: "bad request", status: 400 });
    const { p, calls } = provider([bad, '{"question":"never"}']);
    await expect(p.question(ctx)).rejects.toMatchObject({ code: "LLM_INVALID_OUTPUT" });
    expect(calls).toHaveLength(1);
  });

  it("times out with LLM_TIMEOUT", async () => {
    const { p } = provider(["hang"], { timeoutMs: 20 });
    await expect(p.question(ctx)).rejects.toMatchObject({ code: "LLM_TIMEOUT" });
  });
});
