import { Router, type RequestHandler } from "express";
import { uidOf } from "../middleware/auth.js";
import { parseSessionId } from "../validation/requests.js";
import type { Report } from "../types.js";
import type { AssessmentService } from "../services/assessment.js";

export function reportRouter(service: AssessmentService, llmLimiter: RequestHandler): Router {
  return Router().get("/report/:sessionId", llmLimiter, async (req, res) => {
    const body: Report = await service.report(uidOf(res), parseSessionId(req.params.sessionId));
    res.set("Cache-Control", "no-store").json(body);
  });
}
