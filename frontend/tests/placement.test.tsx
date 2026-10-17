import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import type {
  PlacementAssistantResponse,
  PlacementDashboard,
  PlacementProfile,
  PlacementProfileResponse,
  PlacementTask,
  SkillAssessment,
} from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getPlacementProfile: vi.fn(),
    putPlacementProfile: vi.fn(),
    getPlacementDashboard: vi.fn(),
    refreshPlacement: vi.fn(),
    generatePlacementPlan: vi.fn(),
    placementTaskAction: vi.fn(),
    placementAssistant: vi.fn(),
    applyPlacementChange: vi.fn(),
    deletePlacementData: vi.fn(),
    getHealth: vi.fn(),
    getRoles: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const user: AuthUser = { uid: "u1", email: "a@b.co" };
const fakeAuth = (u: AuthUser | null): AuthClient => ({
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb(u));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => (u ? "t" : null)),
});
const renderPage = (u: AuthUser | null = user) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={["/placement"]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

const profile: PlacementProfile = {
  role_ids: ["frontend_developer"],
  target_companies: [],
  placement_date: "2026-07-15",
  available_weekdays: [1, 2, 3, 4, 5],
  daily_minutes: 90,
  preferred_language: "python",
  experience_level: "intermediate",
  strengths: [],
  weak_areas: [],
  priorities: ["dsa", "interview"],
};
const profileResponse = (
  over: Partial<PlacementProfileResponse> = {}
): PlacementProfileResponse => ({
  profile: null,
  updated_at: null,
  suggestions: null,
  roles: [
    {
      id: "frontend_developer",
      name: "Frontend Developer",
      description: "d",
      skill_count: 7,
    },
  ],
  topics: ["Arrays", "Graphs"],
  ...over,
});

const task = (over: Partial<PlacementTask> = {}): PlacementTask => ({
  id: `t_${"a".repeat(24)}`,
  type: "diagnostic",
  title: "First measurement, Arrays: Pair Sum",
  description: 'Solve "Pair Sum" (easy) so that Arrays has a first judged result.',
  skill_area: "dsa:Arrays",
  priority: 2,
  estimated_minutes: 25,
  due_date: "2026-06-15",
  original_due_date: "2026-06-15",
  link: "/dsa/questions/q1/code",
  ref: { kind: "question", id: "q1" },
  completion_criteria: "Submit a solution that the judge accepts or rejects.",
  completion_check: "verified_event",
  evidence_source: "rule:diagnostic_unassessed_topic",
  reason:
    "There is no verified result for Arrays yet, so one question gives a first measurement.",
  reason_codes: ["diagnostic_insufficient_evidence"],
  depends_on: [],
  blocked: false,
  status: "planned",
  postponed_count: 0,
  skip_reason: null,
  completed_at: null,
  completed_by: null,
  student_scheduled: false,
  created_at: "2026-06-15T09:00:00.000Z",
  updated_at: "2026-06-15T09:00:00.000Z",
  history: [],
  ...over,
});

const skill = (over: Partial<SkillAssessment> = {}): SkillAssessment => ({
  area: "dsa:Arrays",
  label: "DSA: Arrays",
  category: "dsa",
  status: "unassessed",
  estimate: null,
  evidence: {
    kind: "none",
    provenance: "unavailable",
    count: 0,
    unit: "judged submissions",
    last_at: null,
    recency: "none",
  },
  confidence: "none",
  gaps: [],
  self_reported: null,
  next_assessment: {
    type: "diagnostic",
    description: "Solve one Arrays question to get a first measurement.",
  },
  note: "No judged attempts yet.",
  ...over,
});

const dash = (over: Partial<PlacementDashboard> = {}): PlacementDashboard => ({
  generated_at: "2026-06-15T09:00:00.000Z",
  today: "2026-06-15",
  needs_profile: false,
  profile,
  plan: {
    generation: 1,
    generated_at: "2026-06-15T09:00:00.000Z",
    days_until_placement: 30,
    feasibility: {
      status: "ok",
      required_minutes: 25,
      available_minutes: 1980,
      message:
        "The most important work needs about 0.4 h and you have about 33 h before 2026-07-15.",
      reduced: false,
      deferred_task_ids: [],
    },
  },
  today_tasks: [task()],
  today_minutes: 25,
  today_capacity_minutes: 90,
  week: Array.from({ length: 7 }, (_v, i) => ({
    date: `2026-06-${15 + i}`,
    weekday: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ][i]!,
    available: i < 5,
    capacity_minutes: i < 5 ? 90 : 0,
    planned_minutes: i === 0 ? 25 : 0,
    completed_minutes: 0,
    tasks: i === 0 ? [task()] : [],
  })),
  counts: { planned: 1, in_progress: 0, completed: 0, skipped: 0 },
  outstanding_priorities: [task()],
  skills: {
    generated_at: "x",
    skills: [
      skill(),
      skill({
        area: "dsa:Graphs",
        label: "DSA: Graphs",
        status: "strong",
        estimate: 0.8,
        confidence: "medium",
        evidence: {
          kind: "dsa_judged",
          provenance: "verified",
          count: 8,
          unit: "judged submissions",
          last_at: "2026-06-12T00:00:00.000Z",
          recency: "recent",
        },
        self_reported: "You listed this as a weak area",
        next_assessment: null,
        note: null,
      }),
    ],
    coverage: {
      in_scope: 2,
      sufficient_evidence: 1,
      provisional: 0,
      unassessed: 1,
      definition:
        "The number of skill areas with at least medium evidence confidence. It describes how much has been measured, not how well you are doing.",
    },
    limitations: [],
    method: ["There is no overall readiness score and no offer probability."],
  },
  history: {
    recent_completed: [],
    changes: [
      {
        at: "2026-06-15T09:00:00.000Z",
        kind: "plan_generated",
        summary: "Your plan was created",
        reason: "Based on your goals, availability and the results recorded so far.",
        task_id: null,
      },
    ],
    improvements: [],
    repeated_difficulties: [],
    revision: { due: 0, items: 0 },
  },
  readiness: {
    sufficient_evidence: ["DSA: Graphs"],
    weak: [],
    unassessed: ["DSA: Arrays"],
    next_diagnostics: [
      {
        area: "DSA: Arrays",
        description: "Solve one Arrays question to get a first measurement.",
      },
    ],
    note: "Readiness here means how much has been measured per skill. There is no overall score and no probability of an offer.",
  },
  limitations: [
    {
      source: "github",
      severity: "info",
      message:
        "GitHub is not connected. It is optional: connecting adds project context, and not connecting costs you nothing.",
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getPlacementProfile.mockResolvedValue(profileResponse({ profile }));
  mocked.refreshPlacement.mockResolvedValue(dash());
  mocked.getPlacementDashboard.mockResolvedValue(dash());
});

describe("placement: goals", () => {
  it("starts with the goals form for a new student and saves exactly what was entered, then builds the plan", async () => {
    mocked.getPlacementProfile.mockResolvedValue(
      profileResponse({ suggestions: { preferred_language: "java", daily_minutes: 75 } })
    );
    mocked.refreshPlacement
      .mockResolvedValueOnce(
        dash({ needs_profile: true, profile: null, plan: null, today_tasks: [] })
      )
      .mockResolvedValue(dash());
    mocked.putPlacementProfile.mockResolvedValue(profileResponse({ profile }));
    renderPage();
    expect(
      await screen.findByRole("heading", {
        name: "Start with your goals and availability",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your AI mentor remembers that you prefer java and about 75 minutes a day/
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use these" }));
    expect((screen.getByLabelText("Preferred language") as HTMLSelectElement).value).toBe(
      "java"
    );
    expect(
      (screen.getByLabelText("Study minutes on each available day") as HTMLInputElement)
        .value
    ).toBe("75");
    expect(mocked.putPlacementProfile).not.toHaveBeenCalled(); // suggestions are never applied silently
    fireEvent.click(screen.getByLabelText("Frontend Developer"));
    fireEvent.change(screen.getByLabelText(/Placement or interview date/), {
      target: { value: "2026-07-15" },
    });
    fireEvent.change(screen.getByLabelText(/Topics you find hard/), {
      target: { value: "Graphs, Arrays" },
    });
    fireEvent.click(screen.getByLabelText("HR and communication"));
    fireEvent.click(screen.getByRole("button", { name: "Save goals and availability" }));
    await waitFor(() => expect(mocked.putPlacementProfile).toHaveBeenCalledTimes(1));
    expect(mocked.putPlacementProfile.mock.calls[0]![0]).toEqual({
      role_ids: ["frontend_developer"],
      target_companies: [],
      placement_date: "2026-07-15",
      available_weekdays: [1, 2, 3, 4, 5],
      daily_minutes: 75,
      preferred_language: "java",
      experience_level: null,
      strengths: [],
      weak_areas: ["Graphs", "Arrays"],
      priorities: ["dsa", "interview", "communication"],
    });
    expect(
      await screen.findByRole("heading", { name: "Today's plan" })
    ).toBeInTheDocument();
  });

  it("shows the server's validation message and keeps the form", async () => {
    mocked.getPlacementProfile.mockResolvedValue(profileResponse());
    mocked.refreshPlacement.mockResolvedValue(
      dash({ needs_profile: true, profile: null, plan: null, today_tasks: [] })
    );
    mocked.putPlacementProfile.mockRejectedValue(
      new ApiError("The placement date must be today or later.", "BAD_REQUEST", 400)
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save goals and availability" })
    );
    expect(
      await screen.findByText("The placement date must be today or later.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Placement goals and availability" })
    ).toBeInTheDocument();
  });

  it("lets a student edit goals later", async () => {
    mocked.putPlacementProfile.mockResolvedValue(
      profileResponse({ profile: { ...profile, daily_minutes: 45 } })
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit goals" }));
    expect(
      await screen.findByRole("heading", { name: "Edit your goals and availability" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Study minutes on each available day"), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save goals and availability" }));
    await waitFor(() =>
      expect(mocked.putPlacementProfile.mock.calls[0]![0].daily_minutes).toBe(45)
    );
    expect(
      await screen.findByRole("heading", { name: "Today's plan" })
    ).toBeInTheDocument();
  });
});

describe("placement: today and the week", () => {
  it("shows each task with why it is suggested, how it completes and its link", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "First measurement, Arrays: Pair Sum" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/There is no verified result for Arrays yet/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Done when: Submit a solution that the judge accepts or rejects\. \(checked automatically from your records\)/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("25 min planned of 1.5 h available today (2026-06-15).", {
        exact: false,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/dsa/questions/q1/code"
    );
  });

  it("runs the task actions through the server and refreshes from its answer", async () => {
    mocked.placementTaskAction.mockResolvedValue(task());
    renderPage();
    const t = task();
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(mocked.placementTaskAction).toHaveBeenLastCalledWith(t.id, {
        action: "start",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() =>
      expect(mocked.placementTaskAction).toHaveBeenLastCalledWith(t.id, {
        action: "complete",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Postpone a day" }));
    await waitFor(() =>
      expect(mocked.placementTaskAction).toHaveBeenLastCalledWith(t.id, {
        action: "postpone",
        days: 1,
      })
    );
    expect(mocked.refreshPlacement.mock.calls.length).toBeGreaterThanOrEqual(4); // once on load, once after each action
  });

  it("moves a task to a chosen date and skips only with a reason", async () => {
    mocked.placementTaskAction.mockResolvedValue(task());
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Move…" }));
    fireEvent.change(screen.getByLabelText("Move to"), {
      target: { value: "2026-06-24" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move task" }));
    await waitFor(() =>
      expect(mocked.placementTaskAction).toHaveBeenLastCalledWith(task().id, {
        action: "reschedule",
        date: "2026-06-24",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip…" }));
    expect(screen.getByRole("button", { name: "Skip task" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Why skip it?"), { target: { value: "ab" } });
    expect(screen.getByRole("button", { name: "Skip task" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Why skip it?"), {
      target: { value: "Already know it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip task" }));
    await waitFor(() =>
      expect(mocked.placementTaskAction).toHaveBeenLastCalledWith(task().id, {
        action: "skip",
        reason: "Already know it",
      })
    );
  });

  it("does not offer to start or complete a task that waits for an earlier one", async () => {
    const blocked = task({ blocked: true, depends_on: ["t_x"] });
    mocked.refreshPlacement.mockResolvedValue(dash({ today_tasks: [blocked] }));
    renderPage();
    expect(
      await screen.findByText(/Waits for an earlier task to be done first/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
  });

  it("shows a server rejection of an action", async () => {
    mocked.placementTaskAction.mockRejectedValue(
      new ApiError('Finish "A" first: this task follows it.', "BAD_REQUEST", 400)
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    expect(await screen.findByText(/Finish "A" first/)).toBeInTheDocument();
  });

  it("explains an empty day and a day that is not a study day", async () => {
    mocked.refreshPlacement.mockResolvedValue(
      dash({ today_tasks: [], today_minutes: 0, today_capacity_minutes: 0 })
    );
    renderPage();
    expect(await screen.findByText(/Nothing is due today/)).toBeInTheDocument();
    expect(screen.getByText(/Today is not one of your study days/)).toBeInTheDocument();
  });

  it("lays out the next seven days with planned and available time", async () => {
    renderPage();
    const week = await screen.findByRole("list", { name: "Next seven days" });
    expect(
      within(week).getAllByRole("listitem", { hidden: false }).length
    ).toBeGreaterThanOrEqual(7);
    expect(within(week).getByText("Monday 2026-06-15")).toBeInTheDocument();
    expect(within(week).getAllByText("Not a study day").length).toBe(2);
    expect(
      within(week).getByText("25 min planned, 0 min done, of 1.5 h")
    ).toBeInTheDocument();
  });
});

describe("placement: plan status", () => {
  it("states feasibility honestly, including a reduced plan and a missing deadline", async () => {
    mocked.refreshPlacement.mockResolvedValue(
      dash({
        plan: {
          generation: 2,
          generated_at: "x",
          days_until_placement: 2,
          feasibility: {
            status: "insufficient",
            required_minutes: 400,
            available_minutes: 60,
            message:
              "The most important work needs about 6.7 h but you have only about 1 h before 2026-06-17.",
            reduced: true,
            deferred_task_ids: ["t_1"],
          },
        },
      })
    );
    renderPage();
    const status = await screen.findByRole("region", { name: "Plan status" });
    expect(status).toHaveTextContent("Not enough time for everything.");
    expect(status).toHaveTextContent(
      "This is a reduced plan with the highest-priority work."
    );
    expect(status).toHaveTextContent("Plan version 2 · 2 day(s) to your placement date");
  });

  it("regenerates only after confirmation, in full or reduced form", async () => {
    mocked.generatePlacementPlan.mockResolvedValue(dash());
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Regenerate future tasks…" })
    );
    expect(mocked.generatePlacementPlan).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Completed, started and rescheduled tasks are kept/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Make a reduced plan" }));
    await waitFor(() =>
      expect(mocked.generatePlacementPlan).toHaveBeenCalledWith({ mode: "reduced" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Regenerate future tasks…" }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() =>
      expect(mocked.generatePlacementPlan).toHaveBeenLastCalledWith({})
    );
  });

  it("refreshes from the student's results on request", async () => {
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Refresh from my results" })
    );
    await waitFor(() => expect(mocked.refreshPlacement).toHaveBeenCalledTimes(2));
  });

  it("deletes planner data only after confirmation", async () => {
    mocked.deletePlacementData.mockResolvedValue(undefined);
    mocked.getPlacementDashboard.mockResolvedValue(
      dash({ needs_profile: true, profile: null, plan: null, today_tasks: [] })
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete my goals, plan and tasks" })
    );
    expect(mocked.deletePlacementData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Delete my goals, plan and tasks" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete them" }));
    await waitFor(() => expect(mocked.deletePlacementData).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("heading", {
        name: "Start with your goals and availability",
      })
    ).toBeInTheDocument();
  });

  it("shows a retryable error when the plan cannot load", async () => {
    mocked.getPlacementProfile
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(profileResponse({ profile }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { name: "Today's plan" })
    ).toBeInTheDocument();
  });

  it("falls back to the stored plan when refreshing is not possible", async () => {
    mocked.refreshPlacement.mockRejectedValue(new Error("busy"));
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Today's plan" })
    ).toBeInTheDocument();
    expect(mocked.getPlacementDashboard).toHaveBeenCalled();
  });

  it("is only for signed-in students", async () => {
    renderPage(null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mocked.getPlacementProfile).not.toHaveBeenCalled();
  });
});

describe("placement: skills, evidence and history", () => {
  it("shows measured, unmeasured and self-reported information separately", async () => {
    renderPage();
    const skills = await screen
      .findByRole("region", { name: "Skills overview" })
      .catch(() => screen.getByText("Skills overview").closest("section")!);
    expect(
      within(skills).getByText(/1 of 2 skill areas have enough evidence/)
    ).toBeInTheDocument();
    expect(within(skills).getByText("Not enough evidence")).toBeInTheDocument(); // Arrays: no number at all
    expect(within(skills).getByText("Strong: 80%")).toBeInTheDocument();
    expect(
      within(skills).getByText(
        /Verified result · 8 judged submissions · medium confidence · last evidence 2026-06-12 \(recent\)/
      )
    ).toBeInTheDocument();
    expect(
      within(skills).getByText(/No evidence yet · 0 judged submissions · no confidence/)
    ).toBeInTheDocument();
    expect(
      within(skills).getByText(
        /You listed this as a weak area \(self-reported, not part of the reading\)/
      )
    ).toBeInTheDocument();
    expect(
      within(skills).getByText(
        /Next: Solve one Arrays question to get a first measurement/
      )
    ).toBeInTheDocument();
    fireEvent.click(within(skills).getByText("How these readings are calculated"));
    expect(
      within(skills).getByText(/no overall readiness score and no offer probability/)
    ).toBeInTheDocument();
  });

  it("labels demonstration results and never shows a number for them", async () => {
    mocked.refreshPlacement.mockResolvedValue(
      dash({
        skills: {
          ...dash().skills,
          skills: [
            skill({
              area: "interview:r:s",
              label: "Interview: Testing (Frontend Developer)",
              category: "interview",
              evidence: {
                kind: "interview_assessment",
                provenance: "demonstration",
                count: 1,
                unit: "assessments",
                last_at: "2026-06-10T00:00:00.000Z",
                recency: "aging",
              },
              note: "Graded by the mock model: a demonstration, not an assessment.",
            }),
          ],
        },
      })
    );
    renderPage();
    expect(
      await screen.findByText(/Demonstration only · 1 assessments/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Graded by the mock model/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("lists what limits the results, accuracy-limiting items first", async () => {
    mocked.refreshPlacement.mockResolvedValue(
      dash({
        limitations: [
          { source: "github", severity: "info", message: "GitHub is not connected." },
          {
            source: "dsa",
            severity: "limits_accuracy",
            message: "Code execution is not configured.",
          },
        ],
      })
    );
    renderPage();
    const section = (
      await screen.findByRole("heading", { name: "What limits these results" })
    ).closest("section")!;
    const items = within(section).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(
      "Limits accuracy: Code execution is not configured."
    );
    expect(items[1]).toHaveTextContent("Note: GitHub is not connected.");
  });

  it("explains empty history honestly and shows plan changes with their reasons", async () => {
    renderPage();
    expect(await screen.findByText("Nothing completed yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        /None recorded yet\. These appear only when your own verified results show a change/
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/None found in your verified results/)).toBeInTheDocument();
    expect(screen.getByText(/Your plan was created\./)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Based on your goals, availability and the results recorded so far/
      )
    ).toBeInTheDocument();
  });

  it("shows completed tasks with how they were completed, and validated improvements", async () => {
    mocked.refreshPlacement.mockResolvedValue(
      dash({
        history: {
          ...dash().history,
          recent_completed: [
            task({
              status: "completed",
              completed_at: "2026-06-14T10:00:00.000Z",
              completed_by: "verified_event",
              title: "Revise: Pair Sum",
            }),
            task({
              id: `t_${"b".repeat(24)}`,
              status: "completed",
              completed_at: "2026-06-13T10:00:00.000Z",
              completed_by: "student",
              title: "Weekly review",
            }),
          ],
          improvements: [
            {
              at: null,
              area: "dsa:Graphs",
              message: "Your Graphs results are improving (from judged submissions).",
              source: "dsa_judged",
            },
          ],
          repeated_difficulties: [
            {
              area: "Two Sum",
              detail: "Failed 3 times in a row in judged submissions (3 attempts).",
            },
          ],
          revision: { due: 2, items: 5 },
        },
      })
    );
    renderPage();
    expect(await screen.findByText(/Revise: Pair Sum/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-14, proved by your records/)).toBeInTheDocument();
    expect(screen.getByText(/2026-06-13, marked by you/)).toBeInTheDocument();
    expect(
      screen.getByText("Your Graphs results are improving (from judged submissions).")
    ).toBeInTheDocument();
    expect(screen.getByText(/Two Sum: Failed 3 times in a row/)).toBeInTheDocument();
    expect(screen.getByText("Revision queue: 2 due of 5 item(s).")).toBeInTheDocument();
  });

  it("shows readiness as evidence coverage with recommended next assessments, never as a score", async () => {
    renderPage();
    const section = (
      await screen.findByRole("heading", { name: "Readiness and next steps" })
    ).closest("section")!;
    expect(
      within(section).getByText(
        /There is no overall score and no probability of an offer/
      )
    ).toBeInTheDocument();
    expect(within(section).getByText("Enough evidence")).toBeInTheDocument();
    expect(within(section).getByText("Recommended next assessments")).toBeInTheDocument();
    expect(within(section).getAllByText(/DSA: Arrays/).length).toBeGreaterThanOrEqual(2);
  });
});

describe("placement: asking about the plan", () => {
  const answer = (
    over: Partial<PlacementAssistantResponse> = {}
  ): PlacementAssistantResponse => ({
    intent: "today",
    answer:
      "Today you have 1 task(s), about 25 of your 90 available minutes:\n- First measurement (25 min)",
    mentor_reply: "(mock mentor, no live model) Here is why.",
    mentor: { available: true, mock: true, error: null },
    proposed_changes: [],
    memory_saved: [],
    ...over,
  });

  it("shows the application's own answer and the mentor's explanation separately", async () => {
    mocked.placementAssistant.mockResolvedValue(answer());
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "What should I study today?" })
    );
    expect(await screen.findByLabelText("Answer from your plan")).toHaveTextContent(
      "Today you have 1 task(s)"
    );
    expect(screen.getByLabelText("AI mentor explanation")).toHaveTextContent(
      "Mock mentor: a built-in stand-in, not a live model."
    );
    expect(mocked.placementAssistant).toHaveBeenCalledWith("What should I study today?");
  });

  it("is complete without the AI mentor and says it could not add an explanation", async () => {
    mocked.placementAssistant.mockResolvedValue(
      answer({
        mentor_reply: null,
        mentor: {
          available: false,
          mock: false,
          error: "The AI mentor could not answer right now.",
        },
      })
    );
    renderPage();
    fireEvent.change(await screen.findByLabelText("Your question about the plan"), {
      target: { value: "why this?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByLabelText("Answer from your plan")).toBeInTheDocument();
    expect(screen.queryByLabelText("AI mentor explanation")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /could not add an explanation .*The AI mentor could not answer right now.*complete without it/
      )
    ).toBeInTheDocument();
  });

  it("applies a proposed change only when the student presses Apply, then shows the updated plan", async () => {
    mocked.placementAssistant.mockResolvedValue(
      answer({
        intent: "lighter",
        proposed_changes: [
          {
            kind: "lighter_day",
            date: "2026-06-15",
            max_minutes: 45,
            description:
              "Keep about 45 minutes today and move the lowest-priority tasks to later days.",
          },
        ],
      })
    );
    mocked.applyPlacementChange.mockResolvedValue({
      summary: "2026-06-15 now holds 25 minutes; 1 task(s) moved to later days.",
      dashboard: dash({ today_tasks: [], today_minutes: 0 }),
    });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Give me a lighter plan for today" })
    );
    const list = await screen.findByRole("list", { name: "Proposed changes" });
    expect(mocked.applyPlacementChange).not.toHaveBeenCalled();
    fireEvent.click(within(list).getByRole("button", { name: "Apply this change" }));
    await waitFor(() =>
      expect(mocked.applyPlacementChange).toHaveBeenCalledWith({
        kind: "lighter_day",
        date: "2026-06-15",
        max_minutes: 45,
      })
    ); // the description is not sent back
    expect(
      await screen.findByText(/1 task\(s\) moved to later days/)
    ).toBeInTheDocument();
    expect(await screen.findByText(/Nothing is due today/)).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Proposed changes" })
    ).not.toBeInTheDocument();
  });

  it("shows a failure to answer or to apply", async () => {
    mocked.placementAssistant
      .mockRejectedValueOnce(new ApiError("slow", "RATE_LIMITED", 429))
      .mockResolvedValueOnce(
        answer({
          proposed_changes: [
            {
              kind: "set_daily_minutes",
              minutes: 45,
              description: "Set your daily study time to 45 minutes.",
            },
          ],
        })
      );
    mocked.applyPlacementChange.mockRejectedValue(
      new ApiError("Daily minutes must be between 15 and 480.", "BAD_REQUEST", 400)
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "What should I study today?" })
    );
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What should I study today?" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply this change" }));
    expect(
      await screen.findByText("Daily minutes must be between 15 and 480.")
    ).toBeInTheDocument();
  });

  it("notes what the mentor remembered from the student's message", async () => {
    mocked.placementAssistant.mockResolvedValue(
      answer({
        memory_saved: [
          {
            id: "m",
            type: "learning",
            content: "Finds graphs difficult",
            provenance: "student_provided",
          },
        ],
      })
    );
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "What should I study today?" })
    );
    expect(
      await screen.findByText(/Remembered from your message: Finds graphs difficult/)
    ).toBeInTheDocument();
  });
});
