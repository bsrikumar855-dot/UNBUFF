import React from "react";
import { Link } from "react-router-dom";
import { buttonClasses } from "@/lib/buttonClasses";
import { DemoReportButton } from "@/components/common/DemoReportButton";
import { ProductPreviewCard } from "./ProductPreviewCard";

export const HeroSection: React.FC = () => {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
        <div className="motion-safe:animate-fade-up">
          <p className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-primary">
            Interview readiness audit
          </p>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-ink-primary sm:text-5xl lg:text-6xl">
            Your resume says you&rsquo;re ready. Let&rsquo;s prove it.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-secondary">
            A resume can list technologies and projects without proving you can
            actually explain or defend them. UNBLUFF interrogates each claim until
            it&rsquo;s clear whether you can.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/setup" className={buttonClasses()}>
              Audit My Readiness
            </Link>
            <DemoReportButton variant="secondary" />
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ProductPreviewCard />
        </div>
      </div>
    </section>
  );
};
