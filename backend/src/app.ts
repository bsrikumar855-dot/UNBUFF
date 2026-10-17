import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { TokenVerifier } from "./auth/verifier.js";
import type { GithubService } from "./github/service.js";
import type { LabService } from "./graphqllab/service.js";
import type { MentorService } from "./mentor/service.js";
import type { AnalyticsService } from "./analytics/service.js";
import type { CodeService } from "./code/service.js";
import type { Catalogue } from "./dsa/catalogue.js";
import type { DsaProgressService } from "./dsa/progressService.js";
import type { Logger } from "./logger.js";
import type { LLMProvider } from "./llm/provider.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { createCodeLimiters, createGithubLimiters, createLabLimiters, createMentorLimiter, createRateLimiters, DEFAULT_RATE_LIMITS, type RateLimitOptions } from "./middleware/rateLimit.js";
import { claimsRouter } from "./routes/claims.js";
import { demoRouter } from "./routes/demo.js";
import { fixTaskRouter } from "./routes/fixTask.js";
import { healthRouter } from "./routes/health.js";
import { interrogateRouter } from "./routes/interrogate.js";
import { reportRouter } from "./routes/report.js";
import { rolesRouter } from "./routes/roles.js";
import { analyticsRouter } from "./routes/analytics.js";
import { githubCallbackRouter, githubRouter } from "./routes/github.js";
import { graphqlLabRouter } from "./routes/graphqlLab.js";
import { mentorRouter } from "./routes/mentor.js";
import { codePrivateRouter, codePublicRouter } from "./routes/code.js";
import { dsaCatalogueRouter, dsaProgressRouter } from "./routes/dsa.js";
import { sessionsRouter } from "./routes/sessions.js";
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
  /** The GraphQL Learning Lab: a controlled training API, curriculum, grading and per-student progress. */
  lab: LabService;
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
  api.use(healthRouter(deps.llm));
  api.use(rolesRouter(deps.roles));
  api.use(demoRouter(deps.demoReportJson)); // synthetic data only; public by design
  api.use(dsaCatalogueRouter(() => deps.catalogue)); // public, read-only catalogue
  api.use(codePublicRouter(deps.code)); // languages and the visible part of exercises
  const githubLimiters = createGithubLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS);
  api.use(githubCallbackRouter(deps.github, githubLimiters.callback)); // GitHub's redirect carries no bearer token; identified by one-time state
  // Everything below is private student data: a verified Firebase ID token is required.
  api.use(["/claims", "/interrogate", "/fix-task", "/report", "/sessions", "/me", "/code/run", "/code/submit", "/code/submissions", "/mentor", "/github", "/graphql-lab"], requireAuth(deps.verifier));
  api.use(sessionsRouter(deps.service));
  api.use(dsaProgressRouter(deps.dsaProgress));
  api.use(analyticsRouter(deps.analytics));
  api.use(githubRouter(deps.github, githubLimiters));
  api.use(graphqlLabRouter(deps.lab, createLabLimiters(deps.rateLimits ?? DEFAULT_RATE_LIMITS)));
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
