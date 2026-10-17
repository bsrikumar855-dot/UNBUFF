import React from "react";

export const EvidenceSection: React.FC = () => {
  return (
    <section className="border-t border-line bg-white px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-balance text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
          A technology on your resume isn&rsquo;t proof. Your explanation is.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-secondary">
          UNBLUFF doesn&rsquo;t check whether a skill is listed — it checks whether you
          can defend it under questioning, with evidence pulled directly from your own
          answers.
        </p>
      </div>
    </section>
  );
};
