/**
 * Generates data/demo_report.json (and CONTRACT.md §7 + frontend/src/mocks/report.json) by running
 * the REAL AssessmentService + core with a scripted language layer. The mock is therefore always
 * shape-correct and its numbers are computed by the same code as live reports.
 *
 *   npx tsx scripts/build_demo_report.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pino } from "pino";
import type { Criterion, CriterionResult } from "../src/types.js";
import type { RawGrade } from "../src/core/rules.js";
import { CRITERIA } from "../src/core/evidence.js";
import { MockProvider } from "../src/llm/mock.js";
import type { ExtractedClaim, LLMProvider } from "../src/llm/provider.js";
import { AssessmentService } from "../src/services/assessment.js";
import { RoleRegistry } from "../src/services/roles.js";
import { MemoryStore } from "../src/store/memoryStore.js";

const ROOT = join(import.meta.dirname, "..");

export const DEMO_RESUME = `Priya Sharma - B.Tech Computer Science, 2026
Built a React e-commerce dashboard with Redux handling 10k+ products
Implemented REST API integration with Axios and JWT auth
Made the site fully responsive using CSS Grid and Flexbox
Wrote unit tests with Jest achieving 80% coverage
Used Git and GitHub for version control in a 4-member team
Optimized page load time by 40% using lazy loading and code splitting
Organised the college coding club hackathon for 200 students`;

const CLAIMS: ExtractedClaim[] = [
  { text: "Built a React e-commerce dashboard with Redux handling 10k+ products", resume_line: "Built a React e-commerce dashboard with Redux handling 10k+ products", skill_id: "react_state" },
  { text: "Implemented REST API integration with Axios and JWT auth", resume_line: "Implemented REST API integration with Axios and JWT auth", skill_id: "rest_apis" },
  { text: "Made the site fully responsive using CSS Grid and Flexbox", resume_line: "Made the site fully responsive using CSS Grid and Flexbox", skill_id: "responsive_css" },
  { text: "Wrote unit tests with Jest achieving 80% coverage", resume_line: "Wrote unit tests with Jest achieving 80% coverage", skill_id: "testing" },
  { text: "Used Git and GitHub for version control in a 4-member team", resume_line: "Used Git and GitHub for version control in a 4-member team", skill_id: "git" },
  { text: "Optimized page load time by 40% using lazy loading and code splitting", resume_line: "Optimized page load time by 40% using lazy loading and code splitting", skill_id: "js_fundamentals" },
  { text: "Organised the college coding club hackathon for 200 students", resume_line: "Organised the college coding club hackathon for 200 students", skill_id: null },
];

interface Step {
  question: string;
  answer: string;
  pass?: Criterion[]; // default: all
  quotes: Partial<Record<Criterion, string>>;
  missing?: Partial<Record<Criterion, string>>;
  gap?: boolean;
  vague?: boolean;
  rootCause?: string; // must be one of the skill's prerequisites (validated by core)
}

/** Scripted interview per claim text; each step is one question → answer → grade. */
const SCRIPT: Record<string, Step[]> = {
  [CLAIMS[0]!.text]: [
    {
      question: "In the dashboard, which Redux slices and React components did you personally write, and what data did each hold?",
      answer: "I wrote the products slice and the cart slice with Redux Toolkit, and the ProductTable and FilterBar components. The products slice held the paginated list of 10k items and the active filters.",
      quotes: {
        accuracy: "I wrote the products slice and the cart slice with Redux Toolkit",
        specificity: "the ProductTable and FilterBar components",
        mechanism: "The products slice held the paginated list of 10k items",
        ownership: "I wrote the products slice and the cart slice",
        tradeoff: "held the paginated list of 10k items and the active filters",
      },
    },
    {
      question: "When a user changes a filter in FilterBar, walk me through what happens from the dispatch to the table re-rendering.",
      answer: "React re-renders because hooks make the app faster and the virtual DOM caches everything, so only the changed rows update automatically.",
      pass: ["specificity", "ownership"],
      quotes: {
        accuracy: "hooks make the app faster and the virtual DOM caches everything",
        specificity: "only the changed rows update",
        ownership: "React re-renders because hooks make the app faster",
      },
      missing: {
        accuracy: "Reconciliation: the new element tree is diffed against the previous one; the virtual DOM is not a cache",
        mechanism: "How useSelector subscribes to the store and triggers a re-render when the selected value changes",
      },
      rootCause: "Reconciliation",
    },
  ],
  [CLAIMS[1]!.text]: [
    {
      question: "Which endpoints did you call with Axios, and what exactly did you implement for JWT auth?",
      answer: "I called GET /products, POST /cart and POST /auth/login. I wrote an Axios instance with a request interceptor that adds the Authorization Bearer token from memory.",
      quotes: {
        accuracy: "a request interceptor that adds the Authorization Bearer token",
        specificity: "GET /products, POST /cart and POST /auth/login",
        mechanism: "a request interceptor that adds the Authorization Bearer token from memory",
        ownership: "I wrote an Axios instance with a request interceptor",
        tradeoff: "adds the Authorization Bearer token from memory",
      },
    },
    {
      question: "What happens in your client when a request comes back 401 because the token expired?",
      answer: "The response interceptor catches the 401, calls POST /auth/refresh once, stores the new token, and replays the original request. If refresh also fails it clears the token and redirects to login.",
      quotes: {
        accuracy: "catches the 401, calls POST /auth/refresh once",
        specificity: "calls POST /auth/refresh once, stores the new token",
        mechanism: "stores the new token, and replays the original request",
        ownership: "The response interceptor catches the 401",
        tradeoff: "If refresh also fails it clears the token and redirects to login",
      },
    },
    {
      question: "Why keep the token in memory instead of localStorage, and what did that choice cost you?",
      answer: "localStorage is readable by any injected script, so an XSS bug would leak the token. Keeping it in memory with an httpOnly refresh cookie is safer, but the user is logged out on a hard refresh until the refresh call runs, which added a loading flash we had to handle.",
      quotes: {
        accuracy: "localStorage is readable by any injected script, so an XSS bug would leak the token",
        specificity: "Keeping it in memory with an httpOnly refresh cookie is safer",
        mechanism: "logged out on a hard refresh until the refresh call runs",
        ownership: "which added a loading flash we had to handle",
        tradeoff: "Keeping it in memory with an httpOnly refresh cookie is safer, but the user is logged out on a hard refresh",
      },
    },
  ],
  [CLAIMS[2]!.text]: [
    {
      question: "Which pages did you make responsive, and where did you use Grid versus Flexbox?",
      answer: "I did the product listing and checkout pages. The listing uses CSS Grid with repeat(auto-fill, minmax(220px, 1fr)) for the cards, and the header and checkout form rows use Flexbox.",
      quotes: {
        accuracy: "repeat(auto-fill, minmax(220px, 1fr)) for the cards",
        specificity: "CSS Grid with repeat(auto-fill, minmax(220px, 1fr))",
        mechanism: "The listing uses CSS Grid with repeat(auto-fill, minmax(220px, 1fr)) for the cards",
        ownership: "I did the product listing and checkout pages",
        tradeoff: "the header and checkout form rows use Flexbox",
      },
    },
    {
      question: "How does repeat(auto-fill, minmax(220px, 1fr)) decide how many columns to render at a given width?",
      answer: "The browser fits as many 220px tracks as the container allows, then the 1fr max shares the leftover space equally, so columns grow until another 220px track fits and the count jumps.",
      quotes: {
        accuracy: "fits as many 220px tracks as the container allows",
        specificity: "the 1fr max shares the leftover space equally",
        mechanism: "fits as many 220px tracks as the container allows, then the 1fr max shares the leftover space equally",
        ownership: "The browser fits as many 220px tracks",
        tradeoff: "columns grow until another 220px track fits",
      },
    },
    {
      question: "Why Grid for the card list instead of a Flexbox wrap layout, and what broke?",
      answer: "Grid was just easier I think, it looks better on mobile.",
      pass: ["specificity", "ownership"],
      quotes: { specificity: "it looks better on mobile", ownership: "Grid was just easier I think" },
      missing: {
        accuracy: "Grid aligns items in two dimensions; flex-wrap leaves an uneven last row",
        tradeoff: "Concrete trade-off between Grid and flex-wrap for card lists, and a real layout bug",
      },
      rootCause: "CSS Grid tracks & fr",
    },
  ],
  [CLAIMS[3]!.text]: [
    {
      question: "Which components or functions did you write Jest tests for, and what did the 80% coverage number measure?",
      answer: "The project template came with tests and a coverage report, and our coverage was 80% overall. I mostly ran npm test before pushing.",
      pass: ["specificity"],
      quotes: { specificity: "our coverage was 80% overall", accuracy: "The project template came with tests" },
      missing: {
        accuracy: "What line/branch coverage measures and what it doesn't",
        ownership: "Tests you personally wrote and what they asserted",
      },
      rootCause: "What coverage measures",
    },
  ],
  [CLAIMS[4]!.text]: [
    {
      question: "What was your team's Git workflow, and what did you personally do in it?",
      answer: "Each of us worked on a feature branch and opened a pull request to main. I reviewed PRs for the frontend folder and resolved conflicts in package.json twice.",
      quotes: {
        accuracy: "worked on a feature branch and opened a pull request to main",
        specificity: "resolved conflicts in package.json twice",
        mechanism: "opened a pull request to main",
        ownership: "I reviewed PRs for the frontend folder",
        tradeoff: "Each of us worked on a feature branch",
      },
    },
    {
      question: "When you resolved that package.json conflict, what did Git actually have to compare to decide it was a conflict?",
      answer: "Honestly I don't know how Git decides that internally, I just fixed the lines it marked.",
      gap: true,
      pass: [],
      quotes: {},
    },
  ],
  [CLAIMS[5]!.text]: [
    {
      question: "What exactly did you lazy load, and how did you measure the 40% improvement?",
      answer: "I made the pages load faster by lazy loading things.",
      vague: true,
      pass: ["accuracy"],
      quotes: { accuracy: "lazy loading things" },
      missing: {
        specificity: "Which routes or components were split, and the before/after numbers",
        ownership: "What you personally changed",
      },
    },
    {
      question: "Which routes or components did you split out, and what were the before and after numbers?",
      answer: "I wrapped the Reports and Admin routes in React.lazy with Suspense and moved the chart library into that chunk. Lighthouse showed the main bundle going from 1.1 MB to 640 kB and LCP from 4.2s to 2.5s, about 40%.",
      quotes: {
        accuracy: "wrapped the Reports and Admin routes in React.lazy with Suspense",
        specificity: "main bundle going from 1.1 MB to 640 kB and LCP from 4.2s to 2.5s",
        mechanism: "moved the chart library into that chunk",
        ownership: "I wrapped the Reports and Admin routes in React.lazy",
        tradeoff: "moved the chart library into that chunk",
      },
    },
    {
      question: "What happens at runtime between a user clicking the Reports link and the lazy component rendering?",
      answer: "React.lazy calls the dynamic import(), which makes the browser fetch the Reports chunk over the network. Until the promise resolves, the Suspense boundary shows the fallback spinner, then React renders the real component.",
      quotes: {
        accuracy: "React.lazy calls the dynamic import(), which makes the browser fetch the Reports chunk",
        specificity: "the Suspense boundary shows the fallback spinner",
        mechanism: "Until the promise resolves, the Suspense boundary shows the fallback spinner, then React renders the real component",
        ownership: "React.lazy calls the dynamic import()",
        tradeoff: "fetch the Reports chunk over the network",
      },
    },
    {
      question: "Why split by route rather than by component, and what went wrong after you shipped it?",
      answer: "Route splitting was what the tutorial did so I followed it. Nothing really went wrong.",
      pass: ["ownership"],
      quotes: { ownership: "Route splitting was what the tutorial did so I followed it" },
      missing: {
        accuracy: "Route vs component splitting: chunk count, waterfalls and cache reuse",
        tradeoff: "A real cost of code splitting, such as loading waterfalls or a spinner flash on navigation",
      },
      rootCause: "ES modules & dynamic import",
    },
  ],
};

