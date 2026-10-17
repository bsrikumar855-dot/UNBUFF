import { readFileSync } from "node:fs";
import { z } from "zod";
import type { CodeExerciseResponse, CodeLanguageId } from "../types.js";
import { LANGUAGE_IDS } from "./languages.js";

/**
 * Grading data lives apart from the public question catalogue and is loaded only by the server.
 * Hidden tests are never part of any response: `publicExercise` copies just the visible parts.
 */

export const SUITE_LICENSES = ["own_work", "licensed", "permission_granted", "public_domain", "development_fixture"] as const;
export const DEFAULT_LIMITS = { cpu_time_seconds: 2, memory_mb: 128 } as const;

const text = z.string().max(20_000);
const testCase = z.strictObject({ input: text, expected_output: text.min(1) });
const idRe = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const SuiteSchema = z.strictObject({
  question_id: z.string().regex(idRe),
  revision: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  is_demonstration: z.boolean(),
  statement: z.string().trim().min(1).max(4000).nullable(),
  source: z.strictObject({
    name: z.string().trim().min(1).max(200),
    license_status: z.enum(SUITE_LICENSES),
    license_note: z.string().trim().min(1).max(1000),
  }),
  samples: z.array(testCase).max(5),
  tests: z.array(testCase).min(1).max(50),
  limits: z.strictObject({ cpu_time_seconds: z.number().min(0.5).max(15), memory_mb: z.number().min(16).max(512) }).default({ ...DEFAULT_LIMITS }),
  starter_code: z.partialRecord(z.enum(LANGUAGE_IDS), z.string().max(5000)).default({}),
});

export const SuiteFileSchema = z.strictObject({ schema_version: z.literal(1), suites: z.array(SuiteSchema).max(2000) });
export type Suite = z.infer<typeof SuiteSchema>;
export type SuiteFile = z.infer<typeof SuiteFileSchema>;

const MAX_FILE_BYTES = 5_000_000;

export function parseSuiteFile(raw: unknown): SuiteFile {
  const file = SuiteFileSchema.parse(raw);
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of file.suites) {
    if (seen.has(s.question_id)) problems.push(`duplicate suite for question "${s.question_id}"`);
    seen.add(s.question_id);
    // Hidden tests must be independent of what students can see.
    const visible = new Set(s.samples.map((x) => x.input));
    if (s.tests.every((t) => visible.has(t.input))) problems.push(`question "${s.question_id}": every hidden test is also a visible sample`);
    if (s.is_demonstration && s.source.license_status !== "development_fixture" && s.source.license_status !== "own_work") {
      problems.push(`question "${s.question_id}": a demonstration exercise must be own_work or development_fixture`);
    }
  }
  if (JSON.stringify(file).length > MAX_FILE_BYTES) problems.push("suite file is larger than 5 MB");
  if (problems.length > 0) throw new Error(`Invalid test-suite file: ${problems.join("; ")}`);
  return file;
}

export class SuiteRegistry {
  private readonly byQuestion = new Map<string, Suite>();

  constructor(file: SuiteFile | null) {
    for (const s of file?.suites ?? []) this.byQuestion.set(s.question_id, s);
  }

  static empty(): SuiteRegistry {
    return new SuiteRegistry(null);
  }

  static fromPath(path: string): SuiteRegistry {
    return new SuiteRegistry(parseSuiteFile(JSON.parse(readFileSync(path, "utf8"))));
  }

  /** Server-only. Never return this (or any part of `tests`) to a client. */
  suite(questionId: string): Suite | null {
    return this.byQuestion.get(questionId) ?? null;
  }

  /** The visible projection: samples, starter code, limits and only the COUNT of hidden tests. */
  publicExercise(questionId: string): CodeExerciseResponse {
    const s = this.byQuestion.get(questionId);
    if (!s) {
      return {
        question_id: questionId,
        statement: null,
        is_demonstration: false,
        samples: [],
        starter_code: {},
        gradable: false,
        hidden_test_count: 0,
        test_revision: null,
        limits: { ...DEFAULT_LIMITS, cpu_time_seconds: DEFAULT_LIMITS.cpu_time_seconds, memory_mb: DEFAULT_LIMITS.memory_mb },
      };
    }
    return {
      question_id: s.question_id,
      statement: s.statement,
      is_demonstration: s.is_demonstration,
      samples: s.samples.map((x) => ({ input: x.input, expected_output: x.expected_output })),
      starter_code: { ...(s.starter_code as Partial<Record<CodeLanguageId, string>>) },
      gradable: true,
      hidden_test_count: s.tests.length,
      test_revision: s.revision,
      limits: { ...s.limits },
    };
  }

  size(): number {
    return this.byQuestion.size;
  }
}
