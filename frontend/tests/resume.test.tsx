import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import { navGroups } from "@/components/shell/nav";
import { mentorResumeUrl, pdfUrl, scoreTone } from "@/lib/resume";
import type { AtsResult, MentorChatResponse, ResumeResponse, ResumeTemplate } from "@/types/contract";

vi.mock("@/api/endpoints", () => ({
  api: {
    getResume: vi.fn(),
    saveResume: vi.fn(),
    scoreResume: vi.fn(),
    compileResume: vi.fn(),
    getResumeTemplates: vi.fn(),
    getRoles: vi.fn(),
    mentorChat: vi.fn(),
    listMentorConversations: vi.fn(),
    getHealth: vi.fn(),
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
const renderAt = (path: string) =>
  render(
    <AuthProvider client={fakeAuth(user)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

// Every value below is fictitious test data.
const ats = (over: Partial<AtsResult> = {}): AtsResult => ({
  score: 72,
  rating: "good",
  checks: [
    { id: "contact", label: "Contact details", score: 10, max: 10, status: "pass", detail: "Found: email, phone, GitHub or LinkedIn link.", fix: null },
    { id: "impact", label: "Measurable impact", score: 6, max: 15, status: "warn", detail: "2 of 6 bullets include a number, percentage or scale.", fix: "Add a measurable result to more bullets." },
    { id: "format", label: "ATS-safe formatting", score: 0, max: 10, status: "fail", detail: "Found layout features that parsers often misread: tables.", fix: "Use a single-column layout." },
  ],
  keywords: { matched: ["JavaScript Fundamentals"], missing: ["Accessibility"], source: "role" },
  stats: { words: 300, bullets: 6, sections: ["Education", "Skills"] },
  role_id: "frontend_developer",
  scored_at: "2026-10-21T10:00:00.000Z",
  disclaimer: "A heuristic estimate from common ATS guidance, not any employer's real system. Use it to find fixes, not as a pass or fail prediction.",
  ...over,
});
const template = (id: string, latex: string): ResumeTemplate => ({ id, name: `Template ${id}`, description: "d", latex });
const resumeResponse = (over: Partial<ResumeResponse> = {}): ResumeResponse => ({ document: null, ats: null, compiler_available: true, max_bytes: 60000, ...over });
const saved = (latex = "\\section{Skills} saved text") => ({ latex, role_id: "frontend_developer", job_description: null, updated_at: "2026-10-20T09:00:00.000Z" });

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getResume.mockResolvedValue(resumeResponse());
  mocked.getResumeTemplates.mockResolvedValue({ templates: [template("classic", "\\documentclass{article} classic"), template("compact", "\\documentclass{article} compact")] });
  mocked.getRoles.mockResolvedValue({ roles: [{ id: "frontend_developer", name: "Frontend Developer", description: "d", skill_count: 7 }] });
  mocked.scoreResume.mockResolvedValue(ats());
  mocked.listMentorConversations.mockResolvedValue({ conversations: [], total: 0 } as never);
  mocked.getHealth.mockResolvedValue({ status: "ok", llm_mode: "live", model: "m" } as never);
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.useRealTimers());

describe("helpers", () => {
  it("builds the mentor link, picks a score tone and turns base64 into a blob URL", () => {
    expect(mentorResumeUrl()).toBe("/mentor?resume=1");
    expect(mentorResumeUrl("Review my résumé")).toBe("/mentor?resume=1&prompt=Review+my+r%C3%A9sum%C3%A9");
    expect([90, 60, 20].map(scoreTone)).toEqual(["good", "mid", "low"]);
    expect(pdfUrl(btoa("%PDF-1.5"))).toBe("blob:pdf");
  });
  it("adds the builder to the Plan group of the navigation", () => {
    const plan = navGroups(null).find((g) => g.id === "plan")!;
    expect(plan.items.map((i) => i.label)).toContain("Résumé builder");
    expect(plan.items.find((i) => i.label === "Résumé builder")!.match("/resume")).toBe(true);
  });
});

describe("the résumé builder page", () => {
  it("starts from the first template when nothing is saved, and says so", async () => {
    renderAt("/resume");
    const editor = await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    expect(editor).toHaveValue("\\documentclass{article} classic");
    expect(screen.getByText(/starter template with placeholder details/)).toBeInTheDocument();
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
  });

  it("loads a saved résumé with its score, without scoring it again straight away", async () => {
    mocked.getResume.mockResolvedValue(resumeResponse({ document: saved(), ats: ats() }));
    renderAt("/resume");
    expect(await screen.findByLabelText("LaTeX source", { selector: "textarea" })).toHaveValue("\\section{Skills} saved text");
    expect(screen.getByRole("img", { name: "ATS score 72 out of 100" })).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText(/not any employer's real system/)).toBeInTheDocument();
    expect(screen.getByText(/^Saved /)).toBeInTheDocument();
    expect(mocked.scoreResume).not.toHaveBeenCalled();
  });

  it("shows each check with its score, status and fix, and the keywords found and missing", async () => {
    mocked.getResume.mockResolvedValue(resumeResponse({ document: saved(), ats: ats() }));
    renderAt("/resume");
    const list = await screen.findByRole("list", { name: "ATS checks" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["pass", "warn", "fail"]);
    expect(within(rows[0]!).queryByText(/^Fix:/)).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("Fix: Add a measurable result to more bullets.")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("0/10")).toBeInTheDocument();
    expect(screen.getByText("JavaScript Fundamentals")).toBeInTheDocument();
    expect(screen.getByText("Accessibility")).toBeInTheDocument();
    expect(screen.getByText(/Add a missing keyword only where it is true/)).toBeInTheDocument();
  });

  it("re-scores a moment after the text, role or job description changes (debounced), and shows unsaved changes", async () => {
    mocked.getResume.mockResolvedValue(resumeResponse({ document: saved(), ats: ats() }));
    renderAt("/resume");
    const editor = await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(editor, { target: { value: "\\section{Skills} edited" } });
    fireEvent.change(editor, { target: { value: "\\section{Skills} edited again" } });
    expect(mocked.scoreResume).not.toHaveBeenCalled(); // debounced
    mocked.scoreResume.mockResolvedValue(ats({ score: 55, rating: "needs_work" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(mocked.scoreResume).toHaveBeenCalledTimes(1);
    expect(mocked.scoreResume).toHaveBeenCalledWith({ latex: "\\section{Skills} edited again", role_id: "frontend_developer", job_description: null });
    expect(await screen.findByText("Needs work")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("saves the résumé with its role and job description", async () => {
    mocked.saveResume.mockResolvedValue(resumeResponse({ document: saved("\\documentclass{article} classic"), ats: ats() }));
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    fireEvent.change(screen.getByLabelText("Target role"), { target: { value: "frontend_developer" } });
    fireEvent.change(screen.getByLabelText(/Paste a job posting/), { target: { value: "  React and Node  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocked.saveResume).toHaveBeenCalledWith({ latex: "\\documentclass{article} classic", role_id: "frontend_developer", job_description: "React and Node" }));
    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
  });

  it("builds the PDF and previews it, with a download link", async () => {
    mocked.compileResume.mockResolvedValue({ ok: true, pdf_base64: btoa("%PDF-1.5"), log: "", pages: 1, duration_ms: 312 });
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    fireEvent.click(screen.getByRole("button", { name: "Build PDF" }));
    const frame = await screen.findByTitle("Résumé PDF preview");
    expect(frame).toHaveAttribute("src", "blob:pdf");
    expect(mocked.compileResume).toHaveBeenCalledWith({ latex: "\\documentclass{article} classic" });
    expect(screen.getByText(/1 page · built in 312 ms/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download PDF" })).toHaveAttribute("download", "resume.pdf");
    expect(screen.getByRole("tab", { name: /PDF preview/ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows the compiler's own messages when the build fails", async () => {
    mocked.compileResume.mockResolvedValue({ ok: false, pdf_base64: null, log: "./main.tex:3: Undefined control sequence.", pages: null, duration_ms: 90 });
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    fireEvent.click(screen.getByRole("button", { name: "Build PDF" }));
    expect(await screen.findByText("The PDF could not be built.")).toBeInTheDocument();
    expect(screen.getByText("./main.tex:3: Undefined control sequence.")).toBeInTheDocument();
    expect(screen.queryByTitle("Résumé PDF preview")).not.toBeInTheDocument();
  });

  it("explains an unavailable compiler honestly, both before and after pressing Build", async () => {
    mocked.getResume.mockResolvedValue(resumeResponse({ compiler_available: false }));
    mocked.compileResume.mockRejectedValue(new ApiError("The LaTeX compiler is not available on this server.", "LATEX_UNAVAILABLE", 503));
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    fireEvent.click(screen.getByRole("tab", { name: /PDF preview/ }));
    expect(screen.getByText(/no LaTeX compiler configured/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/LaTeX compiler/);
  });

  it("asks before replacing the editor with a template", async () => {
    mocked.getResume.mockResolvedValue(resumeResponse({ document: saved(), ats: ats() }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderAt("/resume");
    const editor = await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    const picker = screen.getByLabelText("Start from a template");
    fireEvent.change(picker, { target: { value: "compact" } });
    expect(editor).toHaveValue("\\section{Skills} saved text"); // declined
    fireEvent.change(picker, { target: { value: "compact" } });
    expect(editor).toHaveValue("\\documentclass{article} compact"); // accepted
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("saves first, then opens the mentor with the résumé context on", async () => {
    mocked.saveResume.mockResolvedValue(resumeResponse({ document: saved("\\documentclass{article} classic"), ats: ats() }));
    mocked.mentorChat.mockResolvedValue({} as MentorChatResponse);
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    fireEvent.click(screen.getByRole("button", { name: "Save and ask the AI mentor" }));
    await waitFor(() => expect(mocked.saveResume).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Résumé context is on/)).toBeInTheDocument();
    expect((screen.getByLabelText("Your message") as HTMLTextAreaElement).value).toContain("three changes that would raise my ATS score");
  });

  it("does not leave the page when saving fails", async () => {
    mocked.saveResume.mockRejectedValue(new ApiError("The résumé is empty.", "BAD_REQUEST", 400));
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    fireEvent.click(screen.getByRole("button", { name: "Save and ask the AI mentor" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/Résumé context is on/)).not.toBeInTheDocument();
  });

  it("blocks saving and building a résumé over the size limit", async () => {
    mocked.getResume.mockResolvedValue(resumeResponse({ max_bytes: 20 }));
    renderAt("/resume");
    await screen.findByLabelText("LaTeX source", { selector: "textarea" });
    expect(screen.getByText(/too large to save or build/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("shows a retryable error when the page cannot load", async () => {
    mocked.getResume.mockRejectedValueOnce(new ApiError("down", "INTERNAL", 500));
    renderAt("/resume");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByLabelText("LaTeX source", { selector: "textarea" })).toBeInTheDocument();
  });
});

describe("the AI mentor with the résumé context", () => {
  const reply = (over: Partial<MentorChatResponse> = {}): MentorChatResponse => ({
    conversation: { id: "conv_aaaaaaaaaaaaaaaaaaaaaaaa", title: "t", mode: "placement_mentor", message_count: 2, hint_level: 0, created_at: "x", updated_at: "x" },
    reply: { id: "m", role: "assistant", content: "Start by adding numbers to your bullets.", at: "x" },
    memory_saved: [],
    persistence: { conversation: "saved", memory: "none" },
    references: [],
    analytics_note: null,
    degraded: false,
    mock: false,
    ...over,
  });

  it("opens with the context on, offers three starters, sends the flag, and tells the student what was used", async () => {
    mocked.mentorChat.mockResolvedValue(reply({ resume_context: { used: true, score: 72, updated_at: "2026-10-20T09:00:00.000Z" } }));
    renderAt("/mentor?resume=1&prompt=Review%20my%20resume");
    expect(await screen.findByText(/Résumé context is on/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("Review my resume");
    expect(screen.getAllByRole("button", { name: /raise my ATS score|weakest bullets|keywords for my target role/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalled());
    expect(mocked.mentorChat.mock.calls[0]![0]).toMatchObject({ mode: "placement_mentor", resume_context: true, message: "Review my resume" });
    expect(await screen.findByText(/used your saved résumé and its UNBLUFF ATS score \(72\/100, a heuristic estimate/)).toBeInTheDocument();
  });

  it("says plainly when no résumé was saved", async () => {
    mocked.mentorChat.mockResolvedValue(reply({ resume_context: { used: false, score: null, updated_at: null } }));
    renderAt("/mentor?resume=1&prompt=Review%20my%20resume");
    await screen.findByText(/Résumé context is on/);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/You have not saved a résumé, so the mentor had none to use/)).toBeInTheDocument();
  });

  it("does not send the flag on an ordinary mentor page", async () => {
    mocked.mentorChat.mockResolvedValue(reply());
    renderAt("/mentor");
    fireEvent.change(await screen.findByLabelText("Your message"), { target: { value: "Explain two pointers" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(mocked.mentorChat).toHaveBeenCalled());
    expect(mocked.mentorChat.mock.calls[0]![0].resume_context).toBeUndefined();
  });
});
