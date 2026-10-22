import type { RequestHandler } from "express";
import { ApiError } from "../errors.js";
import type { LLMProvider } from "../llm/provider.js";
import type { Logger } from "../logger.js";
import { uidOf } from "../middleware/auth.js";
import type { UsageResponse } from "../types.js";
import { audit } from "./audit.js";
import { currentUid } from "./context.js";
import type { UsageStore } from "./usageStore.js";

const utcDay = (d: Date) => d.toISOString().slice(0, 10);
const nextUtcMidnight = (d: Date) => {
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return n.toISOString();
};

/** A student's daily language-model budget (UTC day). One unit is one model call, however the request reached it. */
export class LlmBudget {
  private readonly now: () => Date;

  constructor(
    private readonly deps: { store: UsageStore; limit: number; logger: Logger; now?: () => Date },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  get limit(): number {
    return this.deps.limit;
  }

  async status(uid: string): Promise<UsageResponse> {
    const now = this.now();
    return { date: utcDay(now), used: await this.deps.store.get(uid, utcDay(now)), limit: this.deps.limit, resets_at: nextUtcMidnight(now) };
  }

  /** Counts one call, or refuses it once the day's budget is used. */
  async charge(uid: string): Promise<void> {
    const now = this.now();
    const r = await this.deps.store.charge(uid, utcDay(now), this.deps.limit);
    if (!r.allowed) {
      audit(this.deps.logger, "llm.daily_limit_reached", uid, { limit: this.deps.limit });
      throw limitReached(now);
    }
  }

  /** Refuses up front when nothing is left, so a request does no work it cannot finish. Does not count anything. */
  async assertAvailable(uid: string): Promise<void> {
    const now = this.now();
    if ((await this.deps.store.get(uid, utcDay(now))) >= this.deps.limit) throw limitReached(now);
  }
}

function limitReached(now: Date): ApiError {
  const resets = new Date(nextUtcMidnight(now));
  const hours = Math.max(1, Math.ceil((resets.getTime() - now.getTime()) / 3_600_000));
  return new ApiError("DAILY_LIMIT_REACHED", `You've used today's AI allowance. It resets in about ${hours} hour${hours === 1 ? "" : "s"}.`);
}

/** Route guard for endpoints whose whole purpose is a model call (mount after requireAuth). */
export function requireLlmBudget(budget: LlmBudget): RequestHandler {
  return async (_req, res, next) => {
    try {
      await budget.assertAvailable(uidOf(res));
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Wraps a provider so every model call made while serving a signed-in request is charged to that student first. Calls
 * outside a request (none today) are let through and logged, so a future background job cannot silently bypass it.
 */
export function budgetedProvider(inner: LLMProvider, budget: LlmBudget, logger: Logger): LLMProvider {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const uid = currentUid();
        if (uid) await budget.charge(uid);
        else logger.warn({ method: String(prop) }, "language-model call outside a signed-in request: not charged to any budget");
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}
