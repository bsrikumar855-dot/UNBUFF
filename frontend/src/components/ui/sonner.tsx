import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

/**
 * shadcn/ui's Sonner toaster, themed for the product (light only: there is no dark theme, so the next-themes
 * dependency the registry version assumes is not used). Toasts confirm actions that have no other visible result.
 */
const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:rounded-md group-[.toaster]:border group-[.toaster]:border-foreground group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:shadow-float",
        description: "group-[.toast]:text-muted-foreground",
        actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
      },
    }}
    {...props}
  />
)

export { Toaster }
