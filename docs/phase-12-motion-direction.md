# Phase 12: motion direction ("Redline Proof")

Phase 11 rebuilt the interface on shadcn/ui. Motion existed only on the landing page and in the shell. Phase 12 gives the
whole product one motion language and applies it with a different intensity on each screen. No behaviour, route, auth
flow, API or data changed; every animation is presentation over content that is always in the DOM.

## 1. References (visited, not copied)

These are real, live sites that I opened and inspected. Awwwards pages are the editorial record of each.

| Reference | Site | Awwwards page | What I took from it |
| --- | --- | --- | --- |
| Signal-A | https://signal-a.studio/ | https://www.awwwards.com/sites/signal-a-studio | Restraint: one idea carried by type and a single accent, with motion used for pacing a story, not decorating it. |
| OFFFORUM | https://www.offforum.com/ | https://www.awwwards.com/sites/offfforum | Editorial rhythm: ruled structure, large numerals, sections introduced by a line before the content. |
| Heron AI | https://heronaiapp.com | https://www.awwwards.com/sites/heron-ai | Product storytelling: a UI fragment doing the explaining inside the hero, in the product's own vocabulary. |
| Lidar Drone Scanning | https://drone.riotters.com/ | https://www.awwwards.com/sites/lidar-drone-scanning | Scan-as-reveal: content that is "measured" into view, and smooth scroll used only where it helps a long narrative. |

Honest limits of the research:

- The UI UX Pro Max skill was loaded, but its search database and script were not available in this environment (only
  the skill text). Its rules were applied from the skill text: reduced motion, 150–300 ms micro-interactions, never
  animate width/height, motion must convey meaning, reserve space to avoid layout shift. No query output is claimed.
- For Aevion/Lidar I could confirm the counters, smooth scroll and four canvases through the DOM, but a screenshot came
  back blank, so I did not see its visuals. I borrowed the idea, not a look.
- Nothing from these sites (copy, layout, assets, code) is reused. The direction below is built from this product's own
  subject: an interrogation that marks answers.

## 2. The idea

UNBLUFF marks what a student can defend. So the motion vocabulary is a proofreader's marks:

- ruled hairlines that **draw** in (a page is ruled before it is written on),
- a red **scan line** that sweeps over a block of real numbers once, as if measuring them,
- items that **rise** into their place on a short stagger,
- feedback as **marks**: a check that is drawn, a red strike that is struck through finished work,
- numbers and bars that grow to the value they actually have.

One easing everywhere: `EASE = [0.2, 0.7, 0.2, 1]`. Two springs: `SPRING_LAND` (stamps, things that land) and
`SPRING_GLIDE` (indicators that move between positions).

## 3. Tokens (`frontend/src/components/motion/tokens.ts`)

| Token | Value |
| --- | --- |
| Durations | instant 120 ms, fast 200, base 320, slow 520, hero 800 |
| Rise distance | 8 / 14 / 28 px |
| Stagger | 45 ms per item, capped at 8 items (so the last row of any list is in under 0.75 s) |
| Animated properties | `transform` and `opacity` only. `clip-path` in ScanReveal; stroke-dashoffset on tiny SVG marks. Never width/height/top/left. |

## 4. The system

| Piece | File | Job |
| --- | --- | --- |
| `Enter` | `motion/Enter.tsx` | A block rises into place when it reaches the viewport. |
| `RuleDraw` | `motion/RuleDraw.tsx` | A hairline draws (scaleX) when seen. Used by `PageHeader` and `Section`. |
| `ScanReveal` | `motion/ScanReveal.tsx` | Clip sweep and one scan line over a block of real numbers. |
| `CheckMark`, `Strike`, `Swap` | `motion/Marks.tsx` | Drawn check, red strike, keyed icon swap for toggles. |
| `GrowBar` | `motion/GrowBar.tsx` | Bar that follows a real 0..1 value with transform. Grows from zero only the first time it is seen. |
| `CountUp` | `motion/CountUp.tsx` | Counter to a real value. |
| `Thinking` | `motion/Thinking.tsx` | Three-dot "waiting" status for the mentor. `role="status"`. |
| `useNewIds` | `motion/useNewIds.ts` | Tells a list which items arrived after it loaded, so only those animate. |
| `useSeen` | `motion/useSeen.ts` | Shared passive scroll/resize registry (one rAF-throttled check for the whole page). |
| `startRouteTransition`, `useRouteNavigate` | `lib/viewTransition.ts` | Route crossfade through the View Transitions API. |
| `VerdictKey` | `landing/VerdictKey.tsx` | The landing hero's interactive explanation of the four verdicts. |
| `Thread` | `landing/Thread.tsx` | Scroll-linked red thread between landing sections. |

Libraries: the existing `motion` v14 (`m` + `LazyMotion`, `MotionConfig reducedMotion="user"`) and `lenis` (landing
only). No library was added; `package.json` and the lockfile are unchanged. Native CSS covers view transitions, the
thinking dots and the contribution-heatmap column fade.

### Why `useSeen` is a scroll registry and not an IntersectionObserver

An observer that only reports crossings never fires for an element a student jumps over (the End key, a scrollbar
drag, an in-page link), which left real content invisible. Verified in a browser against `/placement`. The shared
registry treats everything at or above the bottom edge of the viewport as seen, so a jump cannot strand content.

