import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { LeetCodeService } from "../leetcode/service.js";
import { ApiError } from "../errors.js";
import { uidOf } from "../middleware/auth.js";
import { formatIssues } from "../middleware/validate.js";

const noStore = { "Cache-Control": "no-store" };

const LinkBody = z.strictObject({ profile: z.string().max(300, "That is too long to be a LeetCode username or profile address.") });
// The content is bounded again, in bytes, by the importer. This only stops absurd bodies early.
const ImportBody = z.strictObject({
  format: z.enum(["json", "csv"]),
  origin: z.enum(["manual", "file"]),
  content: z.string().max(90_000, "The data is too large."),
});
const ConfirmBody = ImportBody.extend({ content_hash: z.string().regex(/^[a-f0-9]{32}$/, "content_hash must come from the preview") });
const UnlinkQuery = z.strictObject({ mode: z.enum(["link", "all"]).default("link") });
const SnapshotId = z.string().regex(/^[a-f0-9]{32}$/, "invalid snapshot id");

function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ApiError("BAD_REQUEST", formatIssues(r.error));
  return r.data;
}

/**
 * LeetCode profile link and the student's own imported progress. Every route needs a verified student and the owner is
 * always the token's uid: no body, query or file can name another owner. LeetCode is contacted only by the optional
 * lookup, and only when the operator enabled it.
 */
export function leetcodeRouter(leetcode: LeetCodeService, limiters: { read: RequestHandler; write: RequestHandler }): Router {
  const router = Router();

  router.get("/leetcode/connection", limiters.read, async (_req, res) => {
    res.set(noStore).json({ connection: await leetcode.connection(uidOf(res)) });
  });
  router.put("/leetcode/connection", limiters.write, async (req, res) => {
    res.set(noStore).json(await leetcode.link(uidOf(res), parse(LinkBody, req.body ?? {}).profile));
  });
  router.delete("/leetcode/connection", limiters.write, async (req, res) => {
    res.set(noStore).json(await leetcode.unlink(uidOf(res), parse(UnlinkQuery, req.query).mode));
  });

  router.post("/leetcode/import/preview", limiters.write, async (req, res) => {
    res.set(noStore).json(await leetcode.preview(uidOf(res), parse(ImportBody, req.body ?? {})));
  });
  router.post("/leetcode/import/confirm", limiters.write, async (req, res) => {
    res.set(noStore).json(await leetcode.confirm(uidOf(res), parse(ConfirmBody, req.body ?? {})));
  });

  router.get("/leetcode/lookup", limiters.read, async (_req, res) => {
    res.set(noStore).json({ available: leetcode.lookupAvailable() });
  });
  router.post("/leetcode/lookup", limiters.write, async (_req, res) => {
    res.set(noStore).json(await leetcode.lookupAndStore(uidOf(res)));
  });

  router.get("/leetcode/insights", limiters.read, async (_req, res) => {
    res.set(noStore).json(await leetcode.insights(uidOf(res)));
  });
  router.get("/leetcode/import-history", limiters.read, async (_req, res) => {
    res.set(noStore).json(await leetcode.history(uidOf(res)));
  });
  router.delete("/leetcode/import-history/:id", limiters.write, async (req, res) => {
    await leetcode.deleteSnapshot(uidOf(res), parse(SnapshotId, req.params.id));
    res.set(noStore).status(204).end();
  });

  return router;
}
