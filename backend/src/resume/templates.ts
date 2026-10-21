import type { ResumeTemplate } from "../types.js";

/**
 * Starting points that follow common ATS guidance: one column, standard \section names, plain \item bullets, and no
 * tables, images, icon fonts or text boxes. They use only packages that ship with every TeX Live install.
 * The details are placeholders for the student to replace.
 */

const BODY = String.raw`\begin{document}

\begin{center}
  {\LARGE \textbf{Your Name}}\\[4pt]
  City, Country \,\textbar\, +00 00000 00000 \,\textbar\, \href{mailto:you@example.com}{you@example.com}\\
  \href{https://github.com/yourname}{github.com/yourname} \,\textbar\, \href{https://www.linkedin.com/in/yourname}{linkedin.com/in/yourname}
\end{center}

\section{Education}
\textbf{Your University}, B.Tech in Computer Science \hfill 2022 -- 2026\\
CGPA: 8.5/10. Relevant coursework: Data Structures, Algorithms, Databases, Operating Systems.

\section{Skills}
\textbf{Languages:} Python, JavaScript, TypeScript, Java, SQL\\
\textbf{Frameworks and tools:} React, Node.js, REST APIs, Git, Docker, Testing Library

\section{Projects}
\textbf{Project Name} \,\textbar\, React, Node.js, PostgreSQL \hfill \href{https://github.com/yourname/project}{github.com/yourname/project}
\begin{itemize}
  \item Built a dashboard with React and a REST API that serves 2,000 monthly users.
  \item Reduced page load time by 40\% by lazy loading routes and memoizing components.
  \item Wrote 60 unit tests with Testing Library, raising coverage from 35\% to 82\%.
\end{itemize}

\section{Experience}
\textbf{Software Engineering Intern}, Company Name \hfill Jun 2025 -- Aug 2025
\begin{itemize}
  \item Implemented 3 customer-facing features in TypeScript, shipped to 10,000 users.
  \item Cut API response time by 30\% by adding caching and database indexes.
  \item Collaborated with 4 engineers in weekly code reviews and 2-week sprints.
\end{itemize}

\end{document}
`;

/** The document class, packages and styling of the classic template, shared with résumés converted from uploaded text. */
export const CLASSIC_PREAMBLE = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[margin=0.8in]{geometry}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\titleformat{\section}{\large\bfseries}{}{0pt}{}[\titlerule]
\titlespacing*{\section}{0pt}{10pt}{5pt}
\setlist[itemize]{leftmargin=1.2em, itemsep=1pt, topsep=3pt}

`;

const CLASSIC = CLASSIC_PREAMBLE + BODY;

const COMPACT = String.raw`\documentclass[10pt,a4paper]{article}
\usepackage[margin=0.6in]{geometry}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{titlesec}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\titleformat{\section}{\normalsize\bfseries\scshape}{}{0pt}{}[\titlerule]
\titlespacing*{\section}{0pt}{6pt}{3pt}
\setlist[itemize]{leftmargin=1.1em, itemsep=0pt, topsep=2pt}

${BODY}`;

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  { id: "classic", name: "Classic, single column", description: "Roomy and easy to read. The safest starting point for ATS parsing.", latex: CLASSIC },
  { id: "compact", name: "Compact, one page", description: "Smaller margins and type so more fits on one page. Still one column, still plain text.", latex: COMPACT },
];
