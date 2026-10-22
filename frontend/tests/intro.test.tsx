import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MotionConfig, LazyMotion } from "motion/react";
import { IntroLoader } from "@/components/common/IntroLoader";
import features from "@/components/motion/features";

const wrap = (ui: React.ReactElement) => (
  <MotionConfig reducedMotion="never">
    <LazyMotion features={features} strict>
      {ui}
    </LazyMotion>
  </MotionConfig>
);

const setReducedMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));

describe("the opening screen", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setReducedMotion(false);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.documentElement.style.overflow = "";
  });

  it("plays once per session as an announced status, and stops the page scrolling while it covers it", () => {
    render(wrap(<IntroLoader />));
    expect(screen.getByRole("status", { name: "Loading UNBLUFF" })).toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("can be skipped with a click, remembers that it was seen, and gives the scroll back", async () => {
    render(wrap(<IntroLoader />));
    fireEvent.click(screen.getByRole("status", { name: "Loading UNBLUFF" }));
    expect(window.sessionStorage.getItem("unbluff_intro_seen")).toBe("1");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("can be skipped from the keyboard", () => {
    render(wrap(<IntroLoader />));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(window.sessionStorage.getItem("unbluff_intro_seen")).toBe("1");
  });

  it("leaves by itself after its minimum time once the page is ready", async () => {
    vi.useFakeTimers();
    render(wrap(<IntroLoader />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });
    expect(window.sessionStorage.getItem("unbluff_intro_seen")).toBe("1");
  });

  it("is not shown again in the same session", () => {
    window.sessionStorage.setItem("unbluff_intro_seen", "1");
    render(wrap(<IntroLoader />));
    expect(screen.queryByRole("status", { name: "Loading UNBLUFF" })).not.toBeInTheDocument();
  });

  it("is not shown at all to people who ask for reduced motion", () => {
    setReducedMotion(true);
    render(wrap(<IntroLoader />));
    expect(screen.queryByRole("status", { name: "Loading UNBLUFF" })).not.toBeInTheDocument();
  });
});
