/**
 * Finds technical skills in a student's own resume text, deterministically. No model reads the resume and nothing here
 * stores or logs it: the text goes in, a short list of known skills (with a snippet showing where each was found) comes
 * out, and the student decides what to keep. Every skill maps to a Freehire skill slug, so it lines up with the
 * postings it is matched against. A skill is only ever "from the resume" (self-reported): a resume is a claim, and
 * only graded practice makes a skill verified.
 */

export interface VocabularyEntry {
  slug: string; // Freehire's canonical skill slug (checked against the live vocabulary by `npm run career:smoke`)
  label: string;
  /** Spellings that identify the skill. Matched on word edges, so "java" never matches inside "javascript". */
  aliases: string[];
  /** True for words that are also ordinary English: only the exact capitalisation counts ("Swift", not "swift"). */
  exactCase?: boolean;
  /** A match followed by this text is a different skill (for example "react native" is not React). */
  notFollowedBy?: RegExp;
}

const e = (slug: string, label: string, aliases: string[], extra: Partial<VocabularyEntry> = {}): VocabularyEntry => ({ slug, label, aliases, ...extra });

export const SKILL_VOCABULARY: VocabularyEntry[] = [
  // languages
  e("javascript", "JavaScript", ["javascript", "ecmascript", "es6"]),
  e("typescript", "TypeScript", ["typescript"]),
  e("python", "Python", ["python"]),
  e("java", "Java", ["java"]),
  e("cpp", "C++", ["c++", "cpp"]),
  e("csharp", "C#", ["c#", "csharp"]),
  e("go", "Go", ["golang"]),
  e("kotlin", "Kotlin", ["kotlin"]),
  e("swift", "Swift", ["Swift", "SwiftUI"], { exactCase: true }),
  e("rust", "Rust", ["Rust"], { exactCase: true }),
  e("php", "PHP", ["php"]),
  e("ruby", "Ruby", ["Ruby"], { exactCase: true }),
  e("scala", "Scala", ["Scala"], { exactCase: true }),
  e("dart", "Dart", ["Dart"], { exactCase: true }),
  e("perl", "Perl", ["perl"]),
  e("haskell", "Haskell", ["haskell"]),
  e("matlab", "MATLAB", ["matlab"]),
  e("bash", "Bash", ["bash", "shell scripting"]),
  e("sql", "SQL", ["sql"]),
  e("html", "HTML", ["html", "html5"]),
  e("css", "CSS", ["css", "css3"]),
  e("sass", "Sass", ["sass"]),
  e("scss", "SCSS", ["scss"]),
  // front end
  e("react", "React", ["react", "reactjs", "react.js"], { notFollowedBy: /^[ -]?native/i }),
  e("react-native", "React Native", ["react native", "react-native"]),
  e("angular", "Angular", ["angular", "angularjs"]),
  e("vue", "Vue", ["vue", "vue.js", "vuejs"]),
  e("nextjs", "Next.js", ["next.js", "nextjs"]),
  e("nuxt", "Nuxt", ["nuxt", "nuxt.js"]),
  e("svelte", "Svelte", ["svelte"]),
  e("redux", "Redux", ["redux"]),
  e("tailwind", "Tailwind CSS", ["tailwind", "tailwindcss"]),
  e("bootstrap", "Bootstrap", ["bootstrap"]),
  e("jquery", "jQuery", ["jquery"]),
  e("webpack", "Webpack", ["webpack"]),
  e("vite", "Vite", ["vite"]),
  e("accessibility", "Accessibility", ["accessibility", "a11y"]),
  e("wcag", "WCAG", ["wcag"]),
  // back end
  e("nodejs", "Node.js", ["node.js", "nodejs", "node js"]),
  e("express", "Express", ["express.js", "expressjs"]),
  e("django", "Django", ["django"]),
  e("flask", "Flask", ["flask"]),
  e("fastapi", "FastAPI", ["fastapi"]),
  e("spring", "Spring", ["spring boot", "springboot", "spring framework", "spring mvc"]),
  e("laravel", "Laravel", ["laravel"]),
  e("rails", "Ruby on Rails", ["ruby on rails", "rubyonrails"]),
  e("dotnet", ".NET", [".net", "dotnet", "asp.net"]),
  e("graphql", "GraphQL", ["graphql"]),
  e("rest", "REST", ["rest api", "rest apis", "restful"]),
  e("api", "APIs", ["apis", "api development", "api design", "api integration"]),
  e("grpc", "gRPC", ["grpc"]),
  e("microservices", "Microservices", ["microservices", "microservice"]),
  e("kafka", "Kafka", ["kafka"]),
  e("rabbitmq", "RabbitMQ", ["rabbitmq"]),
  // data
  e("postgresql", "PostgreSQL", ["postgresql", "postgres"]),
  e("mysql", "MySQL", ["mysql"]),
  e("mongodb", "MongoDB", ["mongodb", "mongo db"]),
  e("redis", "Redis", ["redis"]),
  e("sqlite", "SQLite", ["sqlite"]),
  e("elasticsearch", "Elasticsearch", ["elasticsearch", "elastic search"]),
  e("firebase", "Firebase", ["firebase"]),
  e("dynamodb", "DynamoDB", ["dynamodb"]),
  e("snowflake", "Snowflake", ["snowflake"]),
  e("spark", "Spark", ["apache spark", "pyspark"]),
  e("hadoop", "Hadoop", ["hadoop"]),
  e("pandas", "pandas", ["pandas"]),
  e("numpy", "NumPy", ["numpy"]),
  e("tableau", "Tableau", ["tableau"]),
  e("powerbi", "Power BI", ["power bi", "powerbi"]),
  e("airflow", "Airflow", ["airflow"]),
  e("dbt", "dbt", ["dbt"]),
  // machine learning
  e("machine-learning", "Machine learning", ["machine learning"]),
  e("deep-learning", "Deep learning", ["deep learning"]),
  e("tensorflow", "TensorFlow", ["tensorflow"]),
  e("pytorch", "PyTorch", ["pytorch"]),
  e("scikit-learn", "scikit-learn", ["scikit-learn", "scikit learn", "sklearn"]),
  e("nlp", "NLP", ["nlp", "natural language processing"]),
  e("computer-vision", "Computer vision", ["computer vision"]),
  e("llm", "LLMs", ["llm", "llms", "large language model", "large language models"]),
  e("opencv", "OpenCV", ["opencv"]),
  // cloud and devops
  e("aws", "AWS", ["aws", "amazon web services"]),
  e("azure", "Azure", ["azure"]),
  e("gcp", "Google Cloud", ["gcp", "google cloud"]),
  e("docker", "Docker", ["docker", "dockerfile"]),
  e("kubernetes", "Kubernetes", ["kubernetes", "k8s"]),
  e("terraform", "Terraform", ["terraform"]),
  e("ansible", "Ansible", ["ansible"]),
  e("jenkins", "Jenkins", ["jenkins"]),
  e("ci-cd", "CI/CD", ["ci/cd", "ci-cd", "cicd", "continuous integration"]),
  e("github-actions", "GitHub Actions", ["github actions"]),
  e("linux", "Linux", ["linux"]),
  e("git", "Git", ["git"]),
  e("github", "GitHub", ["github"]),
  e("nginx", "Nginx", ["nginx"]),
  e("prometheus", "Prometheus", ["prometheus"]),
  e("grafana", "Grafana", ["grafana"]),
  e("devops", "DevOps", ["devops"]),
  // testing
  e("jest", "Jest", ["jest"]),
  e("cypress", "Cypress", ["cypress"]),
  e("selenium", "Selenium", ["selenium"]),
  e("junit", "JUnit", ["junit"]),
  e("pytest", "pytest", ["pytest"]),
  e("playwright", "Playwright", ["playwright"]),
  e("unit-testing", "Unit testing", ["unit testing", "unit tests"]),
  e("tdd", "TDD", ["tdd", "test-driven development", "test driven development"]),
  // mobile
  e("android", "Android", ["android"]),
  e("ios", "iOS", ["ios"]),
  e("flutter", "Flutter", ["flutter"]),
  // practice and tools
  e("agile", "Agile", ["agile"]),
  e("scrum", "Scrum", ["scrum"]),
  e("jira", "Jira", ["jira"]),
  e("figma", "Figma", ["figma"]),
  e("postman", "Postman", ["postman"]),
  e("oop", "Object-oriented programming", ["oop", "object-oriented", "object oriented"]),
];

