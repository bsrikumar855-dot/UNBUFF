import type { AtsCheck, AtsResult, Role } from "../types.js";
import { parseResume, type ParsedResume } from "./latexText.js";

/**
 * A deterministic, explainable résumé score. It is a HEURISTIC built from widely published ATS guidance (parseable
 * text, standard section names, role keywords, measurable bullets). It is not any employer's system and cannot say
 * whether a particular ATS would accept or rank a résumé, so the result always carries a disclaimer. The same input
 * always gives the same score; no model is involved.
 */

export const ATS_DISCLAIMER =
  "A heuristic estimate from common ATS guidance, not any employer's real system. Use it to find fixes, not as a pass or fail prediction.";

const MAX = { contact: 10, sections: 15, keywords: 30, impact: 15, verbs: 10, length: 10, format: 10 } as const;

export interface AtsInput {
  latex: string;
  role?: Role | null;
  jobDescription?: string | null;
  now?: Date;
}

const STRONG_VERBS = new Set(
  (
    "built developed designed implemented created led managed delivered launched improved increased reduced optimized optimised " +
    "automated architected engineered deployed migrated refactored integrated analyzed analysed established streamlined " +
    "accelerated achieved authored coordinated mentored organized organised drove shipped scaled secured tested debugged " +
    "configured maintained monitored trained resolved collaborated presented researched simplified modernized modernised " +
    "wrote won initiated spearheaded generated extended consolidated enhanced owned introduced replaced rebuilt composed " +
    "evaluated validated prototyped contributed supported leveraged applied programmed produced published ranked secured"
  ).split(" "),
);
const WEAK_PHRASES = ["responsible for", "worked on", "helped with", "helped", "assisted with", "duties included", "involved in", "tasked with"];

const STOPWORDS = new Set(
  (
    "the and for with you your our are will have has this that from they their them his her its was were been being not but all any can may " +
    "who what when where which while into over under about also such than then there these those more most other some each per via etc " +
    "job role team work working experience years year strong ability skills skill required preferred plus including include use using used " +
    "good great excellent knowledge understanding responsibilities requirements qualifications candidate candidates company position " +
    "looking seeking join help new best well make making across within without should must able both either like"
  ).split(" "),
);

const SECTION_NAMES: Record<"education" | "experience" | "projects" | "skills", RegExp> = {
  education: /\b(education|academic|qualification)/i,
  experience: /\b(experience|employment|work history|internship|career)/i,
  projects: /\b(project|portfolio|open[- ]source)/i,
  skills: /\b(skill|technolog|tech stack|competenc|tools)/i,
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, term: string) => new RegExp(`(?<![A-Za-z0-9])${escapeRe(term)}(?![A-Za-z0-9])`, "i").test(text);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const statusOf = (score: number, max: number): AtsCheck["status"] => (score >= max * 0.8 ? "pass" : score >= max * 0.45 ? "warn" : "fail");

const check = (id: string, label: string, score: number, max: number, detail: string, fix: string | null): AtsCheck => {
  const s = round1(clamp(score, 0, max));
  const status = statusOf(s, max);
  return { id, label, score: s, max, status, detail, fix: status === "pass" ? null : fix };
};

/** Text left over from the starter templates. A résumé that still contains it has not been filled in. */
const PLACEHOLDER = /\b(?:Your Name|Your University|Company Name|Project Name)\b|you@example\.com|github\.com\/yourname|linkedin\.com\/in\/yourname|\+00 00000 00000/i;

function contactCheck(p: ParsedResume): AtsCheck {
  if (PLACEHOLDER.test(p.text)) {
    return check("contact", "Contact details", 2, MAX.contact, "The template's placeholder details are still in your résumé (for example “Your Name” or you@example.com).", "Replace every placeholder with your own name, email, phone and profile links.");
  }
  const email = p.emails.length > 0;
  const phone = p.phones.length > 0;
  const profile = p.links.some((l) => /github\.com|linkedin\.com|gitlab\.com|portfolio|\.dev\b|\.io\b/i.test(l)) || /github\.com|linkedin\.com/i.test(p.text);
  const score = (email ? 5 : 0) + (phone ? 3 : 0) + (profile ? 2 : 0);
  const have = [email && "email", phone && "phone", profile && "GitHub or LinkedIn link"].filter(Boolean).join(", ");
  const missing = [!email && "an email address", !phone && "a phone number", !profile && "a GitHub or LinkedIn link"].filter(Boolean);
  return check("contact", "Contact details", score, MAX.contact, have ? `Found: ${have}.` : "No contact details were found in the text.", missing.length ? `Add ${missing.join(", ")} near the top, as plain text.` : null);
}

