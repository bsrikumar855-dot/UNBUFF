import { Router, type RequestHandler } from "express";
import type { FixTaskRequest, FixTaskResponse } from "../types.js";
import { uidOf } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import type { AssessmentService } from "../services/assessment.js";
import { FixTaskRequestSchema } from "../validation/requests.js";

export function fixTaskRouter(service: AssessmentService, llmLimiter: RequestHandler): Router {
  const router = Router();
  router.post("/fix-task", llmLimiter, validateBody(FixTaskRequestSchema), async (req, res) => {
    const { session_id, claim_id } = req.body as FixTaskRequest;
    const body: FixTaskResponse = await service.fixTask(uidOf(res), session_id, claim_id);
    res.json(body);
  });
  // Teach me: a short lesson on the claim's skill, shown before the first question.
  router.post("/primer", llmLimiter, validateBody(FixTaskRequestSchema), async (req, res) => {
    const { session_id, claim_id } = req.body as FixTaskRequest;
    res.json(await service.primer(uidOf(res), session_id, claim_id));
  });
  return router;
}
