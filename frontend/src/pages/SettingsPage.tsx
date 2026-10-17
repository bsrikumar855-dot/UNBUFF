import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GithubConnectionPanel } from "@/components/github/GithubConnectionPanel";
import { CALLBACK_REASON_COPY, isCallbackReason } from "@/lib/github";
import { routes } from "@/lib/routes";

type Returned = { kind: "connected" } | { kind: "error"; message: string } | null;

/** Settings: connected accounts and a pointer to mentor memory. GitHub returns the browser here after authorising. */
const SettingsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [returned, setReturned] = useState<Returned>(null);
  const [autoSync, setAutoSync] = useState(false);

  useEffect(() => {
    const g = params.get("github");
    if (!g) return;
    if (g === "connected") {
      setReturned({ kind: "connected" });
      setAutoSync(true);
    } else if (g === "error") {
      const reason = params.get("reason");
      setReturned({
        kind: "error",
        message: isCallbackReason(reason)
          ? CALLBACK_REASON_COPY[reason]
          : "GitHub could not be connected. Try again.",
      });
    }
    setParams({}, { replace: true }); // keep nothing about the round trip in the address bar
  }, [params, setParams]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-primary">Settings</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Connected accounts and the data UNBLUFF keeps about you.
      </p>

      {returned?.kind === "connected" && (
        <p
          role="status"
          className="mt-4 rounded-md border border-line bg-surface-50 p-3 text-sm text-ink-primary"
        >
          GitHub is connected. Fetching your public activity now.
        </p>
      )}
      {returned?.kind === "error" && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-line bg-surface-50 p-3 text-sm text-ink-primary"
        >
          {returned.message}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <GithubConnectionPanel autoSync={autoSync} />
        <p className="text-sm text-ink-secondary">
          <Link to={routes.github} className="underline">
            Open GitHub insights
          </Link>
          {" · "}
          <Link to={routes.mentorMemory} className="underline">
            AI mentor memory
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SettingsPage;
