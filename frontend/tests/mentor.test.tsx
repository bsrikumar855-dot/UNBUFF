import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import type {
  MentorChatResponse,
  MentorConversationSummary,
  MentorMemoriesResponse,
  MentorMemory,
  MentorProfile,
} from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    mentorChat: vi.fn(),
    listMentorConversations: vi.fn(),
    getMentorConversation: vi.fn(),
    deleteMentorConversation: vi.fn(),
    listMentorMemories: vi.fn(),
    createMentorMemory: vi.fn(),
    patchMentorMemory: vi.fn(),
    deleteMentorMemory: vi.fn(),
    clearMentorMemories: vi.fn(),
    getMentorProfile: vi.fn(),
    putMentorProfile: vi.fn(),
    getQuestion: vi.fn(),
    getRoles: vi.fn(),
    getHealth: vi.fn(),
    getResumeSkills: vi.fn(),
    extractResumeSkills: vi.fn(),
    saveResumeSkills: vi.fn(),
    deleteResumeSkills: vi.fn(),
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
const renderAt = (path: string, u: AuthUser | null = user) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

const conv = (
  over: Partial<MentorConversationSummary> = {}
): MentorConversationSummary => ({
  id: "conv_aaaaaaaaaaaaaaaaaaaaaaaa",
  title: "Two pointers",
  mode: "dsa_coach",
  message_count: 2,
  hint_level: 0,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  ...over,
});

const reply = (over: Partial<MentorChatResponse> = {}): MentorChatResponse => ({
  conversation: conv(),
  reply: {
    id: "msg_r1",
    role: "assistant",
    content: "Think about moving two indexes inward.",
    at: "2026-06-01T00:00:01.000Z",
  },
  memory_saved: [],
  persistence: { conversation: "saved", memory: "none" },
  references: [],
  analytics_note: null,
  degraded: false,
  mock: false,
  ...over,
});

const memory = (over: Partial<MentorMemory> = {}): MentorMemory => ({
  id: "mem_1",
  type: "learning",
  key: null,
  topic: "graphs",
  content: "Finds graphs difficult",
  provenance: "student_provided",
  confidence: "medium",
  signal: "difficult",
  status: null,
  track: null,
  completed_by: null,
  source_conversation_id: null,
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
  expires_at: "2026-12-01T00:00:00.000Z",
  review_at: null,
  ...over,
});

const memories = (
  list: MentorMemory[],
  over: Partial<MentorMemoriesResponse> = {}
): MentorMemoriesResponse => ({
  memories: list,
  page: 1,
  page_size: 20,
  total: list.length,
  total_pages: 1,
  counts: {
    profile: list.filter((m) => m.type === "profile").length,
    learning: list.filter((m) => m.type === "learning").length,
    summary: list.filter((m) => m.type === "summary").length,
    goal: list.filter((m) => m.type === "goal").length,
  },
  retention: {
    conversation_days: 90,
    summary_days: 365,
    learning_days: 180,
    profile_and_goals: "until you delete them",
  },
  ...over,
});

const profile: MentorProfile = {
  target_roles: ["SDE"],
  target_companies: [],
  preferred_languages: ["python"],
  daily_study_minutes: 60,
  placement_timeline: null,
  explanation_style: null,
  current_goals: null,
  skill_self_assessment: { dp: "beginner" },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocked.listMentorConversations.mockResolvedValue({
    conversations: [],
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 1,
  });
  mocked.listMentorMemories.mockResolvedValue(memories([]));
  mocked.getMentorProfile.mockResolvedValue({
    profile: {
      ...profile,
      target_roles: [],
      preferred_languages: [],
      daily_study_minutes: null,
      skill_self_assessment: {},
    },
    updated_at: null,
  });
});

const box = () => screen.findByLabelText("Your message");

