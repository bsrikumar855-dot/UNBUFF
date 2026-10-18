import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT = { primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive", link: "link" } as const;
const SIZE = { sm: "sm", md: "default", lg: "lg", icon: "icon" } as const;

/**
 * The shadcn/ui button recipe as a class string, so a non-<button> element (a router Link acting as a navigation
 * action) can look like a button without nesting a real <button> inside an <a>: nesting two interactive elements
 * breaks keyboard and screen-reader semantics.
 */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(buttonVariants({ variant: VARIANT[variant], size: SIZE[size] }), className);
}
