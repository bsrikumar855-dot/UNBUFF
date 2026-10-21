import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** The curved glass surface shared by the navigation rail and the plan screens. */
export const GLASS =
  "rounded-[1.75rem] bg-white/55 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.07),inset_0_1px_0_rgba(255,255,255,0.95),0_16px_32px_-24px_rgba(24,24,27,0.35)] backdrop-blur-sm";

/** A smaller curved tile that sits inside a glass card. */
export const TILE =
  "rounded-2xl bg-white/60 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]";

/** A round icon, a serif title and one line of purpose: the head of every card. */
export const CardHead: React.FC<{
  icon: LucideIcon;
  id: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, id, title, sub, actions, className }) => (
  <div className={cn("mb-5 flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
    <span
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_6px_14px_-8px_rgba(24,24,27,0.35)]"
    >
      <Icon size={22} strokeWidth={1.75} />
    </span>
    <div className="min-w-0 flex-1">
      <h2
        id={id}
        className="serif text-heading font-medium leading-tight text-ink-primary"
      >
        {title}
      </h2>
      {sub && <p className="mt-0.5 text-sm leading-snug text-ink-secondary">{sub}</p>}
    </div>
    {actions}
  </div>
);

/** A titled region as a glass card: the screen's building block. The heading names the region for assistive technology. */
export const GlassCard: React.FC<{
  id: string;
  icon: LucideIcon;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ id, icon, title, sub, actions, children, className }) => (
  <section
    id={id}
    aria-labelledby={`${id}-title`}
    className={cn(GLASS, "p-5 sm:p-7", className)}
  >
    <CardHead icon={icon} id={`${id}-title`} title={title} sub={sub} actions={actions} />
    {children}
  </section>
);
