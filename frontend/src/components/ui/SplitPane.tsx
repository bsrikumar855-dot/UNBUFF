import React, { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Two panes with a draggable, keyboard-operable divider (WAI-ARIA window splitter). The divider and the sizing apply
 * from the `lg` breakpoint up; below that the panes simply stack in normal flow, because a drag handle is the wrong
 * tool on a phone.
 * The ratio lives in memory only: the app keeps nothing in browser storage except a signed-in student's code drafts.
 */
export const SplitPane: React.FC<{
  /** "row" puts the panes side by side, "column" stacks them (at lg and up). */
  direction: "row" | "column";
  first: React.ReactNode;
  second: React.ReactNode;
  /** Initial share of the first pane, 0 to 1. */
  initial?: number;
  min?: number;
  max?: number;
  label: string;
  className?: string;
  firstClassName?: string;
  secondClassName?: string;
}> = ({
  direction,
  first,
  second,
  initial = 0.4,
  min = 0.2,
  max = 0.8,
  label,
  className,
  firstClassName,
  secondClassName,
}) => {
  const box = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(initial);
  const clamp = useCallback((r: number) => Math.min(max, Math.max(min, r)), [min, max]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = box.current;
    if (!el) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const next =
        direction === "row"
          ? (ev.clientX - r.left) / r.width
          : (ev.clientY - r.top) / r.height;
      setRatio(clamp(next));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dec = direction === "row" ? "ArrowLeft" : "ArrowUp";
    const inc = direction === "row" ? "ArrowRight" : "ArrowDown";
    if (e.key === dec) setRatio((r) => clamp(r - 0.03));
    else if (e.key === inc) setRatio((r) => clamp(r + 0.03));
    else if (e.key === "Home") setRatio(min);
    else if (e.key === "End") setRatio(max);
    else if (e.key === "Enter") setRatio(initial);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={box}
      style={{ ["--split" as string]: `${(ratio * 100).toFixed(2)}%` }}
      className={cn(
        "flex min-h-0 flex-col lg:flex-1",
        direction === "row" ? "lg:flex-row" : "lg:flex-col",
        className
      )}
    >
      <div
        className={cn(
          "min-h-0 min-w-0 lg:shrink-0 lg:grow-0 lg:basis-(--split)",
          firstClassName
        )}
      >
        {first}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation={direction === "row" ? "vertical" : "horizontal"}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={cn(
          "group relative hidden shrink-0 touch-none bg-line transition-colors hover:bg-redline focus-visible:bg-redline lg:block",
          direction === "row" ? "w-px cursor-col-resize" : "h-px cursor-row-resize"
        )}
      >
        {/* a wider invisible grab area around the 1px rule */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute",
            direction === "row" ? "-inset-x-1.5 inset-y-0" : "-inset-y-1.5 inset-x-0"
          )}
        />
      </div>
      <div className={cn("min-h-0 min-w-0 lg:flex-1", secondClassName)}>{second}</div>
    </div>
  );
};
