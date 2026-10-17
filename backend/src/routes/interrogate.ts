import { Router, type RequestHandler } from "express";
import type { InterrogateRequest, TurnResponse } from "../types.js";
import { validateBody } from "../middleware/validate.js";
import type { AssessmentService } from "../services/assessment.js";
import { InterrogateRequestSchema } from "../validation/requests.js";

/** One endpoint for assess + clarify + retest (see CONTRACT.md §5). */
export function interrogateRouter(service: AssessmentService, llmLimiter: RequestHandler): Router {
  return Router().post("/interrogate", llmLimiter, validateBody(InterrogateRequestSchema), async (req, res) => {
    const body: TurnResponse = await service.interrogate(req.body as InterrogateRequest);
    res.json(body);
  });
}
