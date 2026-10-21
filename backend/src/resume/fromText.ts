import { CLASSIC_PREAMBLE } from "./templates.js";

/**
 * Turns the plain text of an existing résumé (read from a PDF or pasted by the student) into a clean, editable LaTeX
 * document in the classic template. It is a best-effort conversion: it recognises the usual section headings,
 * bullets, date ranges, links and contact details, escapes everything TeX treats specially, and tells the student
 * what it could not read. It never invents content, and the original text is not stored.
 */

export const MAX_IMPORT_CHARS = 40_000;

export interface ImportResult {
  latex: string;
  warnings: string[];
  /** The section headings that were recognised, in order. */
  sections: string[];
}

const HEADINGS: [RegExp, string][] = [
  [/^(?:professional |career )?(?:summary|profile|objective|about me|career objective)$/i, "Summary"],
  [/^(?:academic )?(?:education|academics|academic background|qualifications?|educational qualifications?)$/i, "Education"],
  [/^(?:technical |key |core )?(?:skills?|skills? summary|technologies|tech(?:nical)? stack|competenc(?:y|ies)|skills? (?:&|and) tools)$/i, "Skills"],
  [/^(?:work |professional |relevant |industry )?(?:experience|employment(?: history)?|work history|internships?)$/i, "Experience"],
  [/^(?:academic |personal |key |selected |major )?projects?$/i, "Projects"],
  [/^(?:achievements?|awards?(?: (?:&|and) honou?rs)?|honou?rs|accomplishments)$/i, "Achievements"],
  [/^(?:certifications?|licen[sc]es?(?: (?:&|and) certifications?)?|courses)$/i, "Certifications"],
  [/^(?:positions? of responsibility|leadership|volunteer(?:ing)?(?: experience)?|extra[- ]?curricular(?: activities)?|activities)$/i, "Leadership and activities"],
  [/^publications?$/i, "Publications"],
  [/^languages?$/i, "Languages"],
  [/^(?:interests|hobbies)$/i, "Interests"],
];

const BULLET = /^\s*(?:[•·▪▫◦‣∙●○■□*+]|[-–—](?=\s)|\d{1,2}[.)](?=\s))\s*(.+)$/u;
const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
const MONTH_YEAR = String.raw`(?:${MONTH}\s)?\d{4}|\d{1,2}/\d{4}`;
/** A line ending in a date range ("Jun 2025 – Aug 2025", "2022 – 2026", "2023 – Present") or a single month and year ("Jun 2025"). Lazy on the left so the whole range is taken. */
const DATE_END = new RegExp(String.raw`^(.*?\S)\s+((?:${MONTH_YEAR})\s*(?:-|–|—|to)\s*(?:${MONTH_YEAR}|Present|Current|Ongoing|Till date)|${MONTH}\s\d{4})$`, "i");
const URL_OR_EMAIL = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|(?:github|linkedin|gitlab)\.com\/[^\s<>]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Characters pdflatex (default UTF-8 input, standard fonts) can set. Anything else is replaced and reported. */
const SAFE_CHAR = /[\u0020-\u007E\u00A1-\u017F\u2010-\u2015\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/;
const REPLACE: Record<string, string> = { "\u20B9": "INR ", "\u2192": "->", "\u2190": "<-", "\u2265": ">=", "\u2264": "<=", "\u00D7": "x", "\u2713": "", "\u2714": "", "\u2605": "", "\u2606": "", "\u00A0": " ", "\u200B": "", "\uFEFF": "" };

function clean(raw: string): { text: string; replaced: number } {
  let replaced = 0;
  let out = "";
  for (const ch of raw.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/\f/g, "\n")) {
    if (ch === "\n" || ch === "\t") out += ch;
    else if (ch in REPLACE) out += REPLACE[ch];
    else if (SAFE_CHAR.test(ch)) out += ch;
    else if (/[̀-ͯ]/.test(ch)) continue; // a stray combining mark
    else {
      out += "?";
      replaced++;
    }
  }
  return { text: out, replaced };
}

const SPECIAL: Record<string, string> = { "\\": "\\textbackslash{}", "&": "\\&", "%": "\\%", $: "\\$", "#": "\\#", _: "\\_", "{": "\\{", "}": "\\}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}", "|": "\\textbar{}" };
const esc = (s: string): string => s.replace(/[\\&%$#_{}~^|]/g, (c) => SPECIAL[c]!);

/** Escapes text, turning links and email addresses into \href so they stay clickable and machine-readable. */
function inline(s: string): string {
  let out = "";
  let last = 0;
  for (const m of s.matchAll(URL_OR_EMAIL)) {
    let token = m[0];
    const trail = /[.,;:)\]]+$/.exec(token)?.[0] ?? "";
    token = token.slice(0, token.length - trail.length);
    if (!token) continue;
    out += esc(s.slice(last, m.index!));
    const target = token.includes("@") && !/^https?:/i.test(token) ? `mailto:${token}` : /^https?:\/\//i.test(token) ? token : `https://${token}`;
    out += `\\href{${target.replace(/[%#&\\{}]/g, (c) => `\\${c}`)}}{${esc(token)}}`;
    last = m.index! + token.length;
  }
  return out + esc(s.slice(last));
}

/**
 * A name set in small capitals comes out of a PDF as "R AHUL M ENON" (each capital apart from its small capitals), and a
 * name set in all capitals as "SAMPLE PERSON". Join the pieces and use ordinary capitalisation.
 */
