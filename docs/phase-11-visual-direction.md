# Phase 11: Visual direction and frontend reconstruction

Date: 2026-10-17. Scope: the whole frontend (`frontend/`). No backend change, no API-contract change, no deployment change. Nothing was committed, pushed or deployed in this phase.

## 1. Design direction: "the proofing desk"

UNBLUFF's product is evidence: it separates what a student claims from what the system has verified. The interface is built around that idea, the way an editor marks up a proof.

* **Paper and ink.** A warm paper page (`#F4F1EA`), a slightly lighter raised surface (`#FBF9F4`), near-black ink (`#15130F`). Structure comes from hairline rules, not from boxes and shadows.
* **One accent, the examiner's red pen** (`#B3291A`). Used for marks (active navigation, the underline on the one key phrase of a page, links, focus rings, "needs attention"). It is **not** used for the main button, because in this product red means "marked wrong".
* **Editorial type.** Lora (serif) for page titles and a few display moments, with italic for emphasis. Geist Sans for the interface. Geist Mono for small labels, provenance tags and numerals.
* **Provenance is a first-class visual idea.** Verified, self-reported, unavailable and "no evidence yet" are separate, text-labelled markers (a mono label plus a shape, never colour alone) so a student can always see what a number rests on.
* **Signature elements.** The red-pencil underline under "BLUFF" in the wordmark and under the hero phrase; ruled ledger lists; the "proof sheet" specimen on the landing page; mono section indices (`01 · Method`).

Verdict and skill-state colours (defended, shaky, bluff, honest gap and the skill-state set) are **contract-locked** (CONTRACT.md §6/§7) and were not changed.

### What this deliberately avoids
Purple/blue gradients, glow blobs, glassmorphism, identical three-column card grids, pill-everything, emoji icons, stock imagery, fake statistics or testimonials, giant dashboard headings, placeholder "complete-looking" pages. There is no invented customer, placement rate, contribution square or score anywhere. The only illustrative content is the clearly labelled specimen ("Specimen, not a student") and the existing, labelled demo report.

## 2. How the UI UX Pro Max skill was used (and what was not available)

The skill is enabled and its `SKILL.md` was read and followed. **Its search script, style/colour/font databases and `references/` files are not present on this machine** (only `SKILL.md` exists in the skill folder), so `search.py --design-system` could not be run, and no replacement files were downloaded. What was applied is the skill's own priority table and workflow, in its order:

| Skill priority | Applied as |
|---|---|
| 1 Accessibility (contrast 4.5:1, keyboard, labels, focus) | contrast computed for every text colour (section 4); visible 2 px focus ring; skip link; focus moved to the page on navigation; focus returned to the opener after a dialog closes; labelled controls; **axe-core WCAG 2.1 A/AA audit with zero violations** after fixes (section 8) |
| 2 Touch and interaction (44 px targets, loading feedback) | buttons and rows at 40 to 44 px minimum on touch layouts; busy states on Run/Submit/Send; the sticky Run/Submit bar on phones |
| 3 Performance | Monaco stays lazy-loaded; transform and opacity animations only; fonts self-hosted; no layout-shifting animation |
| 4 Style selection | one coherent system (editorial, ruled, restrained) instead of per-page styles; SVG (Lucide) icons only, no emoji |
| 5 Layout and responsive | verified at 1440, 1024, 768, 390 and 320 px; no horizontal page scroll; a deliberate mobile layout per screen |
| 6 Typography and colour | semantic colour tokens (no raw hex in components), base 16 px reading text, line height about 1.5 |
| 7 Animation | 150 to 400 ms, motion carries meaning, `prefers-reduced-motion` honoured and verified |
| 8 Forms and feedback | visible labels, errors next to fields or in `role="alert"`, status in `role="status"` |
| 9 Navigation | grouped, predictable navigation, deep links preserved, command palette |
| 10 Charts and data | plain accessible bars and heatmaps with the numbers as text; honest "not enough data" states |

The skill's mobile-app checklist (`pro-rules.md`) was not available either; its web-relevant items are covered by the rows above.

## 3. Awwwards references

