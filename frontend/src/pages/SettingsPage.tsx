import React, { useEffect, useState } from "react";
import { Brain, Github, Trophy } from "lucide-react";
import { TILE } from "@/components/ui/GlassCard";
import { Page, PageHeader } from "@/components/ui/Page";
import { buttonClasses } from "@/lib/buttonClasses";
import { cn } from "@/lib/cn";
import { Link, useSearchParams } from "react-router-dom";
import { GithubConnectionPanel } from "@/components/github/GithubConnectionPanel";
import { LeetCodeConnectionPanel } from "@/components/leetcode/LeetCodeConnectionPanel";
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
    <Page width="fluid" className="sm:px-5 lg:pl-5 lg:pr-6">
      <PageHeader
        eyebrow="Account"
        title={
          <>
            Your <em>settings</em>
          </>
        }
        description="Connected accounts and the data UNBLUFF keeps about you."
      />

      {returned?.kind === "connected" && (
        <p
          role="status"
          className={cn(TILE, "mb-4 px-4 py-3 text-sm text-ink-primary")}
        >
          GitHub is connected. Fetching your public activity now.
        </p>
      )}
      {returned?.kind === "error" && (
        <p
          role="alert"
          className="mb-4 rounded-2xl bg-redline-soft/60 px-4 py-3 text-sm text-ink-primary shadow-[inset_0_0_0_1px_rgba(179,41,26,0.18)]"
        >
          {returned.message}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
        <GithubConnectionPanel autoSync={autoSync} />
        <LeetCodeConnectionPanel showInsightsLink />
      </div>
      <p className="mt-5 flex flex-wrap items-center gap-2 text-sm">
        <Link to={routes.github} className={buttonClasses("secondary", "sm", "rounded-full bg-white/70")}>
          <Github aria-hidden="true" />
          Open GitHub insights
        </Link>
        <Link to={routes.leetcode} className={buttonClasses("secondary", "sm", "rounded-full bg-white/70")}>
          <Trophy aria-hidden="true" />
          LeetCode insights
        </Link>
        <Link to={routes.mentorMemory} className={buttonClasses("secondary", "sm", "rounded-full bg-white/70")}>
          <Brain aria-hidden="true" />
          AI mentor memory
        </Link>
      </p>
    </Page>
  );
};

export default SettingsPage;
