# Production readiness (18 October 2026)

> **Update, 22 October 2026:** a full data-isolation and hardening audit, with the launch checklist, is in
> [`security-and-launch.md`](security-and-launch.md). Read that first; this page is the earlier baseline.

## Verdict

**The code is release-quality and CI is green. The deployment is not yet verified against the real services, so this is not a "ship it" without the operator steps below.** Everything that can be proven without credentials was proven. Four dependencies could not be, because their configuration does not exist where this was built.

## What was wrong, and is fixed

| Finding | Effect | Fix |
| --- | --- | --- |
| `main` CI had been **red since the shadcn rebuild** (frontend `typecheck` failed on every push after `deb66a5`). | Nothing could be released from a green build. | Git tracked `ui/Button.tsx` and `ui/Dialog.tsx`, while the files and every import use `button` and `dialog`. Windows and macOS hide this; Linux (CI, Docker, Render) does not. The index now records the real lowercase names. Reproduced on a clean copy: TS1261 before, green after. A scan of every tracked and untracked file found no other mismatch. |
| Non-breaking dependency advisories | Patch-level lockfile updates were available. | `npm audit fix` (no `--force`): backend now reports **0 vulnerabilities**. |

## Checks (clean copy of the tree, `npm ci`, Node 24 locally; CI uses Node 20)

| Step | Backend | Frontend |
| --- | --- | --- |
| `npm ci` | pass | pass |
| lint | clean | clean |
| typecheck | clean | clean |
| tests | 1,079 pass (coverage thresholds met) | 300 pass |
| build | pass | pass |
| Firestore emulator tests | 44 pass (not part of CI) | n/a |

No secret-shaped strings, `.env` files or service-account files are tracked (only `.env.example`).

## Still open (none can be closed from this machine)

1. **Judge0 is unverified.** Until an operator verifies a real deployment (`npm run smoke:judge0`, then sets `EXECUTION_PROVIDER_VERIFIED=true` themselves), judged submissions are deliberately not counted as achievements. This is the safe state, not a fault.
2. **Firebase sign-in and Firestore are verified only on the emulators**, not a real project (indexes, rules, restart persistence). Mentor, Career and LeetCode data are durable only with `STORE=firestore`.
3. **GitHub OAuth is unverified against GitHub** (no OAuth app configured).
4. **Career listings** come from Freehire's public API; the live check is `npm run career:smoke` and was not run in CI.
5. **LeetCode** has no official integration. Students link a username and import their own numbers; nothing is live or verified (see `leetcode-integration.md`). Connecting an account would need LeetCode's permission.
6. **Deployment files** (`render.yaml`, `deploy.sh`) do not list every variable the newer features need, and CI has no emulator, index or audit step. They were not changed, because they depend on real credentials and project choices.
7. **Dependencies:** `react-router` 6 has two moderate advisories fixed only in v7 (an open redirect via a backslash in `Link`/`useNavigate`, and an SSR-hydration issue). The app navigates only to fixed internal routes and has no server rendering. The remaining high findings come from Tailwind 3's build tooling (`braces`, `chokidar`, `micromatch`), which is not shipped; the fix is a Tailwind 4 migration. Both are planned work, not done here.
8. Retention, backups, key rotation and alerting are decisions for the operator (see `phase-10-release-readiness.md` §9).

## Operator steps

Follow `phase-10-release-readiness.md` §9 in order. The new features add no new service: Career needs outbound access to Freehire's public API, and LeetCode needs nothing external.