Inspected in a real browser on 2026-10-17 (screenshots viewed; the sites' text, code and assets were not copied). Awards were confirmed on each site's Awwwards page.

| Reference | What was confirmed | Principle taken (not copied) |
|---|---|---|
| [Heron AI](https://www.awwwards.com/sites/heron-ai), live site <https://heronaiapp.com> | Awwwards Site of the Day, 12 Oct 2026; an agent that works inside design tools | **Hairline-ruled, gridded surfaces on warm paper**: structure from rules and cells with small mono labels; one vermilion accent; a product-specific specimen instead of stock imagery. Informed the ruled lists, mono eyebrows and the proof sheet. |
| [Neutomni](https://www.awwwards.com/sites/neutomni), live site <https://neutomni.com> | Awwwards Site of the Day, 13 Oct 2026, plus Developer Award; a two-colour, type-led site | **Type as structure and a serif-italic flourish against grotesque text**; a single-colour palette carried entirely by typography. Informed the Lora italic emphasis and the restrained palette. |
| [Huy Phan Vol.2](https://www.awwwards.com/sites/huy-phan-vol-2), live site <https://huyml.co> | Awwwards Site of the Day, 14 Oct 2026, plus Developer Award | **Extreme scale contrast and generous negative space**; tiny, quiet navigation beside very large type. Informed the large hero type against small mono labels and the amount of space around the headline. |

Limits: these are three references, all personal or product marketing sites. None is a developer-education workspace, so the workspace patterns (split panes, console, ledger tables) come from established developer-tool conventions and the product's own needs, not from these sites. Awwwards pages gave scores and tags but no written jury commentary; the observations above are from viewing the sites.

## 4. Tokens

Defined in `frontend/tailwind.config.js` and mirrored as CSS variables in `frontend/src/styles/index.css`.

**Colour** (contrast measured against the page `#F4F1EA`):

| Token | Value | Use | Contrast |
|---|---|---|---|
| `ink-primary` | `#15130F` | text, primary button | 16.4:1 |
| `ink-secondary` | `#3A362E` | body text | 10.7:1 |
| `ink-muted` | `#645E52` | secondary text | 5.7:1 |
| `ink-subtle` | `#6E675A` | tertiary text | 4.8:1 |
| `primary` (redline) | `#B3291A` | marks, links, focus, danger | 5.7:1 (white on it 6.5:1) |
| `verified` | `#1F6B4A` | verified markers | 5.7:1 |
| `surface-50` / `surface` / `surface-100` / `surface-200` | `#F4F1EA` / `#FBF9F4` / `#ECE8DE` / `#E2DDCF` | page / raised / recessed / rule fill | n/a |
| `line` | `#DDD7C9` | decorative hairline rules between content (not needed to identify a control) | 1.3 |
| `line-strong` | `#8A8373` | borders of form controls and buttons (WCAG 1.4.11 non-text contrast) | 3.3 on paper, 3.6 on the raised surface, 3.1 on the recessed surface |

**Type** (Geist Variable, Geist Mono Variable, Lora Variable; all self-hosted through `@fontsource-variable`, no third-party font requests): `display-xl` (fluid 2.75 to 6 rem), `display`, `title`, `heading` 1.375 rem, body 15 to 17 px, `eyebrow` mono 11 px uppercase, `.num` mono tabular numerals.

**Radius**: 2 / 4 / 6 / 10 px (hard-edged). **Elevation**: none by default; `shadow-float` only for things that float (dialogs). **Spacing**: Tailwind's 4 px scale; page gutters 16 px on phones, 32 px from `sm`; content widths narrow 48 rem, default 72 rem, wide 88 rem. **Icons**: Lucide, 16 px, stroke 1.75 in navigation. **Light theme only**: the app had no dark theme and none was justified.

## 5. Components (shadcn/ui)

The foundation is **shadcn/ui, installed with the real CLI** (`shadcn@2.3.0`, new-york style, `cssVariables: true`, `components.json` in `frontend/`). Generated into `src/components/ui/`: `button`, `badge`, `dialog`, `sheet`, `tooltip`, `tabs`, `dropdown-menu`, `command` (cmdk), `popover`, `sonner`, `skeleton`, `separator`, `progress`, `scroll-area`, `table`. The shadcn semantic colour classes (`bg-background`, `text-foreground`, `bg-accent`, `border-input`, `ring`, ...) are mapped to the paper-and-ink palette in `tailwind.config.js` (shadcn `primary` is ink; the red is `redline`). Customised after generation: `button` (ink default, outline, 40 px minimum height, 48 px large) and `sonner` (rewritten without `next-themes`; light theme only). `tabs`, `dropdown-menu`, `popover`, `skeleton`, `separator`, `progress`, `scroll-area` and `table` are installed but **not yet used by any screen**.

| Component | Role |
|---|---|
| `ui/button` + `lib/buttonClasses` | one button recipe (cva); `buttonClasses` is a thin wrapper that keeps the older call sites working |
| `ui/dialog`, `ui/sheet` (Radix) | modals: the evidence drawer, the mobile navigation sheet, the command palette (`CommandDialog`) |
| `ui/command` (cmdk) | `Ctrl/Cmd+K` palette (navigation only) |
| `ui/tooltip` | labels for icon-only buttons (the text is also the accessible name) |
| `ui/sonner` | toast host mounted in `App` |
| `ui/Page`, `PageHeader`, `Section` | content frame, serif title + breadcrumb + actions, ruled titled regions |
| `ui/Tag`, `EmptyState`, `ErrorState`, `LoadingState`, `Meter`, `SplitPane`, `Reveal` | product-specific pieces (provenance markers, honest states, accessible meter, keyboard-operable divider, one-time reveal) |
| `shell/*` | `AppShell`, `Sidebar`, `MobileBar`, `NavList`, `PublicHeader`, `CommandPalette`, `AccountMenu`, `Wordmark`, `RouteProgress` |
| `motion/*` | the motion layer (section 9) |

Not built: **a charting library** (the existing accessible bar and heatmap components were restyled; numbers stay as text).

## 6. Shell and navigation

Signed-in students get a left rail (from 1024 px) or a top bar with a left sheet (below). Signed-out visitors and the landing and sign-in pages get a light marketing header. Groups and routes (every entry is a real route; legacy paths unchanged):

* **Plan**: Placement plan (`/placement`)
* **Practice**: DSA Arena (`/dsa`, questions, companies), My progress, Analytics, Revision
* **Learn**: AI Mentor, GraphQL Lab (modules, playground)
* **Evidence**: Readiness audit (`/setup`), Ledger, Interview workspace and Report (only once a session exists), My sessions, GitHub, Roadmap
* **Account**: Mentor memory, Settings; the account block shows the signed-in email and a visible **Sign out**

Also: a skip link, focus moved to the page on every route change, `Ctrl/Cmd+K` command palette (navigation only; it never performs an action), breadcrumbs where they help (DSA, analytics, Lab, memory), and active-route indication that does not rely on colour (weight, a bar and `aria-current`).

## 7. Screen compositions

* **Landing**: a scroll-driven page. A giant serif hero whose lines are revealed through masks, with one red pencil underline; a **pinned interrogation** (from 1024 px, motion allowed) in which scrolling advances a specimen proof sheet through claim, three question levels, evidence, a struck-through gap and a stamped "Shaky" verdict (below 1024 px or with reduced motion it is a plain static sheet); "what counts / never counts" from the real eligibility rules; the product as an oversized contents index with an ink wipe on hover and focus; and a closing wordmark. A red reading-progress line runs along the top. No statistics or testimonials.
* **Sign-in / onboarding**: a split with a short statement of what is private beside the form; setup keeps its stepper, with ink-selected cards.
* **Placement plan**: a status block that opens with four real figures counted up from the plan (days to the placement date, due today, open, completed), then a main column (today's tasks, a ruled seven-day timetable) beside an evidence rail (assistant, limitations), a skills ledger (verified markers, no invented scores), readiness and history.
* **DSA Arena and questions**: a company list beside a topic index (the first-party catalogue has no companies, so topics are the way in); a filter rail beside a compact ruled question list; URL-held filters unchanged. Topic rows wipe to ink on hover and focus.
* **Coding workspace**: a full-height tool. Problem and samples on the left, editor above and console below on the right, both dividers draggable and keyboard-operable; submission history sits with the results. On phones: problem, editor, console and history in that order with Run and Submit pinned to the bottom. The Monaco theme matches the paper palette. A submission verdict is also **stamped** (green for Accepted, red otherwise); the verdict is always written in text too and the stamp is hidden from assistive technology.
* **Analytics and revision**: a ruled stat strip, thin honest bars, ruled lists, "not enough data" notices preserved.
* **AI mentor**: a history rail and a full-height transcript (labelled blocks, not bubbles), readable code blocks, a pinned composer, memory notes kept low-key under the answer.
* **GitHub insights**: a connection block and data-first sections; the contribution heatmap uses a neutral ink scale (red would read as an error and green as verified; GitHub activity is context).
* **GraphQL Lab**: lessons and exercise side by side on wide screens; stacked on small ones.
* **Report, ledger, interview workspace, sessions, roadmap, settings, memory, 404**: the same type, rules and components; the report's off-system indigo ring and nested cards were replaced.

## 8. Accessibility and responsive verification

Tooling: a dependency-free harness in the repository, `frontend/scripts/visual-qa.mjs`, drives a locally installed Chrome over the DevTools protocol (local development only; it signs in to the Firebase Auth emulator). The axe-core library was installed outside the repository for the audit. A second script, `frontend/scripts/ui-flow-qa.mjs`, runs a scripted journey through the real UI.

* **Routes and widths**: 22 routes sampled (public and signed-in) at 1440, 1024, 768, 390 and 320 px: no horizontal page overflow, exactly one `h1`, no unnamed controls, no console errors. **Not sampled**: `/workspace/:sessionId` and `/report/:sessionId` (they need a live interrogation session), `/dsa/companies/:companyId` (the first-party catalogue has no companies), and the 404 page.
* **axe-core, WCAG 2.1 A and AA**: 19 signed-in routes at 1440 and 390 px; the signed-out routes, GitHub (with the QA stub) at all five widths; the workspace, plan, mentor, Lab module, analytics, settings and memory pages at 1024, 768 and 320 px; and the open command palette. Findings and fixes: nested interactive controls in the palette options; green-on-green retest chip text at about 3.3:1 (it also broke the contract rule that label text uses ink); a scrollable GitHub heatmap that was not keyboard-focusable (replaced by a grid that fits the width instead of scrolling); and the report's off-palette indigo ring. **Final result: zero axe violations on every page audited.**
* **Non-text contrast (WCAG 1.4.11), found by calculation because axe does not test it**: the first draft's control borders were 1.9:1 although a comment claimed 3:1. The control border was darkened to `#8A8373` (3.3:1) and the hairline rules were kept light because they are decorative. axe also cannot judge reading order or meaning, so this is evidence, not a certificate.
* **Keyboard**: skip link, focus to the page on navigation, palette (`Ctrl+K`, arrows, Enter, Esc), dialog focus trap and return, splitters (arrow keys, Home, End), existing radio and form patterns. Exercised by the unit tests and the palette run; a full manual screen-reader pass was **not** done.
* **Reduced motion**: with the preference on, the landing page has 0 hidden reveal blocks and 0 running animations; with it off, 17 reveals wait for scroll and 3 animations run.
* **Second pass (motion rebuild)**: `visual-qa.mjs --axe` on `/`, `/placement`, `/dsa`, `/dsa/questions`, `/mentor`, `/graphql-lab`, `/dsa/analytics`, `/sessions`, `/settings` and `/report/demo` at 1440, 1024, 768, 390 and 320 px: no overflow, one `h1`, no unnamed controls. It found two things, both fixed: the inactive steps of the pinned story were dimmed with opacity (axe: serious contrast; now a colour change that passes) and the verdict stamp, while scaling in, briefly overflowed a 320 px page (the section now clips horizontally). Landing page re-run after both fixes, with and without reduced motion at 1440, 1024, 390 and 320 px: clean. Frame captures at fixed times and scroll positions were used to check the hero reveal and the pinned story.
* **Real-UI journey** (`ui-flow-qa.mjs`, local Auth emulator, the real public Judge0 instance, the mock mentor model; the backend ran with the verification flag set in its process environment only): sign-up through the form, goals, plan from real questions, a wrong then a correct submission (hidden data withheld; accepted and marked solved), analytics (1 solved), revision (one scheduled item), mentor transcript, a graded GraphQL exercise, and the dashboard showing the diagnostic done from the verified record. **12 of 12 checks passed** on the fourth run, and again on the final run after the motion rebuild. The first three runs failed for reasons outside the product: two bugs in my script (a double-toggled editor checkbox; a missing weak-area input) and timeouts from the public Judge0 instance, during which the UI correctly showed "Code execution is not available right now. Try again in a moment." The script now retries a rate-limited judge a bounded number of times.

## 9. Motion

The library is `motion` (`motion/react`) loaded through `LazyMotion` (lazy `domMax`) inside `MotionConfig reducedMotion="user"`; `lenis` smooth scroll runs on the landing page only, on fine pointers, and never under reduced motion. Components live in `src/components/motion/`:

* `MaskedText`: headline lines rise out of a mask. `CountUp`: a real number counting up when it scrolls into view (it starts at its true value wherever motion cannot run). `Stamp`: the verdict rubber stamp, decorative and `aria-hidden`. `Magnetic`: a small pull on the primary call to action (fine pointers only). `usePinnedStory`: enables the pinned scroll story only at 1024 px and wider with motion allowed. `useSeen`/`canObserve`: guard against environments without `IntersectionObserver` (the unit tests).
* **Shell**: the active navigation item and its red bar are single shared-layout elements that glide between items; a red hairline sweeps across the top on every route change; a 240 ms route transition (`fill: backwards`, so no transform lingers and traps fixed elements); a faint static paper grain.
* **Screens**: pinned scroll story, ink-wipe index rows, count-up figures, stamped verdicts, one-time reveals.
* Nothing animates inside the editor or the output panes. Only transform and opacity are animated. Under reduced motion there are no transform animations, Lenis is off, the landing story is static, and a global CSS rule collapses durations.

## 10. Limits and honest notes

* The skill's database and `search.py` were unavailable (section 2). The design system was derived from the skill's rules and the product, not from a generated recommendation.
* Whether the result is "Awwwards level" is a judgement this document cannot make: the scroll-driven landing, the stamp and the shared-layout navigation were checked from captured frames, not by a jury.
* Awwwards research covered three sites (section 3); none is a developer-education product.
* **Not verified**: a human screen-reader pass; real-device touch testing (only emulated widths); Safari and Firefox (Chrome only); the live GitHub-connected screens in this phase (the layout was inspected with a QA-only stub of synthetic data, never shipped); the live Gemini mentor and live Firestore in this phase (this run used the local emulator and the mock mentor; those were verified earlier in Phase 10.2 against the previous UI and the data layer is unchanged).
* The public Judge0 instance is shared and rate-limited and timed out intermittently during the journey runs; this is the environment, not the frontend.
* Frame captures are static: smoothness (frame rate, Lenis feel on a real trackpad) was **not** measured on a real device.
* The shadcn `tabs`, `dropdown-menu`, `popover`, `skeleton`, `separator`, `progress`, `scroll-area` and `table` components are installed but unused.
* The sidebar's navigation list scrolls inside the rail on short viewports.
* The mentor renders fenced code as monospace blocks but does not syntax-highlight them.
* Existing report screens (`ResumeHeatmap`, claim evidence) keep their contract-locked verdict colours (pastel tints on paper).
* `npm audit` is unchanged in substance: the two moderate `react-router` 6.x advisories remain (documented in the Phase 10 report; not exploitable in this code).
* The compile-error counting fix and the Phase 10 reports are committed separately and are not part of this phase's changes.

## 11. Final regression (frontend)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | 15 files, **199 tests passed** (unchanged count; four existing tests were kept passing by keeping a visible Sign out, the `aria-modal` attribute, dialog focus return, and no browser storage beyond code drafts) |
| `npm run build` | exit 0 (the Monaco editor stays lazy-loaded; main bundle about 672 kB, 196 kB gzipped; the Monaco chunk stays lazy) |
| `npm audit --omit=dev` | unchanged: the two moderate `react-router` 6.x advisories (see section 10) |

The backend was not touched in this phase and its suites were not re-run here.

## 12. Files

New: `src/components/shell/*`, `src/components/landing/{ProofSheet,MethodSection,CountsSection,IndexSection}.tsx`, `src/components/ui/{Page,Tag,EmptyState,Meter,Reveal,SplitPane,Tooltip}.tsx`, `scripts/visual-qa.mjs`, `scripts/ui-flow-qa.mjs`, this document. Removed: the four superseded landing sections. Rewritten or restyled: every page under `src/pages/`, the placement, report, GitHub, GraphQL Lab and DSA components, `Dialog`, `Card`, `buttonClasses`, `tailwind.config.js`, `styles/index.css`, `main.tsx` (fonts), `monacoSetup.ts` (theme). `frontend/.env` (git-ignored) gained the public `VITE_FIREBASE_APP_ID` the login page requires.
