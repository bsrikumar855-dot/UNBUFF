import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Code2,
  FileText,
  GraduationCap,
  Info,
  Lightbulb,
  MessagesSquare,
  Plus,
  SendHorizontal,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import { Button } from "@/components/ui/button";
import { InlineMarkdown } from "@/components/common/InlineMarkdown";
import { m } from "motion/react";
import { canObserve } from "@/components/motion/ease";
import { DUR, RISE, settle } from "@/components/motion/tokens";
import { Thinking } from "@/components/motion/Thinking";
import { useNewIds } from "@/components/motion/useNewIds";
import { ErrorState } from "@/components/ui/ErrorState";
import { GLASS, TILE } from "@/components/ui/GlassCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { LEETCODE_STARTERS } from "@/lib/leetcode";
import { RESUME_STARTERS } from "@/lib/resume";
import { MODES, newClientMessageId, PROVENANCE_LABEL } from "@/lib/mentor";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import type {
  HealthResponse,
  MentorChatResponse,
  MentorConversationSummary,
  MentorMessage,
  MentorMode,
  MentorReference,
} from "@/types/contract";

const MODE_ICON: Record<MentorMode, LucideIcon> = {
  dsa_coach: GraduationCap,
  code_explainer: Code2,
  interview_practice: Users,
  placement_mentor: Briefcase,
};

/** A round icon with a spark: the picture on every empty state. */
const Illustration: React.FC<{ icon: LucideIcon; size?: "sm" | "md" }> = ({
  icon: Icon,
  size = "md",
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "relative grid place-items-center rounded-full bg-white text-redline shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08),0_10px_22px_-12px_rgba(24,24,27,0.35)]",
      size === "md" ? "size-24" : "size-20"
    )}
  >
    <Icon size={size === "md" ? 40 : 32} strokeWidth={1.5} />
    <Sparkles size={16} className="absolute -right-1 top-2 text-redline/70" />
  </span>
);

/** A quiet notice on a glass tile, with an icon. */
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p role="note" className={cn(TILE, "flex items-start gap-3 px-4 py-3 text-sm text-ink-secondary")}>
    <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-muted" />
    <span className="min-w-0">{children}</span>
  </p>
);

/** Renders a message: light markdown (bold, code, lists), and fenced code blocks as scrollable monospace blocks (text only, never HTML). */
const MessageBody: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g);
  return (
    <div className="space-y-3">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            aria-label="Code"
            className="overflow-x-auto rounded-xl bg-white/80 p-3 font-mono text-[13px] leading-relaxed text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)]"
          >
            <code>{part.replace(/\n$/, "")}</code>
          </pre>
        ) : part.trim() === "" ? null : (
          <InlineMarkdown key={i} text={part.replace(/^\n+|\n+$/g, "")} className="[&>*:last-child]:mb-0" />
        )
      )}
    </div>
  );
};

const PROBLEM_MIN = 20;
const PROBLEM_MAX = 4000;
const EXPLAIN_PROBLEM = "Explain this problem in plain words with a small example. Do not give the approach or any code yet.";

interface Pending {
  clientMessageId: string;
  message: string;
  assist?: "hint" | "solution";
}

const STARTERS: Record<MentorMode, string[]> = {
  dsa_coach: [
    "Explain the two-pointer technique with an example.",
    "How do I know when to use dynamic programming?",
  ],
  code_explainer: [
    "Explain what this code does, line by line:",
    "Why might this loop run forever?",
  ],
  interview_practice: [
    "Ask me a technical interview question about arrays.",
    "Let's practise 'Tell me about yourself'.",
  ],
  placement_mentor: [
    "Help me plan my next two weeks of preparation.",
    "What should I revise first?",
  ],
};

/** Shown instead when the student arrives from Career: the questions the job-matching context exists to answer. */
const CAREER_STARTERS = [
  "Which internships fit my current skills?",
  "Which roles best match my placement goals?",
  "What are the most important missing skills across my strongest matches?",
  "What should I learn to qualify for these positions?",
  "Which opportunities should I prioritize applying to this week?",
];

/**
 * Says which engine this server uses for answers, read from the server's own health report. It is always visible, so a
 * mock deployment can never be mistaken for the real model. Nothing is shown if the server cannot be asked.
 */
