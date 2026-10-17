import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";
import { ProfileInput } from "../mentor/memories.js";
import type { MentorService } from "../mentor/service.js";
import type { MemoryType, MentorChatRequest, MentorProfile } from "../types.js";

const convId = z.string().regex(/^conv_[a-f0-9]{24}$/, "invalid conversation id");
const memId = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, "invalid memory id");
const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "client_message_id must be 8 to 64 letters, digits, - or _");
const questionId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "invalid question id");
const page = z.coerce.number().int().min(1).max(1000).optional();
const pageSize = z.coerce.number().int().min(1).max(50).optional();
const bool = z.enum(["true", "false"]).transform((v) => v === "true").optional();

const ChatBody = z.strictObject({
  conversation_id: convId.optional(),
  mode: z.enum(["dsa_coach", "code_explainer", "interview_practice", "placement_mentor"]),
  message: z.string().trim().min(1, "message is required").max(2000, "message must be at most 2000 characters"),
  client_message_id: clientId,
  assist: z.enum(["hint", "solution"]).optional(),
  question_id: questionId.optional(),
});
const PageQuery = z.strictObject({ page, page_size: pageSize });
const MemoriesQuery = z.strictObject({ type: z.enum(["profile", "learning", "summary", "goal"]).optional(), page, page_size: pageSize });
const DeleteConversationQuery = z.strictObject({ keep_summary: bool });
const ClearQuery = z.strictObject({ conversations: bool });

const Track = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("question_solved"), question_id: questionId }),
  z.strictObject({ kind: z.literal("revision_completed"), question_id: questionId }),
  z.strictObject({ kind: z.literal("topic_practice"), topic: z.string().trim().min(1).max(60), target: z.number().int().min(1).max(50) }),
]);
const CreateMemory = z.strictObject({
  type: z.enum(["goal", "learning"]),
  content: z.string().trim().min(1).max(300),
  topic: z.string().trim().min(1).max(60).optional(),
  signal: z.enum(["understood", "difficult", "studied", "helpful"]).optional(),
  track: Track.optional(),
});
const PatchMemory = z
  .strictObject({
    content: z.string().trim().min(1).max(1200).optional(),
    topic: z.string().trim().max(60).nullable().optional(),
    status: z.enum(["active", "completed", "dismissed"]).optional(),
  })
  .refine((b) => b.content !== undefined || b.topic !== undefined || b.status !== undefined, { message: "Provide content, topic or status" });

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/** The AI mentor. Every route is authenticated; the owner is always the verified uid. Responses are never cached. */
export function mentorRouter(mentor: MentorService, chatLimiter: RequestHandler): Router {
  const router = Router();
  const noStore = { "Cache-Control": "no-store" };

  router.post("/mentor/chat", chatLimiter, async (req, res) => {
    const body = parse(ChatBody, req.body) as MentorChatRequest;
    res.set(noStore).json(await mentor.chat(uidOf(res), body));
  });

  router.get("/mentor/conversations", async (req, res) => {
    const q = parse(PageQuery, req.query);
    res.set(noStore).json(await mentor.listConversations(uidOf(res), q.page ?? 1, q.page_size ?? 20));
  });

  router.get("/mentor/conversations/:conversationId", async (req, res) => {
    res.set(noStore).json(await mentor.getConversation(uidOf(res), parse(convId, req.params.conversationId)));
  });

  router.post("/mentor/conversations/:conversationId/summary", async (req, res) => {
    res.set(noStore).json(await mentor.summarize(uidOf(res), parse(convId, req.params.conversationId)));
  });

  router.delete("/mentor/conversations/:conversationId", async (req, res) => {
    const q = parse(DeleteConversationQuery, req.query);
    await mentor.deleteConversation(uidOf(res), parse(convId, req.params.conversationId), q.keep_summary ?? false);
    res.status(204).end();
  });

  router.get("/mentor/memories", async (req, res) => {
    const q = parse(MemoriesQuery, req.query);
    res.set(noStore).json(await mentor.listMemories(uidOf(res), q.type as MemoryType | undefined, q.page ?? 1, q.page_size ?? 20));
  });

  router.post("/mentor/memories", async (req, res) => {
    res.set(noStore).status(200).json(await mentor.createMemory(uidOf(res), parse(CreateMemory, req.body)));
  });

  router.patch("/mentor/memories/:memoryId", async (req, res) => {
    res.set(noStore).json(await mentor.patchMemory(uidOf(res), parse(memId, req.params.memoryId), parse(PatchMemory, req.body)));
  });

  router.delete("/mentor/memories/:memoryId", async (req, res) => {
    await mentor.deleteMemory(uidOf(res), parse(memId, req.params.memoryId));
    res.status(204).end();
  });

  router.delete("/mentor/memories", async (req, res) => {
    const q = parse(ClearQuery, req.query);
    await mentor.clearMemories(uidOf(res), q.conversations ?? false);
    res.status(204).end();
  });

  router.get("/mentor/profile", async (_req, res) => {
    res.set(noStore).json(await mentor.getProfile(uidOf(res)));
  });

  router.put("/mentor/profile", async (req, res) => {
    res.set(noStore).json(await mentor.putProfile(uidOf(res), parse(ProfileInput, req.body) as MentorProfile));
  });

  return router;
}
