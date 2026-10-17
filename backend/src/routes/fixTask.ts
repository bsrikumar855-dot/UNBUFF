import { Router, type RequestHandler } from "express";
import type { FixTaskRequest, FixTaskResponse } from "../types.js";
import { validateBody } from "../middleware/validate.js";
import type { AssessmentService } from "../services/assessment.js";
import { FixTaskRequestSchema } from "../validation/requests.js";

export function fixTaskRouter(service: AssessmentService, llmLimiter: RequestHandler): Router {
  return Router().post("/fix-task", llmLimiter, validateBody(FixTaskRequestSchema), async (req, res) => {
    const { session_id, claim_id } = req.body as FixTaskRequest;
    const body: FixTaskResponse = await service.fixTask(session_id, claim_id);
    res.json(body);
  });
}