const MentorEngineNote: React.FC = () => {
  const [engine, setEngine] = useState<HealthResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(api.getHealth())
      .then((h) => !cancelled && h && setEngine(h))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  if (!engine) return null;
  return engine.llm_mode === "mock" ? (
    <p
      role="note"
      className="flex items-start gap-3 rounded-2xl bg-redline-soft/60 px-4 py-3 text-sm text-ink-primary shadow-[inset_0_0_0_1px_rgba(179,41,26,0.18)]"
    >
      <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-redline" />
      <span>
        <span className="font-semibold">Mock mode.</span> This server answers with a
        built-in stand-in, not an AI model. Nothing you read here comes from Gemini.
      </span>
    </p>
  ) : (
    <p
      role="note"
      className={cn(TILE, "flex items-start gap-3 px-4 py-3 text-sm text-ink-secondary")}
    >
      <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-verified" />
      <span>
        <span className="font-semibold text-ink-primary">Live model.</span> Answers come
        from {engine.model ?? "the AI model"} through the UNBLUFF server.
      </span>
    </p>
  );
};

/** The AI mentor: chat, graduated hints, history, and honest notices about what was (not) remembered. */
const MentorPage: React.FC = () => {
  const [params] = useSearchParams();
  const questionId = params.get("question");

  const careerContext = params.get("career") === "1";
  const leetcodeContext = params.get("leetcode") === "1";
  const resumeContext = params.get("resume") === "1";
  const [mode, setMode] = useState<MentorMode>(
    careerContext || leetcodeContext || resumeContext ? "placement_mentor" : "dsa_coach"
  );
  const [conversations, setConversations] = useState<MentorConversationSummary[] | null>(
    null
  );
  const [listError, setListError] = useState<unknown>(null);
  const [active, setActive] = useState<MentorConversationSummary | null>(null);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [notice, setNotice] = useState<MentorChatResponse | null>(null);
  const [draft, setDraft] = useState(() => (params.get("prompt") ?? "").slice(0, 300));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState<Pending | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  // Bumped when the student opens a different conversation or starts a new one, which cross-fades the transcript.
  const [view, setView] = useState(0);
  const [showList, setShowList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState<string | null>(null);
  // A problem the student pasted: drafted before the first message, then kept (read-only) with the conversation.
  const [problemDraft, setProblemDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      setConversations((await api.listMentorConversations()).conversations);
    } catch (e) {
      setListError(e);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!questionId) {
      setQuestionTitle(null);
      return;
    }
    let cancelled = false;
    api
      .getQuestion(questionId)
      .then((q) => !cancelled && setQuestionTitle(q.question.title))
      .catch(() => !cancelled && setQuestionTitle(null));
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  const problemUsable = mode === "dsa_coach" && problemDraft.trim().length >= PROBLEM_MIN;

  const send = async (pending: Pending) => {
    setSending(true);
    setError(null);
    setRetry(null);
    setNotice(null);
    setMessages((m) =>
      m.some((x) => x.id === pending.clientMessageId)
        ? m
        : [
            ...m,
            {
              id: pending.clientMessageId,
              role: "user",
              content: pending.message,
              at: new Date().toISOString(),
            },
          ]
    );
    setDraft("");
    try {
      const res = await api.mentorChat({
        conversation_id: active?.id,
        mode,
        message: pending.message,
        client_message_id: pending.clientMessageId,
        assist: pending.assist,
        question_id: questionId ?? undefined,
        problem_text: !active && problemUsable ? problemDraft.trim() : undefined,
        career_context: careerContext || undefined,
        leetcode_context: leetcodeContext || undefined,
        resume_context: resumeContext || undefined,
      });
      setMessages((m) => [...m, res.reply]);
      if (!active && problemUsable) setProblem(problemDraft.trim());
      setActive(res.conversation);
      setNotice(res);
      void loadList();
    } catch (e) {
      setError(e);
      setRetry(pending);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  const submit = (assist?: "hint" | "solution") => {
    const text =
      draft.trim() ||
      (assist === "hint"
        ? "Please give me a hint."
        : assist === "solution"
          ? "Please show me the full solution."
          : "");
    if (!text || sending) return;
    void send({ clientMessageId: newClientMessageId(), message: text, assist });
  };

  const openConversation = async (id: string) => {
    setLoadingConversation(true);
    setError(null);
    setRetry(null);
    setNotice(null);
    try {
      const c = await api.getMentorConversation(id);
      setActive(c);
      setProblem(c.problem_text);
      setMessages(c.messages);
      setView((v) => v + 1);
      setMode(c.mode);
      setShowList(false);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingConversation(false);
    }
  };

  const startNew = () => {
    setActive(null);
    setProblem(null);
    setProblemDraft("");
    setMessages([]);
    setView((v) => v + 1);
    setNotice(null);
    setError(null);
    setRetry(null);
    setDraft("");
    setShowList(false);
    input.current?.focus();
  };

  const removeConversation = async (id: string) => {
    try {
      await api.deleteMentorConversation(id);
      setConfirmDelete(null);
      if (active?.id === id) startNew();
      void loadList();
    } catch (e) {
      setListError(e);
    }
  };

  const isNew = useNewIds(
    messages.map((x) => x.id),
    String(view),
    !loadingConversation
  );
  const animateMessages = canObserve();

  const rateLimited = error instanceof ApiError && error.code === "RATE_LIMITED";

  const startersFor = careerContext
    ? CAREER_STARTERS
    : leetcodeContext
      ? LEETCODE_STARTERS
      : resumeContext
        ? RESUME_STARTERS
        : STARTERS[mode];
  const pill = "rounded-full";

  return (
    <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:h-dvh lg:flex-row lg:pl-5 lg:pr-6">
      <aside
        aria-label="Conversations"
        className={cn(GLASS, "flex shrink-0 flex-col gap-4 p-4 lg:w-72 lg:overflow-y-auto")}
      >
        <div className="flex items-center justify-between gap-2">
          <Button className={cn(pill, "flex-1")} onClick={startNew}>
            <Plus aria-hidden="true" />
            New conversation
          </Button>
          <button
            type="button"
            className="min-h-10 text-sm text-redline underline underline-offset-4 lg:hidden"
            aria-expanded={showList}
            aria-controls="conversation-list"
            onClick={() => setShowList((v) => !v)}
          >
            {showList ? "Hide history" : "History"}
          </button>
        </div>
        <div id="conversation-list" className={`${showList ? "block" : "hidden"} lg:block`}>
          {listError !== null && (
            <ErrorState error={listError} onRetry={() => void loadList()} />
          )}
          {listError === null && conversations === null && (
            <LoadingState message="Loading conversations…" />
          )}
          {conversations && conversations.length === 0 && (
            <div className="flex flex-col items-center px-2 py-6 text-center">
              <Illustration icon={FileText} size="sm" />
              <p className="mt-4 font-semibold text-ink-primary">No conversations yet.</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Start a new conversation with the AI mentor.
              </p>
            </div>
          )}
          {conversations && conversations.length > 0 && (
            <ul className="flex flex-col gap-1">
              {conversations.map((c) => (
                <li key={c.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    aria-current={active?.id === c.id ? "true" : undefined}
                    className={cn(
                      "min-h-10 min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      active?.id === c.id
                        ? "bg-white font-semibold text-ink-primary shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
                        : "text-ink-secondary hover:bg-white/70 hover:text-ink-primary"
                    )}
                  >
                    {c.title}
                  </button>
                  {confirmDelete === c.id ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full bg-white/70"
                        onClick={() => void removeConversation(c.id)}
                      >
                        Confirm delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      aria-label={`Delete conversation ${c.title}`}
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <Link
            to={routes.mentorMemory}
            className="inline-flex items-center gap-1.5 text-redline underline underline-offset-4"
          >
            What does the mentor remember?
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <Link
            to={routes.mentorMemory}
            className="inline-flex items-center gap-1.5 text-redline underline underline-offset-4"
          >
            Manage memory
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </aside>

      <section
        aria-label="Mentor chat"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pt-1">
          <div className="min-w-0 max-w-3xl">
            <p className="eyebrow mb-1 text-redline">Learn</p>
            <h1 className="serif text-title font-medium text-ink-primary">
              AI <em>Mentor</em>
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
              Ask about DSA, your code, interviews or your preparation plan. The mentor can
              make mistakes, so check important facts.
            </p>
          </div>
          <div className={cn(GLASS, "hidden items-center gap-3 px-4 py-3 md:flex")}>
            <BookOpen size={22} strokeWidth={1.6} aria-hidden="true" className="text-redline" />
            <p className="text-xs leading-snug text-ink-secondary">
              Learn smarter
              <br />
              with AI guidance
            </p>
          </div>
        </header>

        <MentorEngineNote />
        {careerContext && (
          <Note>
            <span className="font-semibold text-ink-primary">Career context is on.</span>{" "}
            The mentor sees your best-matching listings, with scores the app computed, and
            your saved and applied jobs. It cannot see job descriptions, and it can only
            discuss listings it was given.
          </Note>
        )}
        {resumeContext && (
          <Note>
            <span className="font-semibold text-ink-primary">Résumé context is on.</span>{" "}
            The mentor reads your saved résumé and its UNBLUFF ATS score, a heuristic
            estimate and not any employer&apos;s system. It will mark rewritten bullets as
            suggestions and will not invent numbers or experience for you.
          </Note>
        )}
        {leetcodeContext && (
          <Note>
            <span className="font-semibold text-ink-primary">LeetCode context is on.</span>{" "}
            The mentor sees a short summary of the numbers you imported, labelled as
            supplied by you and dated. It cannot see your LeetCode account, and it will not
            treat the numbers as live or as proof of problem-solving ability.
          </Note>
        )}

        <div
          role="radiogroup"
          aria-label="Mentor mode"
          className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          {MODES.map((md) => {
            const Icon = MODE_ICON[md.value];
            const on = mode === md.value;
            return (
              <button
                key={md.value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={md.label}
                title={md.hint}
                onClick={() => setMode(md.value)}
                className={cn(
                  "flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
                  on
                    ? "bg-redline text-surface-50 shadow-[0_10px_22px_-12px_rgba(143,31,19,0.7)]"
                    : cn(TILE, "text-ink-primary hover:bg-white")
                )}
              >
                <Icon size={24} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0">
                  <span aria-hidden="true" className="serif block text-[15px] font-medium leading-tight">
                    {md.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 line-clamp-2 block text-xs leading-snug",
                      on ? "text-surface-50/85" : "text-ink-secondary"
                    )}
                  >
                    {md.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {questionId && (
          <p className={cn(TILE, "px-4 py-2.5 text-sm text-ink-secondary")}>
            Discussing question:{" "}
            <Link
              to={routes.dsaQuestion(questionId)}
              className="text-redline underline underline-offset-4"
            >
              {questionTitle ?? questionId}
            </Link>
          </p>
        )}

        {!active && mode === "dsa_coach" && !questionId && (
          <details
            className={cn(TILE, "px-4 py-3")}
            open={problemDraft.length > 0 || undefined}
          >
            <summary className="cursor-pointer text-sm font-medium text-ink-primary">
              Paste a problem to get help with it (optional)
            </summary>
            <label htmlFor="mentor-problem" className="eyebrow mt-3 block">
              Problem statement
            </label>
            <textarea
              id="mentor-problem"
              rows={6}
              maxLength={PROBLEM_MAX}
              value={problemDraft}
              onChange={(e) => setProblemDraft(e.target.value)}
              placeholder="Paste the whole problem: the statement, an example and the constraints."
              className="mt-1 w-full resize-y rounded-2xl border border-line-strong bg-white/70 px-3.5 py-2.5 text-[15px] leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-muted">
                {problemDraft.trim().length}/{PROBLEM_MAX}. The mentor explains it first,
                then gives hints; the full solution unlocks after 2 hints.
              </span>
              <Button
                type="button"
                size="sm"
                className={pill}
                disabled={sending || !problemUsable}
                onClick={() =>
                  void send({ clientMessageId: newClientMessageId(), message: EXPLAIN_PROBLEM })
                }
              >
                Explain this problem
              </Button>
            </div>
          </details>
        )}
        {problem && (
          <details className={cn(TILE, "px-4 py-2.5 text-sm")}>
            <summary className="cursor-pointer font-medium text-ink-primary">
              The problem you pasted
            </summary>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap wrap-break-word text-ink-secondary">
              {problem}
            </p>
          </details>
        )}

        <div className={cn(GLASS, "flex min-h-[26rem] flex-1 flex-col overflow-hidden lg:min-h-0")}>
          {loadingConversation && (
            <LoadingState className="px-5 py-3" message="Loading conversation…" />
          )}
          <div
            key={view}
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-relevant="additions"
            className="flex min-h-72 flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 sm:px-6 lg:min-h-0"
          >
            {messages.length === 0 && !loadingConversation && (
              <div className="m-auto flex w-full max-w-2xl flex-col items-center py-4 text-center">
                <Illustration icon={MessagesSquare} />
                <h2 className="serif mt-5 text-heading font-medium text-ink-primary">
                  What are you working on today?
                </h2>
                <p className="mt-1.5 text-sm text-ink-secondary">
                  Ask anything about DSA, your code, interviews or your preparation plan.
                </p>
                <p className="eyebrow mt-6">Start a conversation. For example:</p>
                <ul className="mt-3 grid w-full grid-cols-[minmax(0,1fr)] gap-3 text-left sm:grid-cols-2">
                  {startersFor.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        className={cn(
                          TILE,
                          "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-primary transition-colors hover:bg-white"
                        )}
                        onClick={() => setDraft(s)}
                      >
                        <FileText
                          size={18}
                          strokeWidth={1.6}
                          aria-hidden="true"
                          className="shrink-0 text-redline"
                        />
                        <span className="min-w-0 flex-1">{s}</span>
                        <ArrowRight
                          size={15}
                          aria-hidden="true"
                          className="shrink-0 text-redline"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {messages.map((msg) => (
              <m.div
                key={msg.id}
                initial={
                  animateMessages && isNew(msg.id)
                    ? msg.role === "user"
                      ? { opacity: 0, x: RISE.sm }
                      : { opacity: 0, y: RISE.sm }
                    : false
                }
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={settle(DUR.base)}
                className={cn(
                  "max-w-184 rounded-2xl px-4 py-3 text-[15.5px] leading-relaxed",
                  msg.role === "user"
                    ? "self-end bg-white shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)]"
                    : cn(TILE, "self-start")
                )}
              >
                <p className="eyebrow mb-1">{msg.role === "user" ? "You" : "Mentor"}</p>
                <MessageBody text={msg.content} />
              </m.div>
            ))}
            {sending && <Thinking message="The mentor is thinking…" />}
          </div>

          {error !== null && (
            <div
              className={cn(
                TILE,
                "mx-4 mb-3 p-3 text-sm shadow-[inset_0_0_0_1px_rgba(179,41,26,0.25)] sm:mx-6"
              )}
            >
              <ErrorState
                error={error}
                message={
                  error instanceof ApiError && error.code === "LLM_INVALID_OUTPUT"
                    ? "The mentor could not get an answer from the AI model, so nothing was saved. Retry the same message in a moment."
                    : undefined
                }
              />
              {rateLimited && (
                <p className="mt-1 text-ink-secondary">
                  You are sending messages quickly. Wait a moment, then retry.
                </p>
              )}
              {retry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 rounded-full bg-white/70"
                  disabled={sending}
                  onClick={() => void send(retry)}
                >
                  Retry the same message
                </Button>
              )}
            </div>
          )}

          {notice && (
            <div className="px-4 pb-2 sm:px-6">
              <MentorNotices notice={notice} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-2 border-t border-black/5 bg-white/40 px-4 py-3.5 sm:px-6"
          >
            <label htmlFor="mentor-input" className="eyebrow">
              Your message
            </label>
            <textarea
              id="mentor-input"
              ref={input}
              rows={3}
              maxLength={2000}
              value={draft}
              placeholder="Ask a question, paste code, or describe where you're stuck..."
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full resize-none rounded-2xl border border-line-strong bg-white/80 px-4 py-2.5 text-[15px] leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-muted">
                Enter to send, Shift+Enter for a new line · {draft.length}/2000
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white/70"
                  disabled={sending}
                  onClick={() => submit("hint")}
                >
                  <Lightbulb aria-hidden="true" />
                  Give me a hint
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white/70"
                  disabled={sending}
                  onClick={() => submit("solution")}
                >
                  <Sparkles aria-hidden="true" />
                  Show solution
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="rounded-full bg-redline text-surface-50 hover:bg-redline-dark"
                  disabled={sending || draft.trim() === ""}
                >
                  <SendHorizontal aria-hidden="true" />
                  {sending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
            {active && active.hint_level > 0 && (
              <p className="text-xs text-ink-muted">
                Hints used in this conversation: {active.hint_level} of 3. A full solution
                unlocks after 2 hints.
              </p>
            )}
          </form>
        </div>
      </section>
    </div>
  );
};

const RELATION_ORDER: MentorReference["relation"][] = [
  "verified_attempt",
  "revision_due",
  "verified_solved",
  "self_reported",
];

/** What happened to memory this turn, plus references taken from the application's own records. */
const MentorNotices: React.FC<{ notice: MentorChatResponse }> = ({ notice }) => (
  <div className="flex flex-col gap-2 text-sm" aria-label="Notes about this answer">
    {notice.mock && (
      <p role="note" className={cn(TILE, "px-4 py-2.5 text-ink-secondary")}>
        Mock mentor: this answer came from a built-in stand-in, not a live AI model.
      </p>
    )}
    {notice.degraded && (
      <p role="alert" className="rounded-2xl bg-redline-soft/60 px-4 py-2.5 text-ink-primary shadow-[inset_0_0_0_1px_rgba(179,41,26,0.18)]">
        The answer worked, but something could not be saved
        {notice.persistence.conversation === "failed"
          ? ": this exchange is not in your history"
          : ""}
        {notice.persistence.memory === "failed"
          ? ": nothing was remembered from this message"
          : ""}
        . Try again later if it matters.
      </p>
    )}
    {notice.analytics_note && (
      <p role="note" className={cn(TILE, "px-4 py-2.5 text-ink-secondary")}>
        {notice.analytics_note}
      </p>
    )}
    {notice.github_context?.used && (
      <p role="note" className={cn(TILE, "px-4 py-2.5 text-ink-secondary")}>
        This answer used a short summary of your saved public GitHub data (synchronised{" "}
        {new Date(notice.github_context.synced_at ?? "").toLocaleString()}
        {notice.github_context.stale ? ", may be out of date" : ""}). It is partial
        evidence, not a skill score.
      </p>
    )}
    {notice.resume_context && (
      <p role="note" className={cn(TILE, "px-4 py-2.5 text-ink-secondary")}>
        {notice.resume_context.used
          ? `This answer used your saved résumé and its UNBLUFF ATS score (${notice.resume_context.score ?? "unknown"}/100, a heuristic estimate, saved ${new Date(notice.resume_context.updated_at ?? "").toLocaleDateString()}).`
          : "You have not saved a résumé, so the mentor had none to use. Save one in the Résumé builder."}
      </p>
    )}
    {notice.leetcode_context && (
      <p role="note" className={cn(TILE, "px-4 py-2.5 text-ink-secondary")}>
        {notice.leetcode_context.used
          ? `This answer used a short summary of the LeetCode numbers you imported (captured ${new Date(notice.leetcode_context.captured_at ?? "").toLocaleDateString()}${notice.leetcode_context.stale ? ", out of date" : ""}). They are your own supplied numbers: not live and not verified.`
          : "You have not imported any LeetCode numbers, so the mentor had none to use. Import your own on the LeetCode page."}
      </p>
    )}
    {notice.memory_saved.length > 0 && (
      <div className={cn(TILE, "px-4 py-2.5")}>
        <p className="font-medium text-ink-primary">Saved to your mentor memory</p>
        <ul className="mt-1 list-disc pl-5 text-ink-secondary">
          {notice.memory_saved.map((m) => (
            <li key={m.id}>
              {m.content}{" "}
              <span className="text-xs text-ink-muted">
                ({PROVENANCE_LABEL[m.provenance]})
              </span>
            </li>
          ))}
        </ul>
        <Link
          to={routes.mentorMemory}
          className="text-xs text-redline underline underline-offset-4"
        >
          Review or delete
        </Link>
      </div>
    )}
    {notice.references.length > 0 && (
      <div className={cn(TILE, "px-4 py-2.5")}>
        <p className="font-medium text-ink-primary">Related practice from your records</p>
        <ul className="mt-1 flex flex-col gap-1">
          {[...notice.references]
            .sort(
              (a, b) =>
                RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation)
            )
            .map((r) => (
              <li key={`${r.question_id}-${r.relation}`}>
                <Link
                  to={routes.dsaQuestion(r.question_id)}
                  className="text-redline underline underline-offset-4"
                >
                  {r.title ?? r.question_id}
                </Link>
                <span className="text-ink-secondary"> · {r.label}</span>
              </li>
            ))}
        </ul>
      </div>
    )}
  </div>
);

export default MentorPage;
