import React, { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CardRadioOption<T extends string> {
  value: T;
  title: string;
  description: string;
}

interface CardRadioGroupProps<T extends string> {
  ariaLabel: string;
  options: CardRadioOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Accessible card-style radio group (WAI-ARIA radio pattern): arrow keys
 * move selection, Tab enters/exits the group at a single stop. Selected
 * state is always border + background + a check icon — never color alone.
 */
export function CardRadioGroup<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  className,
}: CardRadioGroupProps<T>) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});

  function focusOptionAt(index: number) {
    const option = options[(index + options.length) % options.length];
    if (option) refs.current[option.value]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusOptionAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOptionAt(index - 1);
    }
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("grid gap-3", className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[option.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === null && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "rounded-md border p-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary-soft"
                : "border-line hover:border-line-strong"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-primary">
                {option.title}
              </span>
              {selected && (
                <Check size={16} className="shrink-0 text-primary" aria-hidden="true" />
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
              {option.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
