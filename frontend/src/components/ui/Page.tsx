import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

const WIDTH = {
  /** Reading and forms. */
  narrow: "max-w-3xl",
  /** Most screens. */
  default: "max-w-6xl",
  /** Data-dense workspaces. */
  wide: "max-w-[88rem]",
} as const;

/** The content frame every screen uses: one width strategy, one gutter, one vertical rhythm. */
export const Page: React.FC<{
  children: React.ReactNode;
  width?: keyof typeof WIDTH;
  className?: string;
}> = ({ children, width = "default", className }) => (
  <div
    className={cn("mx-auto w-full px-4 py-8 sm:px-8 sm:py-10", WIDTH[width], className)}
  >
    {children}
  </div>
);

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * The top of a screen: breadcrumb (only where orientation helps), a serif page title, one sentence of purpose,
 * and the screen's primary actions on the right. Exactly one h1 per page.
 */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: string;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, eyebrow, crumbs, actions, className }) => (
  <header className={cn("mb-8 border-b border-line pb-6", className)}>
    {crumbs && crumbs.length > 0 && (
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
              {c.to ? (
                <Link
                  to={c.to}
                  className="underline-offset-4 hover:text-ink-primary hover:underline"
                >
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    )}
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2 text-redline">{eyebrow}</p>}
        <h1 className="serif text-title font-medium text-ink-primary">{title}</h1>
        {description && (
          <p className="mt-3 leading-relaxed text-ink-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  </header>
);

/** A titled region of a screen. A hairline above, an optional mono index, an h2. */
export const Section: React.FC<{
  title: React.ReactNode;
  index?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}> = ({ title, index, description, actions, children, className, id }) => {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      id={id}
      className={cn("border-t border-ink-primary pt-4", className)}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {index && <p className="eyebrow mb-1">{index}</p>}
          <h2 id={headingId} className="text-heading font-semibold text-ink-primary">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-secondary">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
};
