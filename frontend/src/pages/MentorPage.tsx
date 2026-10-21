import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import { Button } from "@/components/ui/button";
import { m } from "motion/react";
import { canObserve } from "@/components/motion/ease";
import { DUR, RISE, settle } from "@/components/motion/tokens";
import { Thinking } from "@/components/motion/Thinking";
import { useNewIds } from "@/components/motion/useNewIds";
import { ErrorState } from "@/components/ui/ErrorState";
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

/** Renders a message: plain paragraphs, and fenced code blocks as scrollable monospace blocks (text only, never HTML). */
const MessageBody: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g);
  return (
    <div className="space-y-3">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            aria-label="Code"
            className="overflow-x-auto border border-line bg-surface-50 p-3 font-mono text-[13px] leading-relaxed text-ink-primary"
          >
            <code>{part.replace(/\n$/, "")}</code>
          </pre>
        ) : part.trim() === "" ? null : (
          <p key={i} className="whitespace-pre-wrap wrap-break-word">
            {part.replace(/^\n+|\n+$/g, "")}
          </p>
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
      className="mt-3 max-w-2xl border-l-2 border-redline pl-3 text-sm text-ink-primary"
    >
      <span className="font-semibold">Mock mode.</span> This server answers with a
      built-in stand-in, not an AI model. Nothing you read here comes from Gemini.
    </p>
  ) : (
    <p
      role="note"
      className="mt-3 max-w-2xl border-l-2 border-verified pl-3 text-sm text-ink-secondary"
    >
      <span className="font-semibold text-ink-primary">Live model.</span> Answers come
      from {engine.model ?? "the AI model"} through the UNBLUFF server.
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

  return (
    <div className="grid lg:h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside
        aria-label="Conversations"
        className="flex min-h-0 flex-col gap-3 border-b border-line bg-surface px-4 py-4 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-5"
      >
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" onClick={startNew}>
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
        <div
          id="conversation-list"
          className={`${showList ? "block" : "hidden"} lg:block`}
        >
          {listError !== null && (
            <ErrorState error={listError} onRetry={() => void loadList()} />
          )}
          {listError === null && conversations === null && (
            <LoadingState message="Loading conversations…" />
          )}
          {conversations && conversations.length === 0 && (
            <p className="text-sm text-ink-secondary">No conversations yet.</p>
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
                      "min-h-10 min-w-0 flex-1 truncate border-l-2 px-3 py-2 text-left text-sm transition-colors",
                      active?.id === c.id
                        ? "border-redline bg-surface-100 font-semibold text-ink-primary"
                        : "border-transparent text-ink-secondary hover:bg-surface-100/70 hover:text-ink-primary"
                    )}
                  >
                    {c.title}
                  </button>
                  {confirmDelete === c.id ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void removeConversation(c.id)}
                      >
                        Confirm delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
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
        <Link
          to={routes.mentorMemory}
          className="text-sm text-redline underline underline-offset-4"
        >
          What does the mentor remember? Manage memory
        </Link>
      </aside>

      <section aria-label="Mentor chat" className="flex min-h-0 min-w-0 flex-col">
        <div className="border-b border-line px-4 pb-3 pt-5 sm:px-8">
          <p className="eyebrow mb-1 text-redline">Learn</p>
          <h1 className="serif text-title font-medium text-ink-primary">AI Mentor</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
            Ask about DSA, your code, interviews or your preparation plan. The mentor can
            make mistakes, so check important facts.
          </p>
          <MentorEngineNote />
          {careerContext && (
            <p
              role="note"
              className="mt-3 max-w-2xl border-l-2 border-line-strong pl-3 text-sm text-ink-secondary"
            >
              <span className="font-semibold text-ink-primary">
                Career context is on.
              </span>{" "}
              The mentor sees your best-matching listings, with scores the app computed,
              and your saved and applied jobs. It cannot see job descriptions, and it can
              only discuss listings it was given.
            </p>
          )}

          {resumeContext && (
            <p
              role="note"
              className="mt-3 max-w-2xl border-l-2 border-line-strong pl-3 text-sm text-ink-secondary"
            >
              <span className="font-semibold text-ink-primary">Résumé context is on.</span>{" "}
              The mentor reads your saved résumé and its UNBLUFF ATS score, a heuristic
              estimate and not any employer&apos;s system. It will mark rewritten bullets
              as suggestions and will not invent numbers or experience for you.
            </p>
          )}

          {leetcodeContext && (
            <p
              role="note"
              className="mt-3 max-w-2xl border-l-2 border-line-strong pl-3 text-sm text-ink-secondary"
            >
              <span className="font-semibold text-ink-primary">
                LeetCode context is on.
              </span>{" "}
              The mentor sees a short summary of the numbers you imported, labelled as
              supplied by you and dated. It cannot see your LeetCode account, and it will
              not treat the numbers as live or as proof of problem-solving ability.
            </p>
          )}

          <div
            role="radiogroup"
            aria-label="Mentor mode"
            className="mt-4 flex flex-wrap gap-2"
          >
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                title={m.hint}
                onClick={() => setMode(m.value)}
                className={cn(
                  "min-h-10 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === m.value
                    ? "border-ink-primary bg-ink-primary text-surface-50"
                    : "border-line-strong bg-surface text-ink-primary hover:border-ink-primary"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {MODES.find((m) => m.value === mode)?.hint}
          </p>
        </div>
        {questionId && (
          <p className="border-b border-line bg-surface-100/60 px-4 py-2 text-sm text-ink-secondary sm:px-8">
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
          <details className="border-b border-line bg-surface-100/60 px-4 py-3 sm:px-8" open={problemDraft.length > 0 || undefined}>
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
              className="mt-1 w-full resize-y rounded-md border border-line-strong bg-surface-50 px-3 py-2 text-[15px] leading-relaxed"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-ink-muted">
                {problemDraft.trim().length}/{PROBLEM_MAX}. The mentor explains it first, then gives hints; the full solution unlocks after 2 hints.
              </span>
              <Button
                type="button"
                size="sm"
                disabled={sending || !problemUsable}
                onClick={() => void send({ clientMessageId: newClientMessageId(), message: EXPLAIN_PROBLEM })}
              >
                Explain this problem
              </Button>
            </div>
          </details>
        )}
        {problem && (
          <details className="border-b border-line bg-surface-100/60 px-4 py-2 text-sm sm:px-8">
            <summary className="cursor-pointer font-medium text-ink-primary">The problem you pasted</summary>
            <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap wrap-break-word text-ink-secondary">{problem}</p>
          </details>
        )}

        {loadingConversation && (
          <LoadingState className="px-4 py-3 sm:px-8" message="Loading conversation…" />
        )}
        <div
          key={view}
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-relevant="additions"
          className="flex min-h-72 flex-1 flex-col gap-6 overflow-y-auto px-4 py-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 sm:px-8 lg:min-h-0"
        >
          {messages.length === 0 && !loadingConversation && (
            <div className="max-w-xl text-sm text-ink-secondary">
              <p className="eyebrow mb-3">Start a conversation. For example:</p>
              <ul className="flex flex-col gap-1">
                {(careerContext ? CAREER_STARTERS : leetcodeContext ? LEETCODE_STARTERS : resumeContext ? RESUME_STARTERS : STARTERS[mode]).map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="min-h-10 text-left text-[15px] text-ink-primary underline decoration-line-strong underline-offset-4 hover:decoration-redline"
                      onClick={() => setDraft(s)}
                    >
                      {s}
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
                "max-w-184 text-[15.5px] leading-relaxed",
                msg.role === "user"
                  ? "self-end border-l-2 border-ink-primary bg-surface-100 px-4 py-3"
                  : "self-start"
              )}
            >
              <p className="eyebrow mb-1">{msg.role === "user" ? "You" : "Mentor"}</p>
              <MessageBody text={msg.content} />
            </m.div>
          ))}
          {sending && <Thinking message="The mentor is thinking…" />}
        </div>

        {error !== null && (
          <div className="mx-4 mb-3 border-l-2 border-redline bg-surface-100/60 p-3 text-sm sm:mx-8">
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
                className="mt-2"
                disabled={sending}
                onClick={() => void send(retry)}
              >
                Retry the same message
              </Button>
            )}
          </div>
        )}

        {notice && (
          <div className="px-4 pb-2 sm:px-8">
            <MentorNotices notice={notice} />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2 border-t border-line bg-surface px-4 py-3 sm:px-8"
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
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none rounded-md border border-line-strong bg-surface-50 px-3 py-2 text-[15px] leading-relaxed"
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
                disabled={sending}
                onClick={() => submit("hint")}
              >
                Give me a hint
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sending}
                onClick={() => submit("solution")}
              >
                Show solution
              </Button>
              <Button type="submit" size="sm" disabled={sending || draft.trim() === ""}>
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
      <p role="note" className="border-l-2 border-line-strong pl-3 text-ink-secondary">
        Mock mentor: this answer came from a built-in stand-in, not a live AI model.
      </p>
    )}
    {notice.degraded && (
      <p role="alert" className="border-l-2 border-redline pl-3 text-ink-primary">
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
      <p role="note" className="border-l-2 border-line-strong pl-3 text-ink-secondary">
        {notice.analytics_note}
      </p>
    )}
    {notice.github_context?.used && (
      <p role="note" className="border-l-2 border-line-strong pl-3 text-ink-secondary">
        This answer used a short summary of your saved public GitHub data (synchronised{" "}
        {new Date(notice.github_context.synced_at ?? "").toLocaleString()}
        {notice.github_context.stale ? ", may be out of date" : ""}). It is partial
        evidence, not a skill score.
      </p>
    )}
    {notice.resume_context && (
      <p role="note" className="border-l-2 border-line-strong pl-3 text-ink-secondary">
        {notice.resume_context.used
          ? `This answer used your saved résumé and its UNBLUFF ATS score (${notice.resume_context.score ?? "unknown"}/100, a heuristic estimate, saved ${new Date(notice.resume_context.updated_at ?? "").toLocaleDateString()}).`
          : "You have not saved a résumé, so the mentor had none to use. Save one in the Résumé builder."}
      </p>
    )}
    {notice.leetcode_context && (
      <p role="note" className="border-l-2 border-line-strong pl-3 text-ink-secondary">
        {notice.leetcode_context.used
          ? `This answer used a short summary of the LeetCode numbers you imported (captured ${new Date(notice.leetcode_context.captured_at ?? "").toLocaleDateString()}${notice.leetcode_context.stale ? ", out of date" : ""}). They are your own supplied numbers: not live and not verified.`
          : "You have not imported any LeetCode numbers, so the mentor had none to use. Import your own on the LeetCode page."}
      </p>
    )}
    {notice.memory_saved.length > 0 && (
      <div className="border-l-2 border-line-strong pl-3">
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
      <div className="border-l-2 border-line-strong pl-3">
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
