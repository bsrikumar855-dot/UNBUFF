/**
 * Reads a LaTeX resume the way an applicant tracking system would read its text: what a parser would see, plus the
 * layout features that commonly break parsers. This is not a TeX engine. It understands the small, regular subset
 * that resumes use (sections, \item lists, \href, text styling) and leaves everything else as plain text.
 */

export interface ParsedSection {
  name: string;
  text: string;
  bullets: string[];
}

export interface ParsedResume {
  /** Visible text, one logical line per line. */
  text: string;
  sections: ParsedSection[];
  /** Every \item in the document, in order, as plain text. */
  bullets: string[];
  emails: string[];
  phones: string[];
  links: string[];
  /** Layout features that commonly break ATS parsing. */
  layout: { tables: boolean; columns: boolean; graphics: boolean; icons: boolean; positioned: boolean };
  words: number;
}

const COMMENT = /(?<!\\)%.*$/gm;

/** Removes TeX comments (an unescaped % to the end of the line). */
export function stripComments(src: string): string {
  return src.replace(COMMENT, "");
}

/** Contents of the \begin{document} environment, or the whole text when there is none (a fragment). */
function bodyOf(src: string): string {
  const m = /\\begin\{document\}([\s\S]*?)(?:\\end\{document\}|$)/.exec(src);
  return m ? m[1]! : src;
}

/** Takes the first {...} group at `from`, balancing braces. Returns its content and the index after it. */
function group(src: string, from: number): { body: string; end: number } | null {
  let i = from;
  while (i < src.length && /\s/.test(src[i]!)) i++;
  if (src[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "\\") j++;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { body: src.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

/** Replaces commands with the text a reader would see. Recursive for nested styling. */
function plain(src: string, links: string[]): string {
  let s = src;
  // \href{url}{label} and \url{url}: keep the label, remember the link.
  let out = "";
  for (let i = 0; i < s.length; ) {
    const href = /^\\href\s*/.exec(s.slice(i));
    const url = /^\\url\s*/.exec(s.slice(i));
    if (href) {
      const u = group(s, i + href[0].length);
      const label = u ? group(s, u.end) : null;
      if (u && label) {
        links.push(u.body.trim());
        out += plain(label.body, links);
        i = label.end;
        continue;
      }
    } else if (url) {
      const u = group(s, i + url[0].length);
      if (u) {
        links.push(u.body.trim());
        out += u.body.trim();
        i = u.end;
        continue;
      }
    }
    out += s[i];
    i++;
  }
  s = out;
  s = s
    .replace(/\\\\(\[[^\]]*\])?/g, "\n")
    .replace(/\\(?:newline|par)\b/g, "\n")
    .replace(/\\(?:textbf|textit|emph|underline|textsc|texttt|textsf|textrm|small|large|Large|LARGE|huge|Huge|scriptsize|footnotesize|normalsize|bfseries|itshape|scshape|centering|raggedright|noindent)\b/g, "")
    .replace(/\\(?:hspace|vspace|hfill|vfill|quad|qquad|smallskip|medskip|bigskip|titlerule|pagenumbering|pagestyle|thispagestyle)\*?(\{[^}]*\})?/g, " ")
    .replace(/\\(?:begin|end)\{[^}]*\}(?:\[[^\]]*\])?/g, "") // environments: drop the markers, keep the content
    .replace(/\\[,;:! ]/g, " ") // thin and normal spaces
    .replace(/\\(?:&|%|\$|#|_)/g, (m) => (m[1] === "$" ? "\uE000" : m[1]!)) // an escaped dollar must survive math-mode stripping
    .replace(/\\textbar\b|\$\|\$/g, "|")
    .replace(/\\textbullet\b|\\textperiodcentered\b/g, "•")
    .replace(/\\(?:ldots|dots)\b/g, "...")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/~/g, " ")
    .replace(/\\[a-zA-Z]+\*?/g, "") // any other command name: drop the name, keep its argument text
    .replace(/[{}]/g, "")
    .replace(/\$/g, "")
    .replace(/\uE000/g, "$");
  return s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const SECTION_CMD = /\\(?:section|subsection|subsubsection|resumeSection|cvsection)\*?\s*(?:\[[^\]]*\])?\s*\{/g;

/** Finds section headings and the text that follows each one up to the next heading. */
function sectionsOf(body: string, links: string[]): ParsedSection[] {
  const marks: { name: string; start: number; end: number }[] = [];
  for (const m of body.matchAll(SECTION_CMD)) {
    const g = group(body, m.index! + m[0].length - 1);
    if (g) marks.push({ name: plain(g.body, []).replace(/\s+/g, " ").trim(), start: m.index!, end: g.end });
  }
  return marks.map((mk, i) => {
    const raw = body.slice(mk.end, marks[i + 1]?.start ?? body.length);
    return { name: mk.name, text: plain(raw, links), bullets: bulletsOf(raw, links) };
  });
}

/** Every \item as plain text. An \item runs to the next \item or the end of its list. */
function bulletsOf(src: string, links: string[]): string[] {
  const out: string[] = [];
  const parts = src.split(/\\item\b(?:\s*\[[^\]]*\])?/).slice(1);
  for (const p of parts) {
    const cut = p.split(/\\end\{(?:itemize|enumerate|description)\}/)[0]!;
    const t = plain(cut, links).replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/g;

export function parseResume(latex: string): ParsedResume {
  const src = stripComments(latex);
  const body = bodyOf(src);
  const links: string[] = [];
  const text = plain(body, links);
  const sections = sectionsOf(body, links);
  const bullets = bulletsOf(body, links);

  const mailto = links.filter((l) => /^mailto:/i.test(l)).map((l) => l.replace(/^mailto:/i, ""));
  const emails = [...new Set([...(text.match(EMAIL) ?? []), ...mailto])];
  const phones = [...new Set((text.match(PHONE) ?? []).map((p) => p.trim()).filter((p) => p.replace(/\D/g, "").length >= 9 && p.replace(/\D/g, "").length <= 15))];
  const hasEnv = (names: string) => new RegExp(`\\\\begin\\{(?:${names})\\*?\\}`).test(src);

  return {
    text,
    sections,
    bullets,
    emails,
    phones,
    links: [...new Set(links.filter((l) => !/^mailto:/i.test(l)))],
    layout: {
      tables: hasEnv("tabular|tabularx|longtable|array|tabu"),
      columns: hasEnv("multicols") || /\\(?:twocolumn|documentclass\[[^\]]*twocolumn)/.test(src) || /\\begin\{paracol\}/.test(src),
      graphics: /\\includegraphics\b/.test(src),
      icons: /\\usepackage(?:\[[^\]]*\])?\{(?:fontawesome5?|fontawesome|academicons|marvosym)\}|\\fa[A-Z][A-Za-z]+/.test(src),
      positioned: hasEnv("tikzpicture|textblock|textblock\\*|wrapfigure") || /\\usepackage(?:\[[^\]]*\])?\{(?:textpos|tikz)\}/.test(src),
    },
    words: (text.match(/[A-Za-z0-9][A-Za-z0-9+#./'-]*/g) ?? []).length,
  };
}
