import React from "react";
import { buttonClasses, type ButtonVariant, type ButtonSize } from "@/lib/buttonClasses";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Primary interactive control. Action labels should be specific verbs
 * ("Start Interrogation", "Retest") rather than generic ones ("Submit").
 */
export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled}
      aria-disabled={disabled}
      {...props}
    />
  );
};
