import { Router, type RequestHandler } from "express";
import type { ClaimsResponse, ConfirmRequest, ExtractRequest } from "../types.js";
import { validateBody } from "../middleware/validate.js";
import type { AssessmentService } from "../services/assessment.js";
import { ConfirmRequestSchema, ExtractRequestSchema } from "../validation/requests.js";

export function claimsRouter(service: AssessmentService, llmLimiter: RequestHandler): Router {
  const router = Router();
  router.post("/claims/extract", llmLimiter, validateBody(ExtractRequestSchema), async (req, res) => {
    const body: ClaimsResponse = await service.extract(req.body as ExtractRequest);
    res.json(body);
  });
  router.post("/claims/confirm", validateBody(ConfirmRequestSchema), async (req, res) => {
    const { session_id, claims } = req.body as ConfirmRequest;
    const body: ClaimsResponse = await service.confirm(session_id, claims);
    res.json(body);
  });
  return router;
}