describe("mentor chat", () => {
  it("shows an empty state with starters, four modes, and requires sign-in", async () => {
    renderAt("/mentor");
    expect(await screen.findByRole("heading", { name: "AI Mentor" })).toBeInTheDocument();
    expect(await screen.findByText("No conversations yet.")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
      "DSA Coach",
      "Code Explainer",
      "Interview Practice",
      "Placement Mentor",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "Interview Practice" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Ask me a technical interview question/ })
    );
    expect(await box()).toHaveValue(
      "Ask me a technical interview question about arrays."
    );
  });

  it("is only for signed-in students", async () => {
    renderAt("/mentor", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mocked.mentorChat).not.toHaveBeenCalled();
  });

  it("sends a message with the chosen mode, shows the answer, and refreshes history", async () => {
    mocked.mentorChat.mockResolvedValue(reply());
    renderAt("/mentor");
    fireEvent.click(await screen.findByRole("radio", { name: "Code Explainer" }));
    fireEvent.change(await box(), { target: { value: "Explain my loop" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText("Think about moving two indexes inward.")
    ).toBeInTheDocument();
    expect(screen.getByText("Explain my loop")).toBeInTheDocument();
    const call = mocked.mentorChat.mock.calls[0]![0];
    expect(call).toMatchObject({ mode: "code_explainer", message: "Explain my loop" });
    expect(call.client_message_id).toMatch(/^cm_[A-Za-z0-9]{8,}$/);
    expect(call.conversation_id).toBeUndefined();
    await waitFor(() => expect(mocked.listMentorConversations).toHaveBeenCalledTimes(2));
    expect(await box()).toHaveValue(""); // cleared, ready for the next message
  });

  it("continues the same conversation on a follow-up", async () => {
    mocked.mentorChat.mockResolvedValue(reply());
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "first" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Think about moving two indexes inward.");
    fireEvent.change(await box(), { target: { value: "second" } });
    fireEvent.keyDown(await box(), { key: "Enter" });
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalledTimes(2));
    expect(mocked.mentorChat.mock.calls[1]![0]).toMatchObject({
      conversation_id: "conv_aaaaaaaaaaaaaaaaaaaaaaaa",
      message: "second",
    });
  });

  it("sends a pasted problem with the first message only, and keeps it visible", async () => {
    const PROBLEM = "Given an array of integers and a target, return the indices of the two numbers that add up to the target.";
    mocked.mentorChat.mockResolvedValue(reply());
    renderAt("/mentor");
    fireEvent.change(await screen.findByLabelText("Problem statement"), { target: { value: PROBLEM } });
    fireEvent.click(screen.getByRole("button", { name: "Explain this problem" }));
    await screen.findByText("Think about moving two indexes inward.");
    expect(mocked.mentorChat.mock.calls[0]![0]).toMatchObject({ mode: "dsa_coach", problem_text: PROBLEM, message: expect.stringMatching(/Explain this problem/) });
    expect(screen.getByText("The problem you pasted")).toBeInTheDocument();
    fireEvent.change(await box(), { target: { value: "hint please" } });
    fireEvent.keyDown(await box(), { key: "Enter" });
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalledTimes(2));
    expect(mocked.mentorChat.mock.calls[1]![0].problem_text).toBeUndefined();
    expect(screen.queryByLabelText("Problem statement")).not.toBeInTheDocument();
  });

  it("does not offer to send a problem that is too short, and hides the panel outside DSA coach mode", async () => {
    renderAt("/mentor");
    fireEvent.change(await screen.findByLabelText("Problem statement"), { target: { value: "two sum" } });
    expect(screen.getByRole("button", { name: "Explain this problem" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Code Explainer" }));
    expect(screen.queryByLabelText("Problem statement")).not.toBeInTheDocument();
  });

  it("opens with a prompt from a lesson page", async () => {
    renderAt("/mentor?prompt=" + encodeURIComponent("Explain the Two Pointers pattern"));
    expect(await box()).toHaveValue("Explain the Two Pointers pattern");
  });

  it("Shift+Enter does not send", async () => {
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "draft" } });
    fireEvent.keyDown(await box(), { key: "Enter", shiftKey: true });
    expect(mocked.mentorChat).not.toHaveBeenCalled();
  });

  it("sends hint and solution requests as graduated assists", async () => {
    mocked.mentorChat.mockResolvedValue(reply({ conversation: conv({ hint_level: 1 }) }));
    renderAt("/mentor");
    fireEvent.click(await screen.findByRole("button", { name: "Give me a hint" }));
    await screen.findByText("Think about moving two indexes inward.");
    expect(mocked.mentorChat.mock.calls[0]![0]).toMatchObject({
      assist: "hint",
      message: "Please give me a hint.",
    });
    expect(
      await screen.findByText(/Hints used in this conversation: 1 of 3/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show solution" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalledTimes(2));
    expect(mocked.mentorChat.mock.calls[1]![0]).toMatchObject({ assist: "solution" });
  });

  it("on failure keeps the message, explains, and retries with the same client_message_id", async () => {
    mocked.mentorChat
      .mockRejectedValueOnce(new ApiError("slow", "LLM_TIMEOUT", 504))
      .mockResolvedValueOnce(reply());
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "please help" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/took too long/i)).toBeInTheDocument();
    expect(screen.getByText("please help")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry the same message" }));
    expect(
      await screen.findByText("Think about moving two indexes inward.")
    ).toBeInTheDocument();
    expect(mocked.mentorChat.mock.calls[1]![0].client_message_id).toBe(
      mocked.mentorChat.mock.calls[0]![0].client_message_id
    );
    expect(screen.getAllByText("please help")).toHaveLength(1); // not shown twice
  });

  it("explains rate limiting", async () => {
    mocked.mentorChat.mockRejectedValue(new ApiError("slow down", "RATE_LIMITED", 429));
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/Wait a moment, then retry/)).toBeInTheDocument();
  });

  it("is honest about memory: shows what was saved with its source, degraded saves, mock answers and missing analytics", async () => {
    mocked.mentorChat.mockResolvedValue(
      reply({
        mock: true,
        degraded: true,
        persistence: { conversation: "failed", memory: "failed" },
        analytics_note:
          "No verified judged practice is recorded yet (3 on demonstration exercises are not counted). Performance statistics are not available, so the mentor will not quote any.",
        memory_saved: [
          {
            id: "mem_1",
            type: "profile",
            content: "Target roles: SDE",
            provenance: "student_provided",
          },
        ],
      })
    );
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "My target role is SDE" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const notes = await screen.findByLabelText("Notes about this answer");
    expect(
      within(notes).getByText(/Mock mentor: this answer came from a built-in stand-in/)
    ).toBeInTheDocument();
    expect(within(notes).getByRole("alert")).toHaveTextContent(
      /this exchange is not in your history.*nothing was remembered/
    );
    expect(
      within(notes).getByText(/No verified judged practice is recorded yet/)
    ).toBeInTheDocument();
    expect(within(notes).getByText(/Target roles: SDE/)).toBeInTheDocument();
    expect(within(notes).getByText(/You told the mentor/)).toBeInTheDocument();
  });

  it("links references from the app's own records and labels how reliable each is", async () => {
    mocked.mentorChat.mockResolvedValue(
      reply({
        references: [
          {
            question_id: "fp_002_pair_count",
            title: "Pair Count",
            relation: "self_reported",
            label: 'Marked "solved" by you (not judged, so not verified)',
          },
          {
            question_id: "fp_005_coin_ways",
            title: "Coin Ways",
            relation: "verified_attempt",
            label: "Verified: 3 failed judged submissions in a row",
          },
        ],
      })
    );
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "what next?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const links = await screen.findAllByRole("link", { name: /Pair Count|Coin Ways/ });
    expect(links.map((l) => l.textContent)).toEqual(["Coin Ways", "Pair Count"]); // verified first
    expect(links[0]).toHaveAttribute("href", "/dsa/questions/fp_005_coin_ways");
    expect(screen.getByText(/not judged, so not verified/)).toBeInTheDocument();
  });

  it("tells the student when the answer used their saved GitHub summary", async () => {
    mocked.mentorChat.mockResolvedValue(
      reply({
        github_context: {
          used: true,
          synced_at: "2026-06-15T12:00:00.000Z",
          stale: true,
        },
      })
    );
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "How is my GitHub?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const notes = await screen.findByLabelText("Notes about this answer");
    expect(
      within(notes).getByText(/short summary of your saved public GitHub data/)
    ).toHaveTextContent(/may be out of date.*not a skill score/);
  });

  it("opens a past conversation, starts a new one, and deletes with confirmation", async () => {
    mocked.listMentorConversations.mockResolvedValue({
      conversations: [conv({ title: "Graphs chat" })],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
    });
    mocked.getMentorConversation.mockResolvedValue({
      ...conv({ title: "Graphs chat", mode: "interview_practice" }),
      problem_text: null,
      messages: [
        { id: "m1", role: "user", content: "old question", at: "x" },
        { id: "m2", role: "assistant", content: "old answer", at: "x" },
      ],
    });
    mocked.deleteMentorConversation.mockResolvedValue(undefined);
    renderAt("/mentor");
    fireEvent.click(await screen.findByRole("button", { name: "Graphs chat" }));
    expect(await screen.findByText("old answer")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Interview Practice" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    await waitFor(() => expect(screen.queryByText("old answer")).not.toBeInTheDocument());
    fireEvent.click(
      screen.getByRole("button", { name: "Delete conversation Graphs chat" })
    );
    expect(mocked.deleteMentorConversation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() =>
      expect(mocked.deleteMentorConversation).toHaveBeenCalledWith(
        "conv_aaaaaaaaaaaaaaaaaaaaaaaa"
      )
    );
  });

  it("shows the question being discussed when opened from a question page", async () => {
    mocked.getQuestion.mockResolvedValue({
      question: {
        id: "fp_002_pair_count",
        title: "Pair Count",
        url: null,
        difficulty: "easy",
        topics: [],
        company_ids: [],
      },
      companies: [],
      source: null,
    });
    renderAt("/mentor?question=fp_002_pair_count");
    expect(await screen.findByRole("link", { name: "Pair Count" })).toHaveAttribute(
      "href",
      "/dsa/questions/fp_002_pair_count"
    );
    mocked.mentorChat.mockResolvedValue(reply());
    fireEvent.change(await box(), { target: { value: "hint?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(mocked.mentorChat.mock.calls[0]![0].question_id).toBe("fp_002_pair_count")
    );
  });

  it("shows a retryable error when the conversation list cannot load", async () => {
    mocked.listMentorConversations
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({
        conversations: [],
        page: 1,
        page_size: 20,
        total: 0,
        total_pages: 1,
      });
    renderAt("/mentor");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No conversations yet.")).toBeInTheDocument();
  });
});

describe("memory settings", () => {
  it("explains retention and lists memories with provenance, expiry and tracking", async () => {
    mocked.listMentorMemories.mockResolvedValue(
      memories([
        memory(),
        memory({
          id: "mem_2",
          type: "summary",
          topic: "Heaps",
          content: "We covered heaps.",
          provenance: "model_summary",
          expires_at: null,
        }),
        memory({
          id: "mem_3",
          type: "goal",
          topic: null,
          content: "Solve Pair Count",
          signal: null,
          status: "completed",
          completed_by: "verified_activity",
          provenance: "student_provided",
          expires_at: null,
          track: { kind: "question_solved", question_id: "fp_002_pair_count" },
        }),
      ])
    );
    renderAt("/mentor/memory");
    expect(
      await screen.findByText(
        /Conversations are deleted 90 days after their last message/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Learning notes expire after 180 days; summaries after 365 days/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Deleting memory here never deletes your submissions/)
    ).toBeInTheDocument();
    expect(await screen.findByText("Finds graphs difficult")).toBeInTheDocument();
    expect(screen.getByText("Summary written by AI (may be wrong)")).toBeInTheDocument();
    expect(screen.getAllByText("You told the mentor").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/completed \(verified by your practice\)/)
    ).toBeInTheDocument();
    expect(screen.getByText(/tracked: question solved/)).toBeInTheDocument();
  });

  it("filters by type through the server and shows an empty state", async () => {
    renderAt("/mentor/memory");
    expect(await screen.findByText("Nothing saved here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Goals/ }));
    await waitFor(() =>
      expect(mocked.listMentorMemories).toHaveBeenLastCalledWith({
        type: "goal",
        page: 1,
        page_size: 20,
      })
    );
    expect(screen.getByText(/checked against your real practice/)).toBeInTheDocument();
  });

  it("edits a memory, and deletes one only after confirmation", async () => {
    mocked.listMentorMemories.mockResolvedValue(memories([memory()]));
    mocked.patchMentorMemory.mockResolvedValue(
      memory({ content: "Graphs are fine now" })
    );
    mocked.deleteMentorMemory.mockResolvedValue(undefined);
    renderAt("/mentor/memory");
    await screen.findByText("Finds graphs difficult");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit memory"), {
      target: { value: "Graphs are fine now" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocked.patchMentorMemory).toHaveBeenCalledWith("mem_1", {
        content: "Graphs are fine now",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocked.deleteMentorMemory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(mocked.deleteMentorMemory).toHaveBeenCalledWith("mem_1"));
  });

  it("goal controls change status by request", async () => {
    mocked.listMentorMemories.mockResolvedValue(
      memories([
        memory({
          id: "mem_g",
          type: "goal",
          topic: null,
          content: "Finish arrays",
          signal: null,
          status: "active",
        }),
      ])
    );
    mocked.patchMentorMemory.mockResolvedValue(
      memory({ id: "mem_g", type: "goal", status: "completed", completed_by: "student" })
    );
    renderAt("/mentor/memory");
    await screen.findByText("Finish arrays");
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() =>
      expect(mocked.patchMentorMemory).toHaveBeenCalledWith("mem_g", {
        status: "completed",
      })
    );
  });

  it("does not offer free-text editing for profile memories", async () => {
    mocked.listMentorMemories.mockResolvedValue(
      memories([
        memory({
          id: "mem_p",
          type: "profile",
          key: "target_roles",
          content: "Target roles: SDE",
          signal: null,
          topic: null,
          expires_at: null,
        }),
      ])
    );
    renderAt("/mentor/memory");
    await screen.findByText("Target roles: SDE");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("adds a goal, optionally tracking a question", async () => {
    mocked.createMentorMemory.mockResolvedValue(memory({ type: "goal" }));
    renderAt("/mentor/memory");
    await screen.findByText("Nothing saved here.");
    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Solve Pair Count" },
    });
    fireEvent.change(screen.getByLabelText(/Track a question/), {
      target: { value: "fp_002_pair_count" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add goal" }));
    await waitFor(() =>
      expect(mocked.createMentorMemory).toHaveBeenCalledWith({
        type: "goal",
        content: "Solve Pair Count",
        track: { kind: "question_solved", question_id: "fp_002_pair_count" },
      })
    );
  });

  it("loads and saves the profile as the student corrected it", async () => {
    mocked.getMentorProfile.mockResolvedValue({
      profile,
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    mocked.putMentorProfile.mockImplementation(async (p) => ({
      profile: p,
      updated_at: "now",
    }));
    renderAt("/mentor/memory");
    expect(await screen.findByLabelText(/Target roles/)).toHaveValue("SDE");
    expect(screen.getByLabelText("Python")).toBeChecked();
    expect(screen.getByLabelText("Skill 1")).toHaveValue("dp");
    fireEvent.change(screen.getByLabelText(/Target roles/), {
      target: { value: "SDE, Data Analyst" },
    });
    fireEvent.change(screen.getByLabelText(/Target companies/), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByLabelText("Java"));
    fireEvent.change(screen.getByLabelText(/Daily study time/), {
      target: { value: "90" },
    });
    fireEvent.change(screen.getByLabelText("Explanation style"), {
      target: { value: "step_by_step" },
    });
    fireEvent.change(screen.getByLabelText("Level for skill 1"), {
      target: { value: "intermediate" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocked.putMentorProfile).toHaveBeenCalledTimes(1));
    expect(mocked.putMentorProfile.mock.calls[0]![0]).toEqual({
      target_roles: ["SDE", "Data Analyst"],
      target_companies: ["Acme"],
      preferred_languages: ["python", "java"],
      daily_study_minutes: 90,
      placement_timeline: null,
      explanation_style: "step_by_step",
      current_goals: null,
      skill_self_assessment: { dp: "intermediate" },
    });
    expect(await screen.findByText("Profile saved")).toBeInTheDocument();
  });

  it("clears all memory only after confirmation, and can include the conversations", async () => {
    mocked.clearMentorMemories.mockResolvedValue(undefined);
    renderAt("/mentor/memory");
    await screen.findByText("Nothing saved here.");
    fireEvent.click(screen.getByRole("button", { name: "Clear all mentor memory" }));
    expect(mocked.clearMentorMemories).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Also delete my conversation history"));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it all" }));
    await waitFor(() => expect(mocked.clearMentorMemories).toHaveBeenCalledWith(true));
  });

  it("shows a retryable error when memories cannot load", async () => {
    mocked.listMentorMemories
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(memories([]));
    renderAt("/mentor/memory");
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Nothing saved here.")).toBeInTheDocument();
  });
});

describe("Which engine answers is always visible", () => {
  it("says Live model, with the model name, when the server reports live mode", async () => {
    mocked.getHealth.mockResolvedValue({ status: "ok", llm_mode: "live", model: "gemini-test-model" });
    renderAt("/mentor");
    const note = await screen.findByText(/Live model\./);
    expect(note.closest("p")).toHaveTextContent(/gemini-test-model/);
    expect(screen.queryByText(/Mock mode\./)).not.toBeInTheDocument();
  });

  it("says Mock mode, before anything is sent, when the server reports mock mode", async () => {
    mocked.getHealth.mockResolvedValue({ status: "ok", llm_mode: "mock", model: null });
    renderAt("/mentor");
    const note = await screen.findByText(/Mock mode\./);
    expect(note.closest("p")).toHaveTextContent(/not an AI model/i);
    expect(screen.queryByText(/Live model\./)).not.toBeInTheDocument();
    expect(mocked.mentorChat).not.toHaveBeenCalled();
  });

  it("shows neither claim when the server cannot be asked", async () => {
    mocked.getHealth.mockRejectedValue(new Error("down"));
    renderAt("/mentor");
    await screen.findByRole("heading", { name: "AI Mentor" });
    expect(screen.queryByText(/Mock mode\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live model\./)).not.toBeInTheDocument();
  });

  it("a model failure is an error with a retry, never an invented answer", async () => {
    mocked.getHealth.mockResolvedValue({ status: "ok", llm_mode: "live", model: "gemini-test-model" });
    mocked.mentorChat.mockRejectedValue(new ApiError("The mentor could not answer right now. Please try again.", "LLM_INVALID_OUTPUT", 502));
    renderAt("/mentor");
    fireEvent.change(await box(), { target: { value: "explain heaps" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("button", { name: "Retry the same message" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not get an answer from the AI model/i);
    expect(screen.getAllByText("explain heaps")).toHaveLength(1);
    expect(screen.queryByText(/Think about|\(mock mentor/)).not.toBeInTheDocument();
  });
});

describe("Skills from your resume (Memory)", () => {
  const found = [
    { slug: "react", label: "React", mentions: 3, evidence: "Built a dashboard with React and tests" },
    { slug: "docker", label: "Docker", mentions: 1, evidence: "Containerised services with Docker" },
  ];
  const openMemory = async () => {
    mocked.listMentorMemories.mockResolvedValue(memories([]));
    mocked.getMentorProfile.mockResolvedValue({ profile: { target_roles: [], target_companies: [], preferred_languages: [], daily_study_minutes: null, placement_timeline: null, explanation_style: null, current_goals: null, skill_self_assessment: {} }, updated_at: null } as never);
    renderAt("/mentor/memory");
    return screen.findByRole("heading", { name: "Skills from your resume" });
  };

  it("explains what is and is not kept, and offers the upload where the resume is read", async () => {
    mocked.getResumeSkills.mockResolvedValue({ skills: [], saved_at: null });
    await openMemory();
    expect(screen.getByText(/neither the file nor the text is stored/)).toBeInTheDocument();
    expect(screen.getByText(/count as stated by you, not as verified/)).toBeInTheDocument();
    expect(await screen.findByText("No resume skills saved yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your resume")).toBeInTheDocument();
    expect(screen.getByText("Upload PDF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find skills in this resume" })).toBeDisabled();
  });

  it("finds skills in the text, lets the student keep only some, and saves exactly those", async () => {
    mocked.getResumeSkills.mockResolvedValue({ skills: [], saved_at: null });
    mocked.extractResumeSkills.mockResolvedValue({ skills: found, text_chars: 80, vocabulary_size: 114 });
    mocked.saveResumeSkills.mockResolvedValue({ skills: [{ slug: "react", label: "React" }], saved_at: "2026-10-18T10:00:00.000Z" });
    await openMemory();
    fireEvent.change(screen.getByLabelText("Your resume"), { target: { value: "Built a dashboard with React. Containerised services with Docker." } });
    fireEvent.click(screen.getByRole("button", { name: "Find skills in this resume" }));
    await waitFor(() => expect(mocked.extractResumeSkills).toHaveBeenCalledWith("Built a dashboard with React. Containerised services with Docker."));
    expect(await screen.findByText(/Found 2 skills/)).toBeInTheDocument();
    expect(screen.getByText(/Built a dashboard with React and tests/)).toBeInTheDocument();
    expect(screen.getByText(/mentioned 3 times/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /React/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Docker/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save 1 skill" }));
    await waitFor(() => expect(mocked.saveResumeSkills).toHaveBeenCalledWith(["react"]));
    expect(await screen.findByText(/Saved 1 skill/)).toBeInTheDocument();
    const kept = await screen.findByLabelText("Saved resume skills");
    expect(within(kept).getByText("React")).toBeInTheDocument();
    expect(screen.getByLabelText("Your resume")).toHaveValue(""); // the text is dropped from the page once the skills are kept
  });

  it("supports select all and none, and says plainly when nothing is recognised", async () => {
    mocked.getResumeSkills.mockResolvedValue({ skills: [], saved_at: null });
    mocked.extractResumeSkills.mockResolvedValueOnce({ skills: found, text_chars: 80, vocabulary_size: 114 }).mockResolvedValueOnce({ skills: [], text_chars: 20, vocabulary_size: 114 });
    await openMemory();
    fireEvent.change(screen.getByLabelText("Your resume"), { target: { value: "some text" } });
    fireEvent.click(screen.getByRole("button", { name: "Find skills in this resume" }));
    await screen.findByText(/Found 2 skills/);
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByRole("button", { name: "Save none (clears saved skills)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: "Save 2 skills" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Find skills in this resume" }));
    expect(await screen.findByText(/No skills this app recognises were found/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Save (none|d+ skills?)/ })).not.toBeInTheDocument(); // nothing to save, and Back never wipes saved skills
    expect(mocked.saveResumeSkills).not.toHaveBeenCalled();
  });

  it("shows saved skills with the date, and removes them on request", async () => {
    mocked.getResumeSkills.mockResolvedValue({ skills: [{ slug: "react", label: "React" }, { slug: "css", label: "CSS" }], saved_at: "2026-10-18T10:00:00.000Z" });
    mocked.deleteResumeSkills.mockResolvedValue(undefined);
    await openMemory();
    const kept = await screen.findByLabelText("Saved resume skills");
    expect(within(kept).getByText("CSS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find skills in this resume and replace" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove my resume skills" }));
    await waitFor(() => expect(mocked.deleteResumeSkills).toHaveBeenCalled());
    expect(await screen.findByText("Your resume skills were removed.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Saved resume skills")).not.toBeInTheDocument();
  });

  it("shows why finding or saving failed", async () => {
    mocked.getResumeSkills.mockResolvedValue({ skills: [], saved_at: null });
    mocked.extractResumeSkills.mockRejectedValueOnce(new ApiError("The resume text is too long (at most 50,000 characters).", "BAD_REQUEST", 400)).mockResolvedValueOnce({ skills: found, text_chars: 5, vocabulary_size: 114 });
    mocked.saveResumeSkills.mockRejectedValue(new ApiError("down", "INTERNAL", 500));
    await openMemory();
    fireEvent.change(screen.getByLabelText("Your resume"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Find skills in this resume" }));
    expect(await screen.findByText(/too long/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find skills in this resume" }));
    await screen.findByText(/Found 2 skills/);
    fireEvent.click(screen.getByRole("button", { name: "Save 2 skills" }));
    expect(await screen.findByText(/Something went wrong on our side/)).toBeInTheDocument();
    expect(screen.getByText(/Found 2 skills/)).toBeInTheDocument(); // the review stays open so nothing is lost
  });
});
