import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  // One button recipe for the product: a pill with a soft curve. Targets are 40px tall (touch) and the focus ring is the
  // 2px redline outline from the global stylesheet. On hover the control lifts a pixel and brightens; pressing squeezes
  // it in a little, on a spring-like ease. Both movements are dropped under reduced motion.
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,color,box-shadow,transform,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 motion-safe:active:scale-[0.97] motion-safe:active:duration-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The main action of a view: red glass, lit from the top.
        default: "bg-[linear-gradient(135deg,#f0604e_0%,#c9362a_100%)] text-white shadow-[0_10px_20px_-10px_rgba(201,54,42,0.65),inset_0_1px_0_rgba(255,255,255,0.4)] hover:brightness-110 hover:shadow-[0_14px_26px_-10px_rgba(201,54,42,0.75),inset_0_1px_0_rgba(255,255,255,0.5)]",
        // Deleting or discarding: dark, so it is never mistaken for the main (red) action.
        destructive: "bg-[linear-gradient(135deg,#4a1510_0%,#1f0806_100%)] text-white shadow-[0_10px_20px_-12px_rgba(31,8,6,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-125",
        outline: "bg-white/60 text-foreground shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md hover:bg-white/85 hover:shadow-[inset_0_0_0_1px_rgba(24,24,27,0.18),inset_0_1px_0_rgba(255,255,255,0.95),0_8px_18px_-12px_rgba(24,24,27,0.4)]",
        secondary: "bg-redline-soft text-redline-dark shadow-[inset_0_0_0_1px_rgba(179,41,26,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] hover:bg-[#f0d3cc]",
        ghost: "text-ink-secondary hover:bg-white/60 hover:text-foreground hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
        link: "h-auto rounded-none p-0 text-redline underline decoration-redline/40 underline-offset-4 hover:decoration-redline motion-safe:hover:translate-y-0 motion-safe:active:scale-100",
      },
      size: {
        default: "min-h-10 px-5 py-2",
        sm: "min-h-8 px-4 py-1 text-sm",
        lg: "min-h-12 px-8 text-base",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
