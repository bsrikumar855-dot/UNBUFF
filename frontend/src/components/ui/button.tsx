import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  // One button recipe for the product. Targets are 40px tall (touch), the focus ring is the 2px redline outline
  // from the global stylesheet, and pressing nudges the control down one pixel.
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,color,border-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The one main action of a view: ink on paper. Never red: red means "marked wrong" in this product.
        default: "bg-primary text-primary-foreground hover:bg-redline-dark",
        destructive: "bg-destructive text-destructive-foreground hover:bg-redline-dark",
        outline: "border border-input bg-card text-foreground hover:border-foreground hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-ink-secondary hover:bg-accent hover:text-foreground",
        link: "h-auto rounded-none p-0 text-redline underline decoration-redline/40 underline-offset-4 hover:decoration-redline",
      },
      size: {
        default: "min-h-10 px-4 py-2",
        sm: "min-h-8 px-3 py-1 text-sm",
        lg: "min-h-12 px-7 text-base",
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