const BY_SLUG = new Map(SKILL_VOCABULARY.map((v) => [v.slug, v]));
export const isKnownSkill = (slug: string): boolean => BY_SLUG.has(slug);
export const skillLabel = (slug: string): string => BY_SLUG.get(slug)?.label ?? slug;

export const MAX_RESUME_CHARS = 50_000;
export const MAX_RESUME_SKILLS = 60;

export interface ExtractedSkill {
  slug: string;
  label: string;
  mentions: number;
  /** A short piece of the resume around the first mention, so the student can see why it was suggested. Never stored. */
  evidence: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
// A skill must not touch a letter, digit or one of + # (so "c" never matches inside "c++" and "java" not inside "javascript").
const compile = (alias: string, exactCase: boolean) => new RegExp(`(?<![A-Za-z0-9+#])${escapeRe(alias)}(?![A-Za-z0-9+#])`, exactCase ? "g" : "gi");

const PATTERNS = SKILL_VOCABULARY.map((v) => ({ v, res: v.aliases.map((a) => compile(a, v.exactCase === true)) }));

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/gi;
// eslint-disable-next-line no-control-regex -- strips control characters from untrusted text
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function snippet(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 40);
  const to = Math.min(text.length, end + 40);
  const raw = text
    .slice(from, to)
    .replace(CONTROL, " ")
    .replace(EMAIL, "…")
    .replace(PHONE, "…")
    .replace(URL_LIKE, "…")
    .replace(/\s+/g, " ")
    .trim();
  return `${from > 0 ? "…" : ""}${raw}${to < text.length ? "…" : ""}`;
}

/** The skills this resume text mentions, most-mentioned first. Pure and bounded: it never fails on odd input. */
export function extractResumeSkills(text: string): ExtractedSkill[] {
  const t = text.length > MAX_RESUME_CHARS ? text.slice(0, MAX_RESUME_CHARS) : text;
  const found: ExtractedSkill[] = [];
  for (const { v, res } of PATTERNS) {
    let mentions = 0;
    let first: { start: number; end: number } | null = null;
    for (const re of res) {
      re.lastIndex = 0;
      for (let m = re.exec(t); m !== null; m = re.exec(t)) {
        if (m[0].length === 0) {
          re.lastIndex += 1;
          continue;
        }
        const end = m.index + m[0].length;
        if (v.notFollowedBy?.test(t.slice(end, end + 12))) continue;
        mentions += 1;
        if (first === null || m.index < first.start) first = { start: m.index, end };
      }
    }
    if (mentions > 0 && first) found.push({ slug: v.slug, label: v.label, mentions, evidence: snippet(t, first.start, first.end) });
  }
  found.sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));
  return found.slice(0, MAX_RESUME_SKILLS);
}
