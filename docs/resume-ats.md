# Résumé builder, ATS score and the AI mentor

A student writes a résumé in LaTeX, builds the PDF, sees an explainable ATS score with specific fixes, and can hand the saved résumé to the AI mentor.

## 1. What the ATS score is, and is not

It is a **deterministic heuristic** built from widely published ATS guidance. The same text always scores the same; no model is involved. It is **not any employer's real ATS** and cannot say whether a résumé would be accepted or ranked, so every result carries a disclaimer and the mentor is told never to present it as a prediction.

Seven checks add up to 100 (`backend/src/resume/ats.ts`):

| Check | Points | What it looks at |
|---|---|---|
| Contact details | 10 | email (5), phone (3), GitHub or LinkedIn link (2). Template placeholders (`Your Name`, `you@example.com`) earn almost nothing. |
| Standard sections | 15 | Education, Experience or Projects, Skills, found by their `\section` names. |
| Keyword match | 30 | Coverage of the target role's skills (weighted by the role's own weights) and/or of a pasted job description. |
| Measurable impact | 15 | Share of `\item` bullets with a number, percentage or scale. Half or more earns full marks. |
| Action verbs | 10 | Bullets that start with a strong verb; weak phrases ("responsible for", "worked on") cost points. |
| Length and density | 10 | 250 to 700 words, and 8 to 28 words per bullet. |
| ATS-safe formatting | 10 | Penalises tables, multiple columns, images, text boxes or TikZ, and icon fonts. |

Keywords from a job description come from a curated list of technical terms first, shown with proper casing, so a posting's city or perks never become "keywords". Only if a posting names few technical terms are repeated plain words used, minus generic ones. Matching is whole-word (`Java` does not match inside `JavaScript`). Every missing keyword is offered with "add it only where it is true".

The score is **computed on every read, never stored**, so it cannot go stale. `backend/src/resume/latexText.ts` reads the LaTeX the way a parser would (sections, bullets, links, escapes) and detects the layout features that break parsers.

## 2. The LaTeX compiler

`POST /api/resume/compile` builds the PDF. TeX runs on untrusted input, so it never runs in the API process: each build gets a throwaway Docker container with **no network, a read-only root, memory (640 MB) and process (96) caps, all capabilities dropped, shell escape off, TeX's "paranoid" file mode (it cannot read or write outside the work folder), and a 25 second hard limit**. Output is capped at 5 MB.

* `LATEX_COMPILER=none` (default): the builder still edits, saves and scores. Building returns `503 LATEX_UNAVAILABLE` and the page explains it.
* `LATEX_COMPILER=docker`: **development only, refused when `NODE_ENV=production`** (a web server with Docker-socket access is not an acceptable production sandbox). Build the image once: `docker build -t unbluff-latex:1 backend/scripts/latex` (about 1 GB). `CODE_WORK_DIR` must be a folder the Docker daemon can see, as for the code runner.
* A production deployment needs its own sandboxed compiler service behind the same `LatexCompiler` interface.

A failed build is a normal `200` result with `ok: false` and the compiler's own error lines (file, line and message), so the student can fix the source.

## 3. The AI mentor connection

`POST /api/mentor/chat` takes `resume_context: true`, or detects a résumé topic in the message ("résumé", "CV", "ATS", "LaTeX"; Unicode-aware, so "résumé" with accents matches). When on, the mentor receives a bounded `<resume_ats>` block built from the **saved** résumé: the score, every check with its fix, keywords found and missing, and a 2,200 character excerpt of the plain text. The score is recomputed at that moment, so the mentor can never quote an old one.

Rules the mentor is given: the block is the only source of résumé facts; the score is a heuristic, never a prediction; quote scores exactly; mark rewritten bullets as suggestions; never invent metrics, employers, dates or technologies (use a `[X%]` placeholder); suggest keywords only "where true"; keep edits to one column, standard `\section` headings and plain `\item` bullets. If no résumé is saved it says so and guesses nothing. The block's text is defanged so a résumé cannot imitate the prompt's own delimiters. The chat response carries `resume_context: { used, score, updated_at }` and the page tells the student what was used.

The résumé page's **Ask the AI mentor** button saves first (the mentor reads the saved copy), then opens `/mentor?resume=1` with a starter question.

## 4. Storage and privacy

One document per student in `unbluff_resume_documents` (id = uid): the LaTeX, the target role, an optional job description, `updated_at`. Memory store or Firestore, owner-checked on every read and write; no endpoint accepts a uid. Limits: LaTeX 60 KB (a résumé is a few KB; the cap leaves room under the 100 KB JSON body limit), job description 8,000 characters. Compiles are rate limited per student (8 per minute). Résumé text is sent to the AI model only when the student asks the mentor about it.

## 5. Not done

* No production compiler, and the Docker one needs a 1 GB image.
* The score cannot be validated against any real ATS; the weights are judgement calls from public guidance.
* Only LaTeX input. There is no import of an existing PDF or Word résumé.
