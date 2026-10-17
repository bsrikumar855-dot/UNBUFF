import { claim } from "../helpers.js";

/**
 * Hand-computed example (weights: js .20, react .20, rest .15, css .15, a11y .10, testing .10, git .10)
 *   js       CL-001 defended 0.85                  → 0.85  ready
 *   react    CL-002 shaky 0.25, CL-003 shaky 0.60  → 0.60  ready (max)
 *   rest     CL-004 error                           → 0     unverified (not covered)
 *   css      CL-005 bluff                           → 0     needs_work
 *   testing  CL-006 honest_gap                      → 0     needs_work
 *   a11y, git: no claims                            →       blind_spot
 *   CL-007 skill_id null (deprioritized) defended   → ignored
 * readiness = round(100 × (0.20×0.85 + 0.20×0.60)) = round(29.0) = 29
 * coverage  = round(100 × (0.20 + 0.20 + 0.15 + 0.10)) = 65
 */
export const example = [
  claim("CL-001", "js_fundamentals", "defended", 0.85),
  claim("CL-002", "react_state", "shaky", 0.25, { levels_passed: 1 }),
  claim("CL-003", "react_state", "shaky", 0.6, { levels_passed: 2 }),
  claim("CL-004", "rest_apis", "error", 0),
  claim("CL-005", "responsive_css", "bluff", 0),
  claim("CL-006", "testing", "honest_gap", 0),
  claim("CL-007", null, "defended", 0.85),
];
