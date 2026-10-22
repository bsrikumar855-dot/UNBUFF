import { Router } from "express";
import type { SessionDetailResponse, SessionsResponse } from "../types.js";
import { uidOf } from "../middleware/auth.js";
import type { AssessmentService } from "../services/assessment.js";
import { parseSessionId } from "../validation/requests.js";

/** The caller's own session history, resuming one session, and deletion. Ownership is enforced in the service. */
export function sessionsRouter(service: AssessmentService): Router {
  const router = Router();
  router.get("/sessions", async (_req, res) => {
    const body: SessionsResponse = await service.listSessions(uidOf(res));
    res.set("Cache-Control", "no-store").json(body);
  });
  router.get("/sessions/:sessionId", async (req, res) => {
    const body: SessionDetailResponse = await service.getSession(uidOf(res), parseSessionId(req.params.sessionId));
    res.set("Cache-Control", "no-store").json(body);
  });
  router.delete("/sessions/:sessionId", async (req, res) => {
    await service.deleteSession(uidOf(res), parseSessionId(req.params.sessionId));
    res.status(204).end();
  });
  return router;
}
