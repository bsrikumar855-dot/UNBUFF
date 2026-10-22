import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { TokenVerifier } from "./auth/verifier.js";
import type { GithubService } from "./github/service.js";
import type { PlacementService } from "./placement/service.js";
import type { MentorService } from "./mentor/service.js";
import type { AnalyticsService } from "./analytics/service.js";
import type { CodeService } from "./code/service.js";
import type { Catalogue } from "./dsa/catalogue.js";
import type { DsaProgressService } from "./dsa/progressService.js";
import type { Logger } from "./logger.js";
import type { LLMProvider } from "./llm/provider.js";
import { requireAuth, requireVerifiedEmail } from "./middleware/auth.js";
import { requireLlmBudget, type LlmBudget } from "./security/budget.js";
import type { RevocationGuard } from "./security/revocation.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { createAccountLimiters, createCareerLimiters, createCodeLimiters, createGithubLimiters, createLeetcodeLimiters, createLearnLimiters, createMentorLimiter, createResumeLimiters, createPlacementLimiters, createRateLimiters, DEFAULT_RATE_LIMITS, type RateLimitOptions } from "./middleware/rateLimit.js";
import { accountRouter } from "./routes/account.js";
import { claimsRouter } from "./routes/claims.js";
import { demoRouter } from "./routes/demo.js";
import { fixTaskRouter } from "./routes/fixTask.js";
import { healthRouter } from "./routes/health.js";
import { interrogateRouter } from "./routes/interrogate.js";
import { reportRouter } from "./routes/report.js";
import { rolesRouter } from "./routes/roles.js";
import { analyticsRouter } from "./routes/analytics.js";
import { githubCallbackRouter, githubRouter } from "./routes/github.js";
import { placementRouter } from "./routes/placement.js";
import { mentorRouter } from "./routes/mentor.js";
import { codePrivateRouter, codePublicRouter } from "./routes/code.js";
import { dsaCatalogueRouter, dsaProgressRouter } from "./routes/dsa.js";
import { sessionsRouter } from "./routes/sessions.js";
import { careerRouter } from "./routes/career.js";
import type { CareerService } from "./careers/service.js";
import { leetcodeRouter } from "./routes/leetcode.js";
import { resumeRouter } from "./routes/resume.js";
import { learnPrivateRouter, learnPublicRouter } from "./routes/learn.js";
import type { LearnService } from "./learn/service.js";
import type { ResumeService } from "./resume/service.js";
import type { LeetCodeService } from "./leetcode/service.js";
import type { AccountService } from "./account/service.js";
import type { AssessmentService } from "./services/assessment.js";
import type { RoleRegistry } from "./services/roles.js";

export interface AppDeps {
  service: AssessmentService;
  roles: RoleRegistry;
  verifier: TokenVerifier;
  /** Public DSA catalogue (read-only reference data). */
  catalogue: Catalogue;
  /** Authenticated students' personal DSA progress. */
  dsaProgress: DsaProgressService;
  /** Code execution and judging. Student code only ever runs in the external execution service. */
  code: CodeService;
  /** DSA analytics and the revision queue (derived from counted judged submissions). */
  analytics: AnalyticsService;
  /** The AI mentor: conversations and persistent, student-controlled memory. */
  mentor: MentorService;
  /** GitHub contribution insights (read-only, public data). Disconnected and harmless when the OAuth app is not configured. */
  github: GithubService;
  /** Unified placement intelligence: profile, evidence, skills, plan, tasks and the plan assistant. */
  placement: PlacementService;
  /** Job discovery from Freehire's public API, deterministic matching, and the private bookmark and application tracker. */
  career: CareerService;
  /** A saved LeetCode username and progress the student imports themselves. Never contacts LeetCode: there is no official API and scraping is forbidden. */
  leetcode: LeetCodeService;
  resume: ResumeService;
  /** DSA patterns and DBMS topics: public content, and per-student progress. */
  learn: LearnService;
  /** The student's profile, full data export and delete-everything. */
  account: AccountService;
  /** Daily per-student language-model budget. The provider handed to the services must already be wrapped with it. */
  budget: LlmBudget;
  /** Refuses revoked tokens (deleted/disabled account, signed out everywhere, password changed). Null in tests. */
  revocation?: RevocationGuard | null;
  /** Private routes other than the account ones need a verified email (default true). */
  requireEmailVerification?: boolean;
  /** Report the model name on /api/health (default false; production keeps it private). */
  exposeModel?: boolean;
  llm: LLMProvider;
  logger: Logger;
  demoReportJson: string;
  corsOrigin?: string;
  /** Reverse-proxy hops to trust for req.ip (default 1; 0 disables). */
  trustProxy?: number;
  rateLimits?: RateLimitOptions;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", deps.trustProxy ?? 1); // Hops in front of the app (Cloud Run/Render: 1); needed for per-IP rate limits.