/** Retest (fresh scenario) for the CSS claim, starting at the failed level 3. */
const RETEST: Step = {
  question: "A product manager asks for the card list to keep a perfectly aligned last row even with 7 items, and the design must also work in a 280px sidebar. Would you keep Grid or switch to flex-wrap, and what breaks with the other one?",
  answer: "Keep Grid. With flex-wrap and flex: 1 1 220px the last row of 7 items stretches its orphan cards wider than the rest, while Grid keeps every track the same width. In a 280px sidebar minmax(220px, 1fr) still fits one column, but I'd use minmax(min(220px, 100%), 1fr) so it never overflows below 220px.",
  quotes: {
    accuracy: "the last row of 7 items stretches its orphan cards wider than the rest, while Grid keeps every track the same width",
    specificity: "minmax(min(220px, 100%), 1fr)",
    mechanism: "Grid keeps every track the same width",
    ownership: "Keep Grid.",
    tradeoff: "With flex-wrap and flex: 1 1 220px the last row of 7 items stretches its orphan cards wider than the rest",
  },
};

const FIX: Record<string, { explanation: string; exercise: string }> = {
  responsive_css: {
    explanation:
      "Root cause: **CSS Grid tracks & fr**. `repeat(auto-fill, minmax(220px, 1fr))` creates equal-width **tracks**: every card in every row, including a half-empty last row, gets the same column width. `flex-wrap` has no columns: each row distributes its own free space, so with `flex: 1 1 220px` the orphan cards in the last row **stretch** wider than the rest. Use Grid when you need two-dimensional alignment and Flexbox for one-dimensional rows such as toolbars. Avoid Grid when item widths must follow their content.",
    exercise:
      "Build the same 7-card list twice: once with Grid `repeat(auto-fill, minmax(220px, 1fr))` and once with `display:flex; flex-wrap:wrap` and `flex: 1 1 220px`. Resize from 1200px to 280px and screenshot where they differ. Then fix the 280px overflow with `minmax(min(220px, 100%), 1fr)`.\n\n**Done when** you can explain the last-row difference and the overflow fix in two sentences each.",
  },
  react_state: {
    explanation:
      "The virtual DOM is **not a cache**. On `dispatch`, Redux runs the reducer and notifies subscribers; each `useSelector` re-runs its selector and compares the result with `===`. If it changed, that component **re-renders**: React calls it again, builds a new element tree, **diffs** it against the previous one (reconciliation, matching list rows by `key`) and **commits** only the changed DOM nodes. Hooks don't make anything faster; they're how components subscribe.",
    exercise:
      "Build a 50-row product table with a Redux filter. Add `console.count` in each row and use React DevTools \"Highlight updates\". Change the filter and explain which components re-rendered and why. Then memoize the row and select only what it needs.\n\n**Done when** changing the filter re-renders only the table and the rows whose data changed.",
  },
  testing: {
    explanation:
      "Coverage counts which **lines and branches ran** during tests, not whether behaviour is correct. A test isolates a unit by **rendering** it (e.g. Testing Library), **mocking** its dependencies such as `fetch`, and **asserting** on what the user sees. Owning a test means you can say what it asserts and which bug it would catch.",
    exercise:
      "Write 3 Vitest + Testing Library tests for a `<CartSummary>` component: empty cart, one item, and a failed price fetch (mock `fetch` to reject). Run coverage and find one covered line whose bug your tests would *not* catch.\n\n**Done when** all 3 pass and you can name that uncaught bug.",
  },
  git: {
    explanation:
      "A commit is a **snapshot plus a pointer to its parent(s)**. To merge, Git finds the **merge base** (common ancestor) and does a 3-way comparison: base vs yours vs theirs. If both sides changed the **same lines** differently, Git can't choose and writes conflict markers `<<<<<<<`, `=======`, `>>>>>>>`.",
    exercise:
      "In a scratch repo, create `main` and `feature`, edit the same line of `package.json` differently on each, then merge. Run `git merge-base main feature` and `git show :1:package.json` / `:2:` / `:3:` to see base, ours and theirs.\n\n**Done when** you can explain the conflict using those three versions.",
  },
  js_fundamentals: {
    explanation:
      "**Route-level** splitting gives few, large chunks that cache well and load once per page. **Component-level** splitting gives many small chunks but can create **waterfalls** (a chunk that imports another chunk) and spinner flashes during navigation. Mitigations are **prefetching** on hover or idle and grouping libraries shared by several routes.",
    exercise:
      "In a Vite app, lazy-load two routes that share a chart library. Build with `vite build` and inspect the chunk list. Then add `import()` prefetch on link hover and compare the Network waterfall.\n\n**Done when** you can show the chunk graph and explain one waterfall you removed.",
  },
};

