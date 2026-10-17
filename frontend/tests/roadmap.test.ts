import { describe, expect, it } from "vitest";
import type { Report } from "@/types/contract";
import { buildRoadmap } from "@/lib/buildRoadmap";
import demoReport from "@/mocks/report.json";

describe("buildRoadmap", () => {
  it("builds 4 weeks: priorities, remaining weak claims, blind spots, coming-soon simulation", () => {
    const report = demoReport as unknown as Report;
    const weeks = buildRoadmap(report);
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);

    // Week 1 = priorities, with the root cause when the weakest claim has one.
    expect(weeks[0]!.items.map((i) => i.title)).toEqual(["React State & Rendering", "Accessibility", "Testing & Debugging"]);
    expect(weeks[0]!.items[0]).toMatchObject({ verdict: "shaky", rootCause: "Reconciliation" });
    expect(weeks[0]!.items[1]).toMatchObject({ verdict: null, state: "blind_spot" });

    // Week 2 = weak claims not already prioritised, with their missing concepts.
    const prioritised = new Set(report.priorities.map((p) => p.claim_id));
    const expectedWeak = report.claims.filter((c) => ["shaky", "bluff", "honest_gap"].includes(c.verdict) && !prioritised.has(c.id));
    expect(weeks[1]!.items.map((i) => i.title)).toEqual(expectedWeak.map((c) => c.text));
    expect(weeks[1]!.items.every((i) => i.verdict !== null && i.detail.length > 0)).toBe(true);

    // Week 3 = blind spots; week 4 = two coming-soon items.
    expect(weeks[2]!.items.map((i) => i.title)).toEqual(report.blind_spots.map((b) => b.name));
    expect(weeks[3]!.items.map((i) => [i.title, i.comingSoon])).toEqual([
      ["Company-specific practice", true],
      ["Full mock interview", true],
    ]);
  });
});
