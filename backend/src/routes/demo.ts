import { Router } from "express";

/** Serves data/demo_report.json verbatim (pre-serialized once at startup). */
export function demoRouter(demoReportJson: string): Router {
  return Router().get("/demo/report", (_req, res) => {
    res.type("application/json").set("Cache-Control", "public, max-age=300").send(demoReportJson);
  });
}