const REWRITES: Record<string, string> = {
  react_state: "Built React + Redux Toolkit product and cart slices for a 10k-item dashboard (learning render/reconciliation internals)",
  testing: "Ran and maintained an existing Jest test suite (80% template coverage); writing my own component tests",
  git: "Used feature branches and pull requests in a 4-person team; reviewed PRs and resolved merge conflicts",
  js_fundamentals: "Cut main bundle from 1.1 MB to 640 kB with route-level React.lazy code splitting (LCP 4.2s → 2.5s)",
};

function grade(step: Step): RawGrade {
  const pass = step.pass ?? CRITERIA;
  const criteria = Object.fromEntries(
    CRITERIA.map((n): [Criterion, CriterionResult] => [
      n,
      { passed: pass.includes(n), evidence_quote: step.quotes[n] ?? null, missing_concept: pass.includes(n) ? null : (step.missing?.[n] ?? null) },
    ]),
  ) as Record<Criterion, CriterionResult>;
  return { criteria, admits_gap: step.gap ?? false, needs_clarification: step.vague ?? false, root_cause: step.rootCause ?? null };
}

/** Language layer that replays the script. All decisions still happen in core. */
class DemoProvider extends MockProvider implements LLMProvider {
  private readonly cursor = new Map<string, number>();
  private step(text: string): Step {
    const i = this.cursor.get(text) ?? 0;
    const step = SCRIPT[text]?.[i];
    if (!step) throw new Error(`No scripted step ${i} for "${text}"`);
    return step;
  }
  override async extractClaims() {
    return CLAIMS;
  }
  override async question({ claim }: Parameters<LLMProvider["question"]>[0]) {
    return this.step(claim.text).question;
  }
  override async clarify({ claim }: Parameters<LLMProvider["clarify"]>[0]) {
    return this.step(claim.text).question;
  }
  override async retestQuestion() {
    return RETEST.question;
  }
  override async grade({ claim, answer }: Parameters<LLMProvider["grade"]>[0]) {
    if (answer === RETEST.answer) return grade(RETEST);
    const step = this.step(claim.text);
    this.cursor.set(claim.text, (this.cursor.get(claim.text) ?? 0) + 1);
    return grade(step);
  }
  override async fixTask({ claim }: Parameters<LLMProvider["fixTask"]>[0]) {
    const task = FIX[claim.skill_id ?? ""];
    if (!task) throw new Error(`No scripted fix task for ${claim.id}`);
    return task;
  }
  override async rewrite({ claim }: Parameters<LLMProvider["rewrite"]>[0]) {
    return REWRITES[claim.skill_id ?? ""] ?? claim.text;
  }
}

