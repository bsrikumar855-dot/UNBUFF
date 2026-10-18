import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React, { useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { Enter } from "@/components/motion/Enter";
import { GrowBar } from "@/components/motion/GrowBar";
import { CheckMark, Strike, Swap } from "@/components/motion/Marks";
import { RuleDraw } from "@/components/motion/RuleDraw";
import { ScanReveal } from "@/components/motion/ScanReveal";
import { Thinking } from "@/components/motion/Thinking";
import { DUR, MAX_STAGGER, STAGGER, stepDelay } from "@/components/motion/tokens";
import { useNewIds } from "@/components/motion/useNewIds";
import { useSeen } from "@/components/motion/useSeen";
import { VerdictKey } from "@/components/landing/VerdictKey";
import { PageHeader, Section } from "@/components/ui/Page";
import { isPlainClick, startRouteTransition } from "@/lib/viewTransition";

/**
 * jsdom cannot animate, so these tests prove what matters most about a motion layer: content is never held back, the
 * numbers are the real numbers, state changes are reflected, and the rules that keep motion cheap (the stagger cap, one
 * shared scroll check, no replay of old items) hold.
 */

describe("the motion scale", () => {
  it("caps staggering so a long list is not slow, and keeps durations in order", () => {
    expect(stepDelay(0)).toBe(0);
    expect(stepDelay(3)).toBeCloseTo(3 * STAGGER.base, 10);
    expect(stepDelay(40)).toBeCloseTo(MAX_STAGGER * STAGGER.base, 10);
    expect(stepDelay(-2)).toBe(0);
    expect(DUR.instant).toBeLessThan(DUR.fast);
    expect(DUR.fast).toBeLessThan(DUR.base);
    expect(DUR.base).toBeLessThan(DUR.slow);
    expect(DUR.slow).toBeLessThan(DUR.hero);
    expect(MAX_STAGGER * STAGGER.base + DUR.base).toBeLessThan(0.75); // the last row is in well under a second
  });
});

describe("content is never held back where motion cannot run", () => {
  it("Enter, RuleDraw, ScanReveal and the page frame render their content immediately", () => {
    render(
      <MemoryRouter>
        <PageHeader eyebrow="Plan" title="Career" description="About this page" actions={<button type="button">Act</button>} />
        <Section title="A section" index="01">
          <Enter as="p" index={5}>
            Rising text
          </Enter>
          <ScanReveal>
            <p>Scanned content</p>
          </ScanReveal>
          <RuleDraw />
        </Section>
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Career" })).toBeVisible();
    expect(screen.getByText("About this page")).toBeVisible();
    expect(screen.getByRole("button", { name: "Act" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "A section" })).toBeVisible();
    expect(screen.getByText("Rising text")).toBeVisible();
    expect(screen.getByText("Scanned content")).toBeVisible();
    for (const el of [screen.getByText("Rising text"), screen.getByText("Scanned content")]) expect(el.closest("[style*='opacity: 0']")).toBeNull();
  });

  it("Enter passes through accessible roles and labels", () => {
    render(
      <Enter role="region" aria-label="Results" aria-live="polite" data-slug="x">
        Hello
      </Enter>
    );
    const r = screen.getByRole("region", { name: "Results" });
    expect(r).toHaveAttribute("aria-live", "polite");
    expect(r).toHaveAttribute("data-slug", "x");
  });
});

describe("bars show real values", () => {
  it("GrowBar sits at its value, clamps nonsense, and follows a change", () => {
    const { rerender, container } = render(<GrowBar value={0.4} barClassName="bar" />);
    const bar = () => container.querySelector(".bar") as HTMLElement;
    expect(bar().style.transform).toBe("scaleX(0.4)");
    rerender(<GrowBar value={0.9} barClassName="bar" />);
    expect(bar().style.transform).toBe("scaleX(0.9)");
    rerender(<GrowBar value={7} barClassName="bar" />);
    expect(bar().style.transform).toBe("scaleX(1)");
    rerender(<GrowBar value={Number.NaN} barClassName="bar" />);
    expect(bar().style.transform).toBe("scaleX(0)");
    rerender(<GrowBar value={-1} axis="y" barClassName="bar" />);
    expect(bar().style.transform).toBe("scaleY(0)");
  });
});

describe("feedback marks", () => {
  it("Strike keeps the text as text and reflects done and not done", () => {
    const { rerender, container } = render(<Strike on={false}>Write the tests</Strike>);
    const line = () => container.querySelector("span[aria-hidden='true']") as HTMLElement;
    expect(screen.getByText("Write the tests")).toBeInTheDocument();
    expect(line().style.transform).toBe("scaleX(0)");
    rerender(<Strike on>Write the tests</Strike>);
    expect(line().style.transform).toBe("scaleX(1)");
    expect(screen.getByText("Write the tests").className).toContain("text-ink-muted");
  });

  it("CheckMark and Swap are decorative wrappers that never hide their children", () => {
    const { container } = render(
      <div>
        <CheckMark />
        <Swap state="a">
          <span>icon</span>
        </Swap>
      </div>
    );
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("icon")).toBeVisible();
  });

  it("Thinking is an announced status that carries its message as text", () => {
    render(<Thinking message="The mentor is thinking…" />);
    expect(screen.getByRole("status")).toHaveTextContent("The mentor is thinking…");
  });
});

describe("useNewIds: only what arrives later animates", () => {
  const Probe: React.FC<{ ids: string[]; scope: string; ready?: boolean }> = ({ ids, scope, ready = true }) => {
    const isNew = useNewIds(ids, scope, ready);
    return <p data-testid="out">{ids.map((i) => `${i}:${isNew(i) ? "new" : "old"}`).join(",")}</p>;
  };
  const out = () => screen.getByTestId("out").textContent;

  it("treats the first list as old, later additions as new, and resets for another conversation", () => {
    const { rerender } = render(<Probe ids={["a", "b"]} scope="1" />);
    expect(out()).toBe("a:old,b:old");
    rerender(<Probe ids={["a", "b", "c"]} scope="1" />);
    expect(out()).toBe("a:old,b:old,c:new");
    rerender(<Probe ids={["x", "y"]} scope="2" />);
    expect(out()).toBe("x:old,y:old");
    rerender(<Probe ids={["x", "y", "z"]} scope="2" />);
    expect(out()).toBe("x:old,y:old,z:new");
  });

  it("waits for a loading list and starts empty lists as 'everything later is new'", () => {
    const { rerender } = render(<Probe ids={[]} scope="1" ready={false} />);
    expect(out()).toBe("");
    rerender(<Probe ids={["a", "b"]} scope="1" ready />);
    expect(out()).toBe("a:old,b:old");
    const fresh = render(<Probe ids={[]} scope="9" />);
    fresh.rerender(<Probe ids={["first"]} scope="9" />);
    expect(fresh.getAllByTestId("out").at(-1)!.textContent).toBe("first:new");
  });
});

describe("useSeen: an element is seen when it is on screen or has been scrolled past", () => {
  const realObserver = window.IntersectionObserver;
  afterEach(() => {
    window.IntersectionObserver = realObserver;
    vi.restoreAllMocks();
  });

  const rect = (top: number) => ({ top, bottom: top + 50, left: 0, right: 100, width: 100, height: 50, x: 0, y: top, toJSON: () => ({}) });
  const Probe: React.FC<{ top: { value: number } }> = ({ top }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const seen = useSeen(ref as React.RefObject<Element>);
    return (
      <div
        ref={(el) => {
          ref.current = el;
          if (el) el.getBoundingClientRect = () => rect(top.value) as DOMRect;
        }}
        data-testid="probe"
      >
        {seen ? "seen" : "waiting"}
      </div>
    );
  };

  // A working observer (not the inert test stub) switches the product's motion on, which is what this checks.
  // Frames are queued and flushed by hand, because useSeen deliberately batches its work into one animation frame.
  let frames: FrameRequestCallback[] = [];
  const flush = () =>
    act(() => {
      const run = frames;
      frames = [];
      run.forEach((cb) => cb(0));
    });
  const enable = () => {
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  };

  it("is true at once where the page cannot animate (the test environment)", () => {
    render(<Probe top={{ value: 5000 }} />);
    expect(screen.getByTestId("probe")).toHaveTextContent("seen");
  });

  it("waits while below the fold, then is seen on scroll, and also when an element was jumped over", () => {
    enable();
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const below = { value: 2000 };
    render(<Probe top={below} />);
    flush();
    expect(screen.getByTestId("probe")).toHaveTextContent("waiting");
    fireEvent.scroll(window);
    flush();
    expect(screen.getByTestId("probe")).toHaveTextContent("waiting"); // still below the bottom edge
    below.value = 700; // scrolled into view
    fireEvent.scroll(window);
    flush();
    expect(screen.getByTestId("probe")).toHaveTextContent("seen");
  });

  it("marks an element seen even if the student jumped past it without it ever being on screen", () => {
    enable();
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    const jumped = { value: 3000 };
    render(<Probe top={jumped} />);
    flush();
    expect(screen.getByTestId("probe")).toHaveTextContent("waiting");
    jumped.value = -1800; // End key: far above the viewport, and never "intersected"
    fireEvent.scroll(window);
    flush();
    expect(screen.getByTestId("probe")).toHaveTextContent("seen");
  });
});

describe("the landing page's verdict key", () => {
  it("is the product's own scoring rules, selectable by mouse and by arrow keys", () => {
    render(<VerdictKey />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    ["Defended", "Shaky", "Bluff", "Honest"].forEach((label, i) => expect(radios[i]?.textContent).toMatch(new RegExp(`^${label}`)));
    expect(screen.getByRole("radio", { name: /Shaky/ })).toBeChecked();
    expect(screen.getByText(/passed one or two of the three levels/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Defended/ }));
    expect(screen.getByText(/passed all three levels/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing to fix/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("radio", { name: /Defended/ }), { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: /Shaky/ })).toBeChecked();
    fireEvent.keyDown(screen.getByRole("radio", { name: /Shaky/ }), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("radio", { name: /Defended/ }), { key: "ArrowUp" });
    expect(screen.getByRole("radio", { name: /Honest gap/ })).toBeChecked();
    expect(screen.getByText(/said you had not used it/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Honest gap/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Bluff/ })).toHaveAttribute("tabindex", "-1");
  });
});

describe("route transitions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
  });

  it("just navigates where the browser has no View Transitions", () => {
    const run = vi.fn();
    startRouteTransition(run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("applies the navigation inside the transition, so the destination is never delayed", () => {
    const calls: string[] = [];
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition = (cb) => {
      calls.push("start");
      cb();
      calls.push("after");
    };
    startRouteTransition(() => calls.push("navigate"));
    expect(calls).toEqual(["start", "navigate", "after"]);
  });

  it("skips the transition when the student asked for reduced motion", () => {
    const start = vi.fn();
    (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    window.matchMedia = ((q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia;
    const run = vi.fn();
    startRouteTransition(run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("only treats a plain left click as an in-app navigation", () => {
    const e = (over: Partial<React.MouseEvent>) => ({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over }) as React.MouseEvent;
    expect(isPlainClick(e({}))).toBe(true);
    for (const over of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) expect(isPlainClick(e(over))).toBe(false);
  });
});
