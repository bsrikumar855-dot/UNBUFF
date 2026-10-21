import {
  BarChart3,
  Brain,
  Braces,
  Briefcase,
  CalendarCheck,
  Code2,
  Database,
  FilePenLine,
  FileSearch,
  FileText,
  Github,
  History,
  ListChecks,
  Map,
  MessagesSquare,
  Repeat,
  Settings,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { routes } from "@/lib/routes";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Short helper shown in the command palette. */
  hint: string;
  /** True when the current path belongs to this item. */
  match: (pathname: string) => boolean;
  /** Only shown once an interview audit session exists (its routes need a session id). */
  needsSession?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const is =
  (...prefixes: string[]) =>
  (p: string) =>
    prefixes.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * The product map. Every entry is a real, working route; legacy routes keep their paths and are only regrouped.
 * Session-scoped audit links (Ledger, Workspace, Report) appear only when a session exists.
 */
export function navGroups(sessionId: string | null): NavGroup[] {
  return [
    {
      id: "plan",
      label: "Plan",
      items: [
        {
          label: "Placement plan",
          to: routes.placement,
          icon: CalendarCheck,
          hint: "Today's tasks, weekly plan, evidence by skill",
          match: is("/placement"),
        },
        {
          label: "Career",
          to: routes.career,
          icon: Briefcase,
          hint: "Jobs and internships matched to your profile, saved jobs, applications",
          match: is("/career"),
        },
        {
          label: "Résumé builder",
          to: routes.resume,
          icon: FilePenLine,
          hint: "Write your résumé in LaTeX, build the PDF, check your ATS score",
          match: is("/resume"),
        },
      ],
    },
    {
      id: "practice",
      label: "Practice",
      items: [
        {
          label: "DSA Arena",
          to: routes.dsa,
          icon: Code2,
          hint: "Companies, topics and questions",
          match: (p) => p === "/dsa" || is("/dsa/questions", "/dsa/companies")(p),
        },
        {
          label: "My progress",
          to: routes.dsaProgress,
          icon: ListChecks,
          hint: "Bookmarks, notes and status",
          match: is("/dsa/progress"),
        },
        {
          label: "Analytics",
          to: routes.dsaAnalytics,
          icon: BarChart3,
          hint: "Judged-submission statistics",
          match: is("/dsa/analytics"),
        },
        {
          label: "Revision",
          to: routes.dsaRevision,
          icon: Repeat,
          hint: "Questions to come back to",
          match: is("/dsa/revision"),
        },
      ],
    },
    {
      id: "learn",
      label: "Learn",
      items: [
        {
          label: "AI Mentor",
          to: routes.mentor(),
          icon: MessagesSquare,
          hint: "Ask about DSA, code, interviews, your plan",
          match: (p) => p === "/mentor",
        },
        {
          label: "DSA patterns",
          to: routes.learnPatterns,
          icon: Braces,
          hint: "Two pointers, sliding window, DP: templates and problems",
          match: is("/learn/patterns"),
        },
        {
          label: "DBMS",
          to: routes.learnDbms,
          icon: Database,
          hint: "Notes, SQL examples and graded quizzes",
          match: is("/learn/dbms"),
        },
      ],
    },
    {
      id: "evidence",
      label: "Evidence",
      items: [
        {
          label: "Readiness audit",
          to: routes.setup,
          icon: FileSearch,
          hint: "Resume claims, interrogated",
          match: is("/setup"),
        },
        ...(sessionId
          ? [
              {
                label: "Ledger",
                to: routes.ledger,
                icon: FileText,
                hint: "Your confirmed claims",
                match: is("/ledger"),
                needsSession: true,
              },
              {
                label: "Interview workspace",
                to: routes.workspace(sessionId),
                icon: MessagesSquare,
                hint: "Answer the interrogation",
                match: is("/workspace"),
                needsSession: true,
              },
              {
                label: "Report",
                to: routes.report(sessionId),
                icon: FileText,
                hint: "Findings and next steps",
                match: (p: string) => is("/report")(p) && p !== routes.demoReport,
                needsSession: true,
              },
            ]
          : []),
        {
          label: "My sessions",
          to: routes.sessions,
          icon: History,
          hint: "Earlier audits",
          match: is("/sessions"),
        },
        {
          label: "GitHub",
          to: routes.github,
          icon: Github,
          hint: "Contribution calendar and repositories",
          match: is("/github"),
        },
        {
          label: "LeetCode",
          to: routes.leetcode,
          icon: Trophy,
          hint: "Link your profile and import your own progress numbers",
          match: is("/leetcode"),
        },
        {
          label: "Roadmap",
          to: routes.roadmap(sessionId),
          icon: Map,
          hint: "Learning roadmap",
          match: is("/roadmap"),
        },
      ],
    },
    {
      id: "account",
      label: "Account",
      items: [
        {
          label: "Mentor memory",
          to: routes.mentorMemory,
          icon: Brain,
          hint: "What the mentor remembers, and delete it",
          match: is("/mentor/memory"),
        },
        {
          label: "Settings",
          to: routes.settings,
          icon: Settings,
          hint: "Connected accounts and your data",
          match: is("/settings"),
        },
      ],
    },
  ];
}
