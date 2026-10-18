import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/endpoints";
import { FRESHNESS_LABEL, formatDay } from "@/lib/leetcode";
import { routes } from "@/lib/routes";
import type { LeetCodeInsightsResponse } from "@/types/contract";

/**
 * LeetCode numbers the student imported, shown on the DSA analytics page as external context only. It sits apart from
 * the judged statistics above it and is never added to them. It renders nothing when nothing was imported or the data
 * cannot be read: analytics must work exactly as before.
 */
export const ExternalProgressNote: React.FC = () => {
  const [data, setData] = useState<LeetCodeInsightsResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => api.getLeetCodeInsights())
      .then((r) => !cancelled && setData(r))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!data?.available || !data.totals || !data.source) return null;
  return (
    <section
      aria-labelledby="external-progress-h"
      className="mt-12 border-t border-line-strong pt-4"
    >
      <h2
        id="external-progress-h"
        className="mb-1 text-sm font-semibold text-ink-primary"
      >
        External progress (not counted above)
      </h2>
      <p className="text-sm text-ink-secondary">
        You reported{" "}
        <span className="num font-medium text-ink-primary">{data.totals.solved}</span>{" "}
        problems solved on LeetCode, as of {formatDay(data.source.captured_at)} (
        {FRESHNESS_LABEL[data.source.freshness].toLowerCase()}). You imported these
        numbers yourself: they are not live or verified, and they are not judged UNBLUFF
        submissions, so they do not appear in the figures, acceptance rates or revision
        queue on this page.{" "}
        <Link
          to={routes.leetcode}
          className="underline underline-offset-4 hover:text-redline"
        >
          LeetCode insights
        </Link>
      </p>
    </section>
  );
};
