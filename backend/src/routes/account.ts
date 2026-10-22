import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { AccountService } from "../account/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import type { LlmBudget } from "../security/budget.js";

const noStore = { "Cache-Control": "no-store" };

/** Deleting everything is irreversible, so the request must carry this exact phrase (the UI asks the student to type it). */
export const DELETE_CONFIRMATION = "DELETE MY DATA";
const DeleteBody = z.strictObject({ confirm: z.literal(DELETE_CONFIRMATION) });

/** The caller's profile, AI usage, signing out everywhere, data export and delete-everything. Every route needs a verified student; the owner is the token's uid. */
export function accountRouter(account: AccountService, limiters: { write: RequestHandler; bulk: RequestHandler }, budget: LlmBudget): Router {
  const router = Router();
  router.get("/me/usage", async (_req, res) => {
    res.set(noStore).json(await budget.status(uidOf(res)));
  });
  /** Ends every session of this student on every device (this one included): their tokens stop working within a minute. */
  router.post("/me/sign-out-everywhere", limiters.bulk, async (_req, res) => {
    await account.revokeSessions(uidOf(res));
    res.status(204).end();
  });
  router.get("/me/profile", async (_req, res) => {
    res.set(noStore).json(await account.getProfile(uidOf(res)));
  });
  router.put("/me/profile", limiters.write, async (req, res) => {
    res.set(noStore).json(await account.saveProfile(uidOf(res), req.body ?? {}));
  });
  router.get("/me/export", limiters.bulk, async (_req, res) => {
    const body = await account.exportData(uidOf(res));
    res
      .set(noStore)
      .set("Content-Disposition", `attachment; filename="unbluff-export-${body.exported_at.slice(0, 10)}.json"`)
      .json(body);
  });
  router.delete("/me", limiters.bulk, async (req, res) => {
    if (!DeleteBody.safeParse(req.body ?? {}).success) {
      throw new ApiError("BAD_REQUEST", `To delete everything, send {"confirm": "${DELETE_CONFIRMATION}"}`);
    }
    res.set(noStore).json(await account.deleteAll(uidOf(res)));
  });
  return router;
}