export async function buildDemoReport() {
  const roles = RoleRegistry.fromDirectory(join(ROOT, "data", "roles"));
  let t = Date.parse("2026-09-26T09:00:00Z");
  const svc = new AssessmentService({
    store: new MemoryStore(),
    llm: new DemoProvider(),
    roles,
    logger: pino({ level: "silent" }),
    now: () => new Date((t += 23_000)),
  });

  const { session_id: sid, claims } = await svc.extract({
    role_id: "frontend_developer",
    resume_text: DEMO_RESUME,
    mode: "prepare",
  });
  const css = claims.find((c) => c.skill_id === "responsive_css")!;
  const react = claims.find((c) => c.skill_id === "react_state")!;
  for (const claim of claims.filter((c) => c.skill_id !== null)) {
    let res = await svc.interrogate({ session_id: sid, claim_id: claim.id });
    for (const step of SCRIPT[claim.text] ?? []) {
      if (res.turn === "done") break;
      res = await svc.interrogate({ session_id: sid, claim_id: claim.id, answer: step.answer });
    }
    // Prepare mode: teach_now after the CSS claim ends shaky, so the student opens its fix task.
    if (claim.id === css.id && res.teach_now) await svc.fixTask(sid, css.id);
    // A due retest takes priority over the next pending claim (after 2 interleaved claims).
    if (res.next_mode === "retest" && res.progress.next_claim_id === css.id) {
      await svc.interrogate({ session_id: sid, claim_id: css.id, mode: "retest" });
      await svc.interrogate({ session_id: sid, claim_id: css.id, answer: RETEST.answer });
    }
  }
  // Fix task opened for the React claim; CL-007 is still pending, so its retest stays scheduled.
  await svc.fixTask(sid, react.id);

  const report = await svc.report(sid);
  return { ...report, session_id: "s_demo" };
}

