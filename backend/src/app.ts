import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Logger } from "./logger.js";
import type { LLMProvider } from "./llm/provider.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { createRateLimiters, DEFAULT_RATE_LIMITS, type RateLimitOptions } from "./middleware/rateLimit.js";
import { claimsRouter } from "./routes/claims.js";
import { demoRouter } from "./routes/demo.js";
import { fixTaskRouter } from "./routes/fixTask.js";
import { healthRouter } from "./routes/health.js";
import { interrogateRouter } from "./routes/interrogate.js";
import { reportRouter } from "./routes/report.js";
import { rolesRouter } from "./routes/roles.js";
import type { AssessmentService } from "./services/assessment.js";
import type { RoleRegistry } from "./services/roles.js";

export interface AppDeps {
  service: AssessmentService;
  roles: RoleRegistry;
  llm: LLMProvider;
  logger: Logger;
  demoReportJson: string;
  corsOrigin?: string;
  rateLimits?: RateLimitOptions;
}

/** Builds the Express app without listening, so tests can drive it with supertest. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Cloud Run sits behind one proxy; needed for per-IP rate limits.

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
  api.use(claimsRouter(deps.service, limiters.llm));
  api.use(interrogateRouter(deps.service, limiters.llm));
  api.use(fixTaskRouter(deps.service, limiters.llm));
  api.use(reportRouter(deps.service, limiters.llm));
  api.use(demoRouter(deps.demoReportJson));
  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}