  const origin = deps.corsOrigin ?? "*";
  app.use(helmet());
  app.use(cors({ origin: origin === "*" ? "*" : origin.split(",").map((o) => o.trim()) }));
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    const started = performance.now();
    res.on("finish", () => {
      deps.logger.info(
        { method: req.method, path: req.path, status: res.statusCode, ms: Math.round(performance.now() - started) },
        "request",
      );
    });
    next();
  });

  const limiters = createRateLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS);
  const api = express.Router();
  api.use(limiters.global);
  api.use(healthRouter(deps.llm, { exposeModel: deps.exposeModel ?? false }));
  api.use(rolesRouter(deps.roles));
  api.use(demoRouter(deps.demoReportJson)); // synthetic data only; public by design
  api.use(dsaCatalogueRouter(() => deps.catalogue)); // public, read-only catalogue
  api.use(codePublicRouter(deps.code)); // languages and the visible part of exercises
  api.use(learnPublicRouter(deps.learn)); // patterns and DBMS topics: static content, no student data
  const githubLimiters = createGithubLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS);
  api.use(githubCallbackRouter(deps.github, githubLimiters.callback)); // GitHub's redirect carries no bearer token; identified by one-time state
  // Everything below is private student data, so it is private by default: a verified Firebase ID token is required for
  // any request that no public router above answered. A route added later is therefore protected unless someone
  // deliberately mounts it above this line (and the route audit test lists it as public).
  api.use(requireAuth(deps.verifier, { revocation: deps.revocation ?? null, logger: deps.logger }));
  // The account routes stay reachable before the email is verified, so a student can always see, export or delete their data.
  api.use(accountRouter(deps.account, createAccountLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS), deps.budget));
  if (deps.requireEmailVerification ?? true) api.use(requireVerifiedEmail(deps.logger));
  // Model-backed routes: a per-student rate limit on top of the per-IP one, and a fast refusal once today's budget is used.
  // (The budget itself is enforced per model call by the provider wrapper; interview turns and the report rely on that
  // alone, so resuming an open question or reading a report still works when the allowance is used up.)
  const llmGuards = [limiters.llmUser, requireLlmBudget(deps.budget)];
  api.post(["/claims/extract", "/fix-task", "/mentor/chat", "/mentor/conversations/:conversationId/summary", "/placement/assistant"], llmGuards);
  api.post("/interrogate", limiters.llmUser);
  api.use(sessionsRouter(deps.service));
  api.use(dsaProgressRouter(deps.dsaProgress));
  api.use(analyticsRouter(deps.analytics));
  api.use(githubRouter(deps.github, githubLimiters));
  api.use(placementRouter(deps.placement, createPlacementLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(careerRouter(deps.career, createCareerLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(leetcodeRouter(deps.leetcode, createLeetcodeLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(learnPrivateRouter(deps.learn, createLearnLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(resumeRouter(deps.resume, createResumeLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(mentorRouter(deps.mentor, createMentorLimiter(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(codePrivateRouter(deps.code, createCodeLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
  api.use(claimsRouter(deps.service, limiters.llm));
  api.use(interrogateRouter(deps.service, limiters.llm));
  api.use(fixTaskRouter(deps.service, limiters.llm));
  api.use(reportRouter(deps.service, limiters.llm));
  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}