async function main() {
  const report = await buildDemoReport();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(ROOT, "data", "demo_report.json"), json);

  const frontendMock = join(ROOT, "..", "frontend", "src", "mocks");
  if (existsSync(frontendMock)) writeFileSync(join(frontendMock, "report.json"), json);

  const contractPath = join(ROOT, "..", "CONTRACT.md");
  const contract = readFileSync(contractPath, "utf8");
  const block = `<!-- MOCK_REPORT_START -->\n\`\`\`json\n${json}\`\`\`\n<!-- MOCK_REPORT_END -->`;
  const updated = contract.includes("<!-- MOCK_REPORT_START -->")
    ? contract.replace(/<!-- MOCK_REPORT_START -->[\s\S]*<!-- MOCK_REPORT_END -->/, block)
    : contract.replace("MOCK_REPORT_PLACEHOLDER", block);
  writeFileSync(contractPath, updated);

  console.log(
    `readiness=${report.readiness} coverage=${report.coverage} claims=${report.claims.length} ` +
      `verdicts=${report.claims.map((c) => `${c.id}:${c.verdict}`).join(",")}`,
  );
  for (const c of report.claims) {
    console.log(
      `  ${c.id} root_cause=${c.root_cause ?? "-"} retest_status=${c.retest_status} unlocks_after=${c.retest_unlocks_after ?? "-"}` +
        (c.retest ? ` retest=${JSON.stringify(c.retest)}` : ""),
    );
  }
}

if (process.argv[1]?.endsWith("build_demo_report.ts")) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