### Route transitions

React Router 6 under `BrowserRouter` ignores `Link viewTransition` (verified: `startViewTransition` was not called), so
`NavList` and the command palette navigate through `startRouteTransition`. Only `main#main` has a
`view-transition-name`, so the shell, sidebar and header stay still and only the page content crossfades (140 ms out,
240 ms in). It is skipped for modified clicks, the current route, browsers without the API and reduced motion. The
destination is applied inside the transition callback, so navigation is never delayed.

## 5. Per screen

| Screen | Intensity | What moves |
| --- | --- | --- |
| Landing | Expressive | Hero type, the verdict key (clickable, arrow-key navigable, scan-revealed), red threads between sections with labels, scroll-linked sections, real counters. Lenis smooth scroll here only. |
| Placement plan | Clear | Page header rule and rise; stats scan once; tasks rise on a short stagger; a completed task draws a check and a red strike. |
| DSA Arena | Restrained | Header; the question rows rise with a small capped stagger on a new page of results; bookmark icon swap. Filtering never replays old rows. |
| Coding workspace | Professional | The editor never animates. The run output region fades in and its left border takes the outcome colour; announced politely. |
| DSA analytics / progress meters | Real values only | Bars grow to their true value the first time they are seen and follow later changes; nothing animates when a value is unchanged. |
| AI Mentor | Readable | No fake streaming and no typewriter. Only messages that arrive after the conversation loaded fade in; a "thinking" status shows while waiting; switching conversations does not replay history. |
| GitHub insights | Subtle | Contribution heatmap columns fade in once. |
| GraphQL Lab | Clear | Module list; the result panel and each check, with a drawn check for passing checks. |
| Career | Clear | Rows rise; the tab rule glides between tabs; save and tracker-saved feedback marks. |

Contract-locked verdict colours (CONTRACT §6/§7) appear on pips and dots only, never as label text, and the verdict
rules shown on the landing page are the contract's own turn rules (defended = 3 levels passed, shaky = 1–2, bluff = 0,
honest gap = said so; weak verdicts get a fix task and a retest).

## 6. Reduced motion, accessibility, performance

- `MotionConfig reducedMotion="user"` plus explicit checks: under `prefers-reduced-motion` content renders in its final
  state, view transitions are not started, and the CSS animations are inside `no-preference` media queries.
- Content is always in the DOM and readable without animation. Where animation cannot run (jsdom, no observer) the
  components render static markup, which is also what the unit tests assert.
- Decorative marks are `aria-hidden`; the strike and check never carry the state alone (the checkbox/label does);
  the run output region and thinking indicator are live regions.
- Only compositor properties animate; one shared scroll listener (passive, rAF-throttled); stagger capped at 8.
- Build: main chunk 688.8 kB (201.6 kB gzip), `monacoSetup` 3.07 MB (unchanged; lazy, editor only), Career 65 kB, Placement
  43 kB. No dependency was added.

## 7. Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint src tests` | clean |
| `npx vitest run` | 17 files, 262 tests pass (17 new in `tests/motion.test.tsx`) |
| `npm run build` | succeeds |
| Reveal check (nothing stuck invisible) at 1440, stepwise scroll and jump-to-end, on `/`, `/placement`, `/dsa`, `/dsa/questions`, `/dsa/analytics`, `/mentor`, `/mentor/memory`, `/graphql-lab`, `/career`, `/career?tab=saved`, `/github`, `/settings` | pass |
| Same, with `prefers-reduced-motion: reduce` | pass |
| Overflow and axe (WCAG 2.0/2.1 A/AA) at 1440, 1024, 768, 390, 320 on ten routes | no horizontal overflow; one axe colour-contrast hit on `/career` at 1440, see below |
| Route transition (CDP) | fires (~365 ms) on sidebar navigation; not started under reduced motion |
| Mentor in a browser (mock backend) | thinking status shows while sending; the new message fades in over about 300 ms; no overflow |

The one axe hit: the match-score caption on the first Career row, captured while that row was still fading in (axe
ran straight after load). Re-running axe on `/career` once the page had settled (several seconds after load) gave zero violations.
The row's text colour is the same muted ink used elsewhere and passes when fully opaque. I treat this as a
measurement taken mid-fade, not a defect, but it is worth knowing that an automated audit that fires at the first
frame can report it.

## 8. What is not verified or not done

- No real-device or Safari/Firefox run. The CDP checks used Chrome (headless). View Transitions are Chromium/Safari 18+
  only; elsewhere the crossfade simply does not happen and navigation works as before.
- No Lighthouse or frame-rate profile was taken; performance claims rest on the property and listener discipline above,
  not a measured score.
- The Mentor was exercised in mock mode (no model); the animation is independent of the reply source.
- Nothing was committed, pushed or deployed. Phase 12 changes sit in the working tree with the earlier uncommitted work.

## 9. Commands

```bash
cd frontend
npx tsc --noEmit && npx eslint src tests && npx vitest run && npm run build
# visual QA against a local stack (emulators + backend + vite); needs a throwaway emulator user
QA_EMAIL=... QA_PASSWORD=... node scripts/visual-qa.mjs --base http://localhost:5175 --api http://localhost:8097 \
  --emulator http://127.0.0.1:9099 --axe <path to axe.min.js> --routes /,/placement --widths 1440,390 --auth
```