function sectionsCheck(p: ParsedResume): AtsCheck {
  const names = p.sections.map((s) => s.name);
  const found = (re: RegExp) => names.some((n) => re.test(n));
  const education = found(SECTION_NAMES.education);
  const work = found(SECTION_NAMES.experience) || found(SECTION_NAMES.projects);
  const skills = found(SECTION_NAMES.skills);
  const score = (education ? 5 : 0) + (work ? 5 : 0) + (skills ? 5 : 0);
  const missing = [!education && "Education", !work && "Experience or Projects", !skills && "Skills"].filter(Boolean);
  return check(
    "sections",
    "Standard sections",
    score,
    MAX.sections,
    names.length ? `Sections found: ${names.join(", ")}.` : "No \\section headings were found.",
    missing.length ? `Add ${missing.join(", ")} with those exact, standard headings. ATS parsers look for them by name.` : null,
  );
}

/**
 * Technical terms worth matching, with the casing to show. A job description is mostly prose (places, perks, process),
 * so keywords are taken from this list first: telling a student to add the name of a city to their résumé would be wrong.
 */
const TECH_TERMS = [
  "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "Go", "Golang", "Rust", "Kotlin", "Swift", "PHP", "Ruby", "Scala", "R", "MATLAB", "Bash", "SQL", "NoSQL", "HTML", "CSS", "Sass", "GraphQL",
  "React", "Redux", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", ".NET", "Laravel", "Rails", "Tailwind", "Bootstrap", "jQuery", "Webpack", "Vite",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Oracle", "Elasticsearch", "Kafka", "RabbitMQ", "DynamoDB", "Firebase", "Firestore", "Supabase", "Cassandra", "Snowflake", "BigQuery", "Spark", "Hadoop", "Airflow", "dbt",
  "AWS", "Azure", "GCP", "Google Cloud", "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "GitHub Actions", "CI/CD", "Linux", "Nginx", "Serverless", "Lambda", "EC2", "S3", "Git", "GitHub", "GitLab", "Jira",
  "REST", "REST API", "REST APIs", "gRPC", "WebSocket", "Microservices", "OAuth", "JWT", "Agile", "Scrum", "TDD", "Unit testing", "Jest", "Pytest", "Cypress", "Selenium", "Playwright", "Testing Library", "Postman",
  "Machine learning", "Deep learning", "NLP", "Computer vision", "LLM", "LLMs", "RAG", "Generative AI", "Prompt engineering", "TensorFlow", "PyTorch", "scikit-learn", "Pandas", "NumPy", "OpenAI", "LangChain", "LangGraph", "CrewAI", "LlamaIndex", "Hugging Face", "MLOps", "Vector database", "Pinecone", "Weaviate", "pgvector", "Chroma", "Agentic AI", "AI agents",
  "Data structures", "Algorithms", "System design", "OOP", "Object-oriented", "Design patterns", "Distributed systems", "Cloud computing", "Cybersecurity", "DevOps", "Full-stack", "Frontend", "Backend", "Responsive design", "Accessibility", "WCAG", "ARIA", "Figma", "Tableau", "Power BI", "Excel", "ETL",
];
const TECH_BY_KEY = new Map(TECH_TERMS.map((t) => [t.toLowerCase(), t]));

/** Prose that appears in postings and says nothing about skills. */
const GENERIC = new Set(
  (
    "end front back platform platforms solution solutions service services client clients company companies internship intern graduate graduates " +
    "location onsite remote hybrid salary compensation terms selection round rounds assessment interview process panel leadership hackathon " +
    "conversion relocation confidential growing fast fresher freshers candidates candidate hiring opportunity responsibilities requirement " +
    "requirements qualification qualifications benefits bonus month months monthly paid lpa ctc india anywhere willing open welcome related " +
    "build ship own work directly first commit production must good have plus"
  ).split(" "),
);

/**
 * Keywords from a pasted job description: technical terms first (by how often the posting repeats them), then, only
 * if the posting names few of those, repeated non-generic words as a fallback.
 */