function tidyName(raw: string): string {
  const joined = raw.replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g, "$1");
  return /^[A-Z][A-Z .'-]+$/.test(joined) ? joined.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase()) : joined;
}

function headingOf(line: string): string | null {
  const t = line.trim().replace(/[:：–—|-]+$/g, "").replace(/^[–—|-]+/g, "").trim();
  if (t.length < 3 || t.length > 40) return null;
  for (const [re, title] of HEADINGS) if (re.test(t)) return title;
  return null;
}

type Block = { kind: "bullets"; items: string[] } | { kind: "lines"; lines: string[] };

function renderBlocks(lines: string[], section: string): string {
  const blocks: Block[] = [];
  const push = (kind: "bullets" | "lines", text: string) => {
    const last = blocks.at(-1);
    if (kind === "bullets") {
      if (last?.kind === "bullets") last.items.push(text);
      else blocks.push({ kind: "bullets", items: [text] });
    } else if (last?.kind === "lines") last.lines.push(text);
    else blocks.push({ kind: "lines", lines: [text] });
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const b = BULLET.exec(line);
    if (b) {
      push("bullets", b[1]!.trim());
      continue;
    }
    const last = blocks.at(-1);
    // A wrapped line: it continues the previous bullet when it starts in lower case or the bullet clearly was not finished.
    if (last?.kind === "bullets" && (/^[a-z(]/.test(line) || /[,;(&-]$|\band$|\bwith$|\bof$|\bto$/.test(last.items.at(-1)!))) {
      last.items[last.items.length - 1] += ` ${line}`;
      continue;
    }
    push("lines", line);
  }

  const out: string[] = [];
  for (const blk of blocks) {
    if (blk.kind === "bullets") {
      out.push("\\begin{itemize}", ...blk.items.map((i) => `  \\item ${inline(i)}`), "\\end{itemize}");
      continue;
    }
    const rendered = blk.lines.map((l) => {
      const labelled = section === "Skills" ? /^([A-Za-z][A-Za-z &/+.-]{1,28}):\s+(.+)$/.exec(l) : null;
      if (labelled) return `\\textbf{${inline(labelled[1]!)}:} ${inline(labelled[2]!)}`;
      const d = DATE_END.exec(l);
      if (d && d[1]!.length >= 3 && section !== "Skills") return `\\textbf{${inline(d[1]!.replace(/[,|–—-]+$/, "").trim())}} \\hfill ${inline(d[2]!)}`;
      return inline(l);
    });
    out.push(rendered.map((r, i) => (i < rendered.length - 1 ? `${r}\\\\` : r)).join("\n"));
  }
  return out.join("\n");
}

export function textToLatex(input: string): ImportResult {
  const { text, replaced } = clean(input);
  // PDF text often has a stray space before punctuation ("University , B.E."): close it up.
  const lines = text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").replace(/ +([,;:!?])/g, "$1").replace(/ +\.(?=\s|$)/g, ".").trimEnd());
  const warnings: string[] = [];

  // ---- split into the header (before the first heading) and sections
  const sections: { title: string; lines: string[] }[] = [];
  const header: string[] = [];
  for (const line of lines) {
    const h = headingOf(line);
    if (h) sections.push({ title: h, lines: [] });
    else if (sections.length === 0) header.push(line);
    else sections[sections.length - 1]!.lines.push(line);
  }
  const head = header.map((l) => l.trim()).filter(Boolean);
  let name = "";
  if (head.length > 0 && head[0]!.length <= 60 && !/@|https?:|www\./i.test(head[0]!) && !/\d{5,}/.test(head[0]!)) name = tidyName(head.shift()!);

  // ---- assemble
  const out: string[] = ["\\begin{document}", ""];
  if (name || head.length) {
    out.push("\\begin{center}");
    if (name) out.push(`  {\\LARGE \\textbf{${inline(name)}}}${head.length ? "\\\\[4pt]" : ""}`);
    head.forEach((l, i) => out.push(`  ${inline(l)}${i < head.length - 1 ? "\\\\" : ""}`));
    out.push("\\end{center}", "");
  }
  if (sections.length === 0) {
    out.push(renderBlocks(lines.filter((l) => l.trim() && !head.includes(l.trim()) && l.trim() !== name), ""), "");
    warnings.push("No section headings (such as Education, Skills, Projects or Experience) were recognised, so everything was kept as one block. Add \\section headings to structure it; ATS parsers look for them.");
  } else {
    for (const s of sections) {
      const body = renderBlocks(s.lines, s.title);
      out.push(`\\section{${s.title}}`, body || "", "");
    }
  }
  out.push("\\end{document}", "");

  if (input.trim().length < 150) warnings.push("Very little text was found. If the PDF is a scan or an image, the text could not be read: paste it or retype it here.");
  if (replaced > 0) warnings.push(`${replaced} character${replaced === 1 ? "" : "s"} the compiler cannot set were replaced with “?”. Search the source for “?” and retype them.`);
  if (!name) warnings.push("The first line did not look like a name, so no name heading was added.");
  warnings.push("Check the converted text against your original. PDF text can come out in the wrong order for multi-column or table layouts, and dates or job titles may need tidying.");

  return { latex: CLASSIC_PREAMBLE + out.join("\n"), warnings, sections: sections.map((s) => s.title) };
}
