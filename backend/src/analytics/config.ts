/**
 * Every threshold the analytics and revision rules use. They are plain numbers so behaviour can be
 * tuned (or tested) without touching the algorithms, and nothing here is learned or AI-generated.
 */

export interface WeaknessConfig {
  /** Below either minimum a topic is reported as "insufficient data", never as weak or strong. */
  minQuestions: number; // distinct questions attempted in the topic
  minAttempts: number; // eligible submissions in the topic
  /** "weak": at least this many algorithmic failures AND a question solve rate at or below weakSolveRate. */
  minAlgorithmicFailures: number;
  weakSolveRate: number;
  /** "watch": at least this many algorithmic failures AND a solve rate below watchSolveRate. */
  watchAlgorithmicFailures: number;
  watchSolveRate: number;
  /** "strong": solve rate and submission accuracy both at or above these. */
  strongSolveRate: number;
  strongAccuracy: number;
  /** "technical_issues": compile/runtime failures at least this many and at least as many as algorithmic ones. */
  technicalMinFailures: number;
  /** A question is "repeatedly failed" after this many failures in a row since its last acceptance. */
  repeatedFailureThreshold: number;
  /** A solved question counts as a revision regression after this many failures since it was first solved. */
  regressionFailures: number;
  /** This many regressed questions in a topic make the topic "weak" (forgetting). */
  regressionQuestions: number;
  trendWindowDays: number;
  trendMinAttempts: number;
  trendDelta: number;
}

export interface MetricsConfig {
  /** Minimum sample before a percentage is shown. */
  minRateSample: number;
  minSolveRateSample: number;
  comparisonWindowDays: number;
  recentActivityLimit: number;
  maxEventsPerQuestion: number;
}

export interface RevisionConfig {
  /** Days until the next review for each stage; the last interval repeats. */
  intervalsDays: number[];
  postponeDays: number;
  maxPostponeDays: number;
  /** Hard cap on items per student; no new item is created beyond it. */
  maxItemsPerStudent: number;
  maxHistoryEvents: number;
  suggestionLimit: number;
}

export interface AnalyticsConfig {
  weakness: WeaknessConfig;
  metrics: MetricsConfig;
  revision: RevisionConfig;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  weakness: {
    minQuestions: 3,
    minAttempts: 5,
    minAlgorithmicFailures: 3,
    weakSolveRate: 0.5,
    watchAlgorithmicFailures: 2,
    watchSolveRate: 0.75,
    strongSolveRate: 0.75,
    strongAccuracy: 0.6,
    technicalMinFailures: 3,
    repeatedFailureThreshold: 3,
    regressionFailures: 2,
    regressionQuestions: 2,
    trendWindowDays: 14,
    trendMinAttempts: 3,
    trendDelta: 0.2,
  },
  metrics: {
    minRateSample: 5,
    minSolveRateSample: 3,
    comparisonWindowDays: 28,
    recentActivityLimit: 10,
    maxEventsPerQuestion: 50,
  },
  revision: {
    intervalsDays: [1, 3, 7, 14, 30],
    postponeDays: 2,
    maxPostponeDays: 14,
    maxItemsPerStudent: 200,
    maxHistoryEvents: 20,
    suggestionLimit: 5,
  },
};
