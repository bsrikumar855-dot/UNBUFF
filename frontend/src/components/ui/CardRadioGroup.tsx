import React, { useRef } from "react";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CardRadioOption<T extends string> {
  value: T;
  title: string;
  description: string;
  icon?: LucideIcon;
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
              "group relative min-h-14 overflow-hidden rounded-2xl p-4 text-left backdrop-blur-sm transition-all duration-300 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.99]",
              selected
                ? "bg-[linear-gradient(135deg,rgba(244,168,156,0.55)_0%,rgba(255,255,255,0.7)_55%,rgba(240,96,78,0.28)_100%)] shadow-[inset_0_0_0_1.5px_rgba(201,54,42,0.6),inset_0_1px_0_rgba(255,255,255,0.95),0_16px_28px_-16px_rgba(201,54,42,0.6)]"
                : "bg-white/55 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),inset_0_1px_0_rgba(255,255,255,0.95),0_10px_22px_-18px_rgba(24,24,27,0.4)] hover:bg-white/80 hover:shadow-[inset_0_0_0_1px_rgba(201,54,42,0.28),inset_0_1px_0_rgba(255,255,255,0.95),0_14px_26px_-18px_rgba(201,54,42,0.45)]"
            )}
          >
            <div className="flex items-center gap-3">
              {option.icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-300",
                    selected
                      ? "bg-[linear-gradient(135deg,#f0604e_0%,#c9362a_100%)] text-white shadow-[0_8px_16px_-8px_rgba(201,54,42,0.8),inset_0_1px_0_rgba(255,255,255,0.4)]"
                      : "bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
                  )}
                >
                  <option.icon size={18} strokeWidth={1.75} />
                </span>
              )}
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink-primary">
                {option.title}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  selected
                    ? "bg-redline text-surface-50"
                    : "bg-white shadow-[inset_0_0_0_1.5px_rgba(24,24,27,0.25)]"
                )}
              >
                {selected && <Check size={12} strokeWidth={3} />}
              </span>
            </div>
            <p className={cn("mt-2 text-sm leading-relaxed text-ink-secondary", option.icon && "sm:pl-[3.25rem]")}>
              {option.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
