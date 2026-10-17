import type { Catalogue } from "../dsa/catalogue.js";
import { parseSuiteFile, type SuiteFile } from "./suites.js";

/**
 * Merges authorized test-suite content into the server-side suites file. Nothing is fetched: the operator
 * supplies a file and states its licence/permission. Suites are keyed by question id; re-importing the
 * same content changes nothing, and importing different content for a question requires a new revision.
 */

export interface SuiteImportReport {
  added: string[];
  updated: string[];
  unchanged: string[];
  changed: boolean;
}

const stable = (f: SuiteFile): SuiteFile => ({ ...f, suites: [...f.suites].sort((a, b) => a.question_id.localeCompare(b.question_id)) });
export const serializeSuites = (f: SuiteFile): string => `${JSON.stringify(stable(f), null, 2)}\n`;

export function mergeSuites(
  existing: SuiteFile | null,
  incomingRaw: unknown,
  opts: { catalogue?: Catalogue; allowFixture?: boolean } = {},
): { file: SuiteFile; report: SuiteImportReport } {
  const incoming = parseSuiteFile(incomingRaw);
  const problems: string[] = [];
  for (const s of incoming.suites) {
    if (s.source.license_status === "development_fixture" && !opts.allowFixture) {
      problems.push(`question "${s.question_id}": development_fixture content cannot be imported as real test data`);
    }
    if (opts.catalogue && !opts.catalogue.hasQuestion(s.question_id)) problems.push(`question "${s.question_id}" is not in the catalogue`);
  }
  const bySuite = new Map((existing?.suites ?? []).map((s) => [s.question_id, s]));
  const report: SuiteImportReport = { added: [], updated: [], unchanged: [], changed: false };
  for (const s of incoming.suites) {
    const prior = bySuite.get(s.question_id);
    if (!prior) {
      report.added.push(s.question_id);
    } else if (JSON.stringify(prior) === JSON.stringify(s)) {
      report.unchanged.push(s.question_id);
      continue;
    } else if (prior.revision === s.revision) {
      problems.push(`question "${s.question_id}": content changed but revision "${s.revision}" did not; bump the revision`);
    } else {
      report.updated.push(s.question_id);
    }
    bySuite.set(s.question_id, s);
  }
  if (problems.length > 0) throw new Error(`Test-suite import rejected: ${problems.join("; ")}`);
  report.changed = report.added.length + report.updated.length > 0;
  return { file: parseSuiteFile({ schema_version: 1, suites: [...bySuite.values()] }), report };
}
