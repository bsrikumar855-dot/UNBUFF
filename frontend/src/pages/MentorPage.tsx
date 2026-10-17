import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { MODES, newClientMessageId, PROVENANCE_LABEL } from "@/lib/mentor";
import { routes } from "@/lib/routes";
import type {
  MentorChatResponse,
  MentorConversationSummary,
  MentorMessage,
  MentorMode,
  MentorReference,
} from "@/types/contract";

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

/** The AI mentor: chat, graduated hints, history, and honest notices about what was (not) remembered. */
const MentorPage: React.FC = () => {
  const [params] = useSearchParams();
  const questionId = params.get("question");

  const [mode, setMode] = useState<MentorMode>("dsa_coach");
  const [conversations, setConversations] = useState<MentorConversationSummary[] | null>(
    null
  );
  const [listError, setListError] = useState<unknown>(null);
  const [active, setActive] = useState<MentorConversationSummary | null>(null);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [notice, setNotice] = useState<MentorChatResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState<Pending | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [showList, setShowList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [questionTitle, setQuestionTitle] = useState<string | null>(null);
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
      });
      setMessages((m) => [...m, res.reply]);
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
      setMessages(c.messages);
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
    setMessages([]);
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

  const rateLimited = error instanceof ApiError && error.code === "RATE_LIMITED";

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside aria-label="Conversations" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" onClick={startNew}>
            New conversation
          </Button>
          <button
            type="button"
            className="text-sm text-primary underline lg:hidden"
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
                    className={`min-w-0 flex-1 truncate rounded-md border px-3 py-2 text-left text-sm ${active?.id === c.id ? "border-primary bg-primary-soft text-primary-dark" : "border-line bg-white text-ink-primary hover:bg-surface-100"}`}
                  >
                    {c.title}
                  </button>
                  {confirmDelete === c.id ? (
                    <>
                      <Button
                        variant="secondary"
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
        <Link to={routes.mentorMemory} className="text-sm text-primary underline">
          What does the mentor remember? Manage memory
        </Link>
      </aside>

      <section aria-label="Mentor chat" className="flex min-w-0 flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary">AI Mentor</h1>
          <p className="text-sm text-ink-secondary">
            Ask about DSA, your code, interviews or your preparation plan. The mentor can
            make mistakes, so check important facts.
          </p>
        </div>

        <div role="radiogroup" aria-label="Mentor mode" className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              title={m.hint}
              onClick={() => setMode(m.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${mode === m.value ? "border-primary bg-primary-soft text-primary-dark" : "border-line-strong bg-white text-ink-primary hover:bg-surface-100"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-muted">
          {MODES.find((m) => m.value === mode)?.hint}
        </p>
        {questionId && (
          <p className="text-sm text-ink-secondary">
            Discussing question:{" "}
            <Link to={routes.dsaQuestion(questionId)} className="text-primary underline">
              {questionTitle ?? questionId}
            </Link>
          </p>
        )}

        {loadingConversation && <LoadingState message="Loading conversation…" />}
        <div
          role="log"
          aria-label="Conversation"
          aria-live="polite"
          aria-relevant="additions"
          className="flex min-h-[16rem] flex-col gap-3 rounded-lg border border-line bg-white p-4"
        >
          {messages.length === 0 && !loadingConversation && (
            <div className="text-sm text-ink-secondary">
              <p className="mb-2">Start a conversation. For example:</p>
              <ul className="flex flex-col gap-1">
                {STARTERS[mode].map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="text-left text-primary underline"
                      onClick={() => setDraft(s)}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[48rem] rounded-md p-3 text-sm ${m.role === "user" ? "self-end bg-primary-soft text-ink-primary" : "self-start bg-surface-100 text-ink-primary"}`}
            >
              <p className="mb-1 text-xs font-medium text-ink-muted">
                {m.role === "user" ? "You" : "Mentor"}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          ))}
          {sending && <LoadingState message="The mentor is thinking…" />}
        </div>

        {error !== null && (
          <div
            role="alert"
            className="rounded-md border border-line bg-white p-3 text-sm"
          >
            <ErrorState error={error} />
            {rateLimited && (
              <p className="mt-1 text-ink-secondary">
                You are sending messages quickly. Wait a moment, then retry.
              </p>
            )}
            {retry && (
              <Button
                variant="secondary"
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

        {notice && <MentorNotices notice={notice} />}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="mentor-input" className="text-sm font-medium text-ink-primary">
            Your message
          </label>
          <textarea
            id="mentor-input"
            ref={input}
            rows={4}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full rounded-md border border-line-strong bg-white px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-muted">
              Enter to send, Shift+Enter for a new line · {draft.length}/2000
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={sending}
                onClick={() => submit("hint")}
              >
                Give me a hint
              </Button>
              <Button
                type="button"
                variant="secondary"
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
      <p
        role="note"
        className="rounded-md border border-line bg-white p-2 text-ink-secondary"
      >
        Mock mentor: this answer came from a built-in stand-in, not a live AI model.
      </p>
    )}
    {notice.degraded && (
      <p
        role="alert"
        className="rounded-md border border-verdict-bluff-fg bg-white p-2 text-ink-primary"
      >
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
      <p
        role="note"
        className="rounded-md border border-line bg-white p-2 text-ink-secondary"
      >
        {notice.analytics_note}
      </p>
    )}
    {notice.github_context?.used && (
      <p
        role="note"
        className="rounded-md border border-line bg-white p-2 text-ink-secondary"
      >
        This answer used a short summary of your saved public GitHub data (synchronised{" "}
        {new Date(notice.github_context.synced_at ?? "").toLocaleString()}
        {notice.github_context.stale ? ", may be out of date" : ""}). It is partial
        evidence, not a skill score.
      </p>
    )}
    {notice.memory_saved.length > 0 && (
      <div className="rounded-md border border-line bg-white p-2">
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
        <Link to={routes.mentorMemory} className="text-xs text-primary underline">
          Review or delete
        </Link>
      </div>
    )}
    {notice.references.length > 0 && (
      <div className="rounded-md border border-line bg-white p-2">
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
                  className="text-primary underline"
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