export function jobDescriptionKeywords(jd: string, limit = 25): string[] {
  const lower = jd.toLowerCase();
  const tech: [string, number][] = [];
  for (const [key, display] of TECH_BY_KEY) {
    const n = (lower.match(new RegExp(`(?<![a-z0-9+#.])${escapeRe(key)}(?![a-z0-9+#])`, "g")) ?? []).length;
    if (n > 0) tech.push([display, n]);
  }
  // "REST API" and "REST APIs" (and "API"/"APIs") are one idea: keep the most specific spelling the posting used.
  const merged = tech.filter(([d]) => !tech.some(([o]) => o !== d && o.length > d.length && o.toLowerCase().startsWith(d.toLowerCase()) && /^(?:s|\s)/i.test(o.slice(d.length))));
  const out = merged.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([d]) => d);
  if (out.length >= 6) return out.slice(0, limit);

  const counts = new Map<string, number>();
  for (const raw of lower.match(/[a-z][a-z0-9+#.]*[a-z0-9+#]/g) ?? []) {
    const w = raw.replace(/\.+$/, "");
    if (w.length < 3 || STOPWORDS.has(w) || GENERIC.has(w) || /^\d+$/.test(w) || TECH_BY_KEY.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const extra = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([w]) => w);
  return [...out, ...extra].slice(0, Math.min(limit, 12));
}

function keywordsCheck(p: ParsedResume, role: Role | null, jd: string | null): { check: AtsCheck; matched: string[]; missing: string[]; source: "role" | "job_description" | "both" } {
  const text = p.text;
  let roleCoverage: number | null = null;
  const matched: string[] = [];
  const missing: string[] = [];
  if (role) {
    let got = 0;
    let total = 0;
    for (const skill of role.skills) {
      total += skill.weight;
      const hits = skill.keywords.filter((k) => has(text, k));
      if (hits.length > 0) {
        got += skill.weight;
        matched.push(skill.name);
      } else missing.push(skill.name);
    }
    roleCoverage = total > 0 ? got / total : 0;
  }
  let jdCoverage: number | null = null;
  if (jd && jd.trim().length > 0) {
    const kws = jobDescriptionKeywords(jd);
    const hit = kws.filter((k) => has(text, k));
    jdCoverage = kws.length > 0 ? hit.length / kws.length : null;
    if (jdCoverage !== null) {
      matched.push(...hit);
      missing.push(...kws.filter((k) => !hit.includes(k)));
    }
  }
  const parts = [roleCoverage, jdCoverage].filter((x): x is number => x !== null);
  const coverage = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
  const source = roleCoverage !== null && jdCoverage !== null ? "both" : jdCoverage !== null ? "job_description" : "role";
  const what = source === "both" ? `the ${role!.name} role and your job description` : source === "job_description" ? "your job description" : `the ${role?.name ?? "target"} role`;
  const detail = parts.length
    ? `${Math.round(coverage * 100)}% of the keywords for ${what} appear in your résumé.`
    : "No target role or job description was given, so keyword coverage could not be measured.";
  return {
    check: check("keywords", "Keyword match", coverage * MAX.keywords, MAX.keywords, detail, missing.length ? `Where it is true, work these into your bullets or Skills section: ${missing.slice(0, 8).join(", ")}.` : "Pick a target role or paste a job description to measure this."),
    matched,
    missing,
    source,
  };
}

const METRIC = /(\d[\d,.]*\s?(?:%|x\b|k\b|m\b|ms\b|s\b|users?|students?|requests?|hours?|days?|weeks?|months?|ms)|\$\s?\d|\b\d{2,}\b|\b(?:\d+)\s?\+)/i;

function impactCheck(p: ParsedResume): AtsCheck {
  const n = p.bullets.length;
  if (n === 0) return check("impact", "Measurable impact", 0, MAX.impact, "No bullet points (\\item) were found.", "Describe each project or role in \\item bullets, and include a number in at least half of them.");
  const withMetric = p.bullets.filter((b) => METRIC.test(b)).length;
  const ratio = withMetric / n;
  return check("impact", "Measurable impact", clamp(ratio / 0.5, 0, 1) * MAX.impact, MAX.impact, `${withMetric} of ${n} bullets include a number, percentage or scale.`, "Add a measurable result to more bullets (for example “cut load time by 40%”, “served 2,000 users”). Aim for at least half.");
}

function verbsCheck(p: ParsedResume): AtsCheck {
  const n = p.bullets.length;
  if (n === 0) return check("verbs", "Action verbs", 0, MAX.verbs, "No bullet points (\\item) were found.", "Start each bullet with a strong past-tense verb such as Built, Reduced or Led.");
  const first = (b: string) => (b.toLowerCase().match(/[a-z]+/) ?? [""])[0]!;
  const strong = p.bullets.filter((b) => STRONG_VERBS.has(first(b)) || /^[a-z]{3,}ed$/.test(first(b))).length;
  const weak = p.bullets.filter((b) => WEAK_PHRASES.some((w) => b.toLowerCase().includes(w)));
  const ratio = strong / n;
  const detail = `${strong} of ${n} bullets start with an action verb${weak.length ? `; ${weak.length} use weak phrases like “${WEAK_PHRASES.find((w) => weak[0]!.toLowerCase().includes(w))}”` : ""}.`;
  const score = clamp(ratio / 0.7, 0, 1) * MAX.verbs - Math.min(2, weak.length * 0.5);
  return check("verbs", "Action verbs", score, MAX.verbs, detail, "Start bullets with strong past-tense verbs (Built, Designed, Reduced) and replace “responsible for” or “worked on” with what you actually did.");
}

function lengthCheck(p: ParsedResume): AtsCheck {
  const w = p.words;
  const wordScore = w >= 250 && w <= 700 ? 5 : w < 250 ? clamp((w - 100) / 150, 0, 1) * 5 : clamp((950 - w) / 250, 0, 1) * 5;
  const lens = p.bullets.map((b) => (b.match(/\S+/g) ?? []).length);
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const bulletScore = lens.length === 0 ? 0 : avg >= 8 && avg <= 28 ? 5 : avg < 8 ? clamp(avg / 8, 0, 1) * 5 : clamp((40 - avg) / 12, 0, 1) * 5;
  const detail = `${w} words in total${lens.length ? `, about ${Math.round(avg)} words per bullet` : ""}.`;
  const fix = w < 250 ? "Add detail: aim for 300 to 650 words, about one page." : w > 700 ? "Trim to about one page (under 700 words) and keep only the most relevant points." : avg > 28 ? "Shorten long bullets to one or two lines (under about 25 words)." : "Make bullets a little more specific (8 to 25 words each).";
  return check("length", "Length and density", wordScore + bulletScore, MAX.length, detail, fix);
}

function formatCheck(p: ParsedResume): AtsCheck {
  const l = p.layout;
  const problems: string[] = [];
  let score = MAX.format;
  const penalise = (on: boolean, points: number, what: string) => {
    if (!on) return;
    score -= points;
    problems.push(what);
  };
  penalise(l.tables, 3, "tables");
  penalise(l.columns, 3, "multiple columns");
  penalise(l.graphics, 3, "images");
  penalise(l.positioned, 2, "positioned text boxes or TikZ");
  penalise(l.icons, 1, "icon fonts");
  return check(
    "format",
    "ATS-safe formatting",
    score,
    MAX.format,
    problems.length ? `Found layout features that parsers often misread: ${problems.join(", ")}.` : "A single column of plain text with no tables, images or icons.",
    `Use a single-column layout with \\section headings and \\item bullets instead of ${problems.join(", ")}. Parsers read left to right, line by line.`,
  );
}

export function scoreResume(input: AtsInput): AtsResult {
  const parsed = parseResume(input.latex);
  const kw = keywordsCheck(parsed, input.role ?? null, input.jobDescription ?? null);
  const checks = [contactCheck(parsed), sectionsCheck(parsed), kw.check, impactCheck(parsed), verbsCheck(parsed), lengthCheck(parsed), formatCheck(parsed)];
  const score = Math.round(checks.reduce((a, c) => a + c.score, 0));
  return {
    score,
    rating: score >= 80 ? "strong" : score >= 65 ? "good" : score >= 45 ? "needs_work" : "weak",
    checks,
    keywords: { matched: kw.matched, missing: kw.missing, source: kw.source },
    stats: { words: parsed.words, bullets: parsed.bullets.length, sections: parsed.sections.map((s) => s.name) },
    role_id: input.role?.id ?? null,
    scored_at: (input.now ?? new Date()).toISOString(),
    disclaimer: ATS_DISCLAIMER,
  };
}

/** The résumé's plain text, for the mentor and for previews. */
export function resumePlainText(latex: string): string {
  return parseResume(latex).text;
}
