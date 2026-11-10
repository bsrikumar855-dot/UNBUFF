import React from "react";
import { TriangleAlert } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/Page";
import { GLASS } from "@/components/ui/GlassCard";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL } from "@/lib/legal";

export const LegalSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="mt-7">
    <h2 className="serif text-heading font-medium text-ink-primary">{title}</h2>
    <div className="mt-2 flex flex-col gap-2.5 text-sm leading-relaxed text-ink-secondary">
      {children}
    </div>
  </section>
);

export const LegalList: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc space-y-1.5 pl-5">
    {items.map((i, n) => (
      <li key={n}>{i}</li>
    ))}
  </ul>
);

export const ContactLine: React.FC = () =>
  CONTACT_EMAIL ? (
    <a
      className="text-redline underline underline-offset-4"
      href={`mailto:${CONTACT_EMAIL}`}
    >
      {CONTACT_EMAIL}
    </a>
  ) : (
    <span className="rounded bg-redline-soft px-1.5 py-0.5 text-redline-dark">
      [contact email: set VITE_CONTACT_EMAIL before launch]
    </span>
  );

/** A legal page: title, effective date, a draft notice until counsel has reviewed it, then the sections. */
export const LegalDoc: React.FC<{
  title: string;
  intro: string;
  updated: string;
  children: React.ReactNode;
}> = ({ title, intro, updated, children }) => (
  <Page width="narrow">
    <PageHeader eyebrow="Legal" title={title} description={intro} />
    <p className="mb-4 text-xs text-ink-muted">Last updated {updated}</p>
    <div
      role="note"
      className={cn(GLASS, "mb-2 flex gap-3 p-4 text-sm text-ink-secondary")}
    >
      <TriangleAlert
        size={18}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-redline"
      />
      <p>
        <strong className="text-ink-primary">Draft for legal review.</strong> This
        describes how UNBLUFF works today. It has not yet been reviewed by a lawyer, and
        the operator should confirm it (and the contact details) before a public launch.
      </p>
    </div>
    {children}
  </Page>
);
