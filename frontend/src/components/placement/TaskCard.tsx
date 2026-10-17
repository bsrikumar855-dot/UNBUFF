import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { PRIORITY_LABEL, TASK_TYPE_LABEL } from "@/lib/placement";
import type { PlacementTask, PlacementTaskActionRequest } from "@/types/contract";

export interface TaskCardProps {
  task: PlacementTask;
  today: string;
  busy: boolean;
  onAction: (task: PlacementTask, body: PlacementTaskActionRequest) => void;
  /** Hide the controls (history lists). */
  readOnly?: boolean;
}

const field = "rounded-md border border-line-strong bg-white px-2 py-1 text-sm";

/** One task with why it is suggested, how it completes and the controls to act on it. */
export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  today,
  busy,
  onAction,
  readOnly = false,
}) => {
  const [mode, setMode] = useState<"none" | "move" | "skip">("none");
  const [date, setDate] = useState(task.due_date > today ? task.due_date : today);
  const [reason, setReason] = useState("");
  const open = task.status === "planned" || task.status === "in_progress";
  return (
    <li className="rounded-lg border border-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {TASK_TYPE_LABEL[task.type]} · {PRIORITY_LABEL(task.priority)} priority ·{" "}
            {task.estimated_minutes} min · due {task.due_date}
            {task.status === "in_progress" ? " · started" : ""}
            {task.status === "completed"
              ? ` · completed${task.completed_by === "verified_event" ? " (proved by your records)" : " (marked by you)"}`
              : ""}
            {task.status === "skipped" ? " · skipped" : ""}
          </p>
          <h4 className="mt-0.5 font-semibold text-ink-primary">{task.title}</h4>
        </div>
        {open && (
          <Link
            to={task.link}
            className="shrink-0 text-sm font-medium text-primary underline"
          >
            Open
          </Link>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-secondary">{task.description}</p>
      <p className="mt-1 text-sm text-ink-primary">
        <span className="font-medium">Why: </span>
        {task.reason}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Done when: {task.completion_criteria}{" "}
        {task.completion_check === "verified_event"
          ? "(checked automatically from your records)"
          : "(you mark it done)"}
      </p>
      {task.blocked && (
        <p className="mt-1 text-sm text-ink-primary">
          Waits for an earlier task to be done first.
        </p>
      )}
      {task.skip_reason && (
        <p className="mt-1 text-xs text-ink-muted">Skipped: {task.skip_reason}</p>
      )}

      {!readOnly && open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {task.status === "planned" && !task.blocked && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onAction(task, { action: "start" })}
            >
              Start
            </Button>
          )}
          {!task.blocked && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onAction(task, { action: "complete" })}
            >
              Mark done
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onAction(task, { action: "postpone", days: 1 })}
          >
            Postpone a day
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setMode(mode === "move" ? "none" : "move")}
          >
            Move…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setMode(mode === "skip" ? "none" : "skip")}
          >
            Skip…
          </Button>
        </div>
      )}
      {mode === "move" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-sm text-ink-secondary" htmlFor={`move-${task.id}`}>
            Move to
          </label>
          <input
            id={`move-${task.id}`}
            type="date"
            className={field}
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button
            size="sm"
            disabled={busy || date === ""}
            onClick={() => {
              onAction(task, { action: "reschedule", date });
              setMode("none");
            }}
          >
            Move task
          </Button>
        </div>
      )}
      {mode === "skip" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-sm text-ink-secondary" htmlFor={`skip-${task.id}`}>
            Why skip it?
          </label>
          <input
            id={`skip-${task.id}`}
            className={`${field} min-w-[12rem] flex-1`}
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            size="sm"
            disabled={busy || reason.trim().length < 3}
            onClick={() => {
              onAction(task, { action: "skip", reason: reason.trim() });
              setMode("none");
              setReason("");
            }}
          >
            Skip task
          </Button>
        </div>
      )}
    </li>
  );
};
