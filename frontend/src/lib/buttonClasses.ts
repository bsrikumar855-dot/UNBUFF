import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark disabled:bg-line-strong",
  secondary:
    "bg-white text-ink-primary border border-line-strong hover:bg-surface-100 disabled:text-ink-subtle",
  ghost: "text-ink-secondary hover:bg-surface-100 disabled:text-ink-subtle",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2.5 text-sm",
};

/**
 * Shared visual classes so a non-<button> element (e.g. a router Link acting
 * as a navigation action) can look like a button without nesting a real
 * <button> inside an <a> — nesting two interactive elements breaks keyboard
 * and screen-reader semantics.
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium",
    "transition-[background-color,color,transform] duration-150 disabled:cursor-not-allowed",
    "active:scale-[0.98]",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className
  );
}
