import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";
import { isValidYmd } from "../placement/dates.js";
import type { PlacementService } from "../placement/service.js";
import type { PlacementApplyChangeRequest, PlacementTaskActionRequest } from "../types.js";

const taskId = z.string().regex(/^t_[a-f0-9]{24}$/, "invalid task id");
const ymdString = z.string().refine(isValidYmd, "date must be a real date like 2026-12-01");

const GenerateBody = z.strictObject({ mode: z.enum(["default", "reduced"]).optional() });
const NoBody = z.strictObject({});
const ActionBody = z.strictObject({
  action: z.enum(["start", "complete", "postpone", "skip", "reschedule", "remove", "reopen"]),
  days: z.number().int().min(1).max(14).optional(),
  date: ymdString.optional(),
  reason: z.string().trim().min(3, "Give a reason of at least 3 characters").max(200).optional(),
});
const AssistantBody = z.strictObject({ message: z.string().trim().min(1, "Write a question").max(500) });
const ApplyBody = z.strictObject({
  change: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("lighter_day"), date: ymdString, max_minutes: z.number().int().min(0).max(480) }),
    z.strictObject({ kind: z.literal("postpone_day"), date: ymdString, days: z.number().int().min(1).max(14) }),
    z.strictObject({ kind: z.literal("set_daily_minutes"), minutes: z.number().int().min(15).max(480) }),
  ]),
});

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

const noStore = { "Cache-Control": "no-store" };

/** The unified placement planner. Every route needs a verified student; the owner is always the token's uid. */
export function placementRouter(placement: PlacementService, limiters: { refresh: RequestHandler; assistant: RequestHandler; action: RequestHandler }): Router {
  const router = Router();

  router.get("/placement/profile", async (_req, res) => {
    res.set(noStore).json(await placement.getProfile(uidOf(res)));
  });
  router.put("/placement/profile", limiters.action, async (req, res) => {
    res.set(noStore).json(await placement.putProfile(uidOf(res), req.body ?? {}));
  });
  router.get("/placement/dashboard", async (_req, res) => {
    res.set(noStore).json(await placement.dashboard(uidOf(res)));
  });
  router.post("/placement/refresh", limiters.refresh, async (req, res) => {
    parse(NoBody, req.body ?? {});
    res.set(noStore).json(await placement.refresh(uidOf(res)));
  });
  router.post("/placement/plan/generate", limiters.refresh, async (req, res) => {
    const b = parse(GenerateBody, req.body ?? {});
    res.set(noStore).json(await placement.generate(uidOf(res), b.mode ?? "default"));
  });
  router.post("/placement/tasks/:taskId/action", limiters.action, async (req, res) => {
    const id = parse(taskId, req.params.taskId);
    const b = parse(ActionBody, req.body ?? {});
    if (b.action === "reschedule" && !b.date) throw new ApiError("BAD_REQUEST", "Choose a date to move the task to.");
    if (b.action === "skip" && !b.reason) throw new ApiError("BAD_REQUEST", "Give a reason for skipping.");
    const body: PlacementTaskActionRequest = { action: b.action, ...(b.days !== undefined ? { days: b.days } : {}), ...(b.date ? { date: b.date } : {}), ...(b.reason ? { reason: b.reason } : {}) };
    res.set(noStore).json(await placement.taskAction(uidOf(res), id, body));
  });
  router.post("/placement/assistant", limiters.assistant, async (req, res) => {
    const b = parse(AssistantBody, req.body ?? {});
    res.set(noStore).json(await placement.assistant(uidOf(res), b.message));
  });
  router.post("/placement/changes/apply", limiters.action, async (req, res) => {
    const b = parse(ApplyBody, req.body ?? {});
    res.set(noStore).json(await placement.applyChange(uidOf(res), b.change as PlacementApplyChangeRequest["change"]));
  });
  router.delete("/placement/data", async (_req, res) => {
    await placement.deleteAll(uidOf(res));
    res.status(204).end();
  });
  return router;
}
