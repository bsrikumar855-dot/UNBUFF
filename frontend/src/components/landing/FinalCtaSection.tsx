import React from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "@/lib/buttonClasses";
import { DemoReportButton } from "@/components/common/DemoReportButton";

export const FinalCtaSection: React.FC = () => {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="text-balance text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
          Find out what you can actually defend.
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link to="/setup" className={buttonClasses()}>
            Audit My Readiness
          </Link>
          <DemoReportButton variant="secondary" />
        </div>
      </div>
    </section>
  );
};
