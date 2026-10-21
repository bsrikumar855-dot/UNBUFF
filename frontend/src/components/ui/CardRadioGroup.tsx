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
              "min-h-14 rounded-2xl p-4 text-left transition-colors",
              selected
                ? "bg-redline-soft/60 shadow-[inset_0_0_0_1.5px_rgba(179,41,26,0.55)]"
                : "bg-white/60 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.1)] hover:bg-white"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-primary">
                {option.title}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full",
                  selected
                    ? "bg-redline text-surface-50"
                    : "bg-white shadow-[inset_0_0_0_1.5px_rgba(24,24,27,0.25)]"
                )}
              >
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
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
