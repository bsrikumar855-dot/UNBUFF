import type { SubmissionRecord } from "../code/submissionStore.js";

/**
 * The single rule for "this stored submission may feed analytics". The stored `analytics_status` is a claim made
 * when the submission was judged; this re-checks it against the evidence in the record itself, so an inflated or
 * inconsistent record (or one from an older version) can never raise a student's solved count.
 *
 * A submission is countable only if ALL of these hold:
 *  - it was marked "counted" when judged;
 *  - the suite was declared analytics-eligible (never a demonstration or fixture suite) and has a revision;
 *  - the operator had declared the execution service verified;
 *  - the provider was not a mock/test provider (unless the TEST-ONLY policy explicitly allowed it, recorded in the record);
 *  - every hidden test actually produced a provider result (judged_tests === total, total > 0);
 *  - the verdict is a real judging outcome (not judge_error) and agrees with the counts:
 *    accepted means every test passed; any other verdict means at least one failed test is identified.
 */
export function isCountable(r: SubmissionRecord): boolean {
  if (r.analytics_status !== "counted") return false;
  if (r.suite_eligible !== true || r.suite_license === "development_fixture") return false;
  if (r.provider_verified !== true) return false;
  if (r.provider_mock === true && r.mock_counting_allowed !== true) return false;
  if (typeof r.test_revision !== "string" || r.test_revision === "") return false;
  if (!Number.isInteger(r.total) || r.total < 1 || r.judged_tests !== r.total) return false;
  if (!Number.isInteger(r.passed) || r.passed < 0 || r.passed > r.total) return false;
  if (r.verdict === "judge_error") return false;
  if (r.verdict === "accepted") return r.passed === r.total && r.failed_test === null;
  return r.passed < r.total && r.failed_test !== null && r.failed_test >= 1 && r.failed_test <= r.total;
}
