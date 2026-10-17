import React from "react";

interface ScoreBlockProps {
  readiness: number;
  coverage: number;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Readiness ring with a text equivalent, plus coverage. Both numbers come from the backend. */
export const ScoreBlock: React.FC<ScoreBlockProps> = ({ readiness, coverage }) => {
  const dash = (Math.max(0, Math.min(100, readiness)) / 100) * CIRCUMFERENCE;
  return (
    <section aria-labelledby="score-heading" className="rounded-lg border border-line bg-white p-5">
      <h2 id="score-heading" className="mb-4 text-lg font-semibold text-ink-primary">
        Score
      </h2>
      <div className="flex flex-wrap items-center gap-6">
        <svg
          width="128"
          height="128"
          viewBox="0 0 128 128"
          role="img"
          aria-label={`Readiness ${readiness} out of 100`}
        >
          <circle cx="64" cy="64" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth="12" />
          <circle
            cx="64"
            cy="64"
            r={RADIUS}
            fill="none"
            stroke="#4F46E5"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform="rotate(-90 64 64)"
          />
          <text x="64" y="70" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0F172A">
            {readiness}
          </text>
        </svg>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">Readiness</dt>
            <dd className="text-2xl font-bold text-ink-primary">{readiness} out of 100</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Role coverage</dt>
            <dd className="text-xl font-semibold text-ink-primary">{coverage}%</dd>
          </div>
        </dl>
      </div>
    </section>
  );
};
