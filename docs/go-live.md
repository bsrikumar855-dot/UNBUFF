# Go-live runbook

The order to follow to take UNBLUFF from this repository to a running, safe deployment. Each step says who does it. Everything
the code can do for you is already done; the rest needs your accounts, your decisions or a lawyer.

Status of the application code: CI (backend, frontend, Firestore emulator) is green and blocking; data isolation between
students is tested; production refuses unsafe settings. See `security-and-launch.md` for the audit.

## 0. Before anything else: rotate every secret that has been shared (you)

These were pasted into chat or sit in local `.env` files during development, so treat them as exposed:

1. **Firebase service-account key**: Firebase console → Project settings → Service accounts → delete the old key, generate a new one.
2. **GitHub OAuth client secret**: GitHub → Settings → Developer settings → OAuth Apps → generate a new client secret.
3. **Gemini API key**: Google AI Studio / Cloud console → create a new key, delete the old one.
4. Put new values only in the hosting dashboard (Render) and never in a file in this repo. `.env` files are git-ignored.

## 1. Create the production projects (you)

- A **new Firebase project** for production (not the `unbluff-test-*` one). Enable Authentication (email/password), Firestore (production mode,
  region near your users) and Hosting. Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`
  (rules deny all browser access; only the backend's Admin SDK reads and writes).
- Turn on **Firestore backups**: Firestore → Disaster recovery → scheduled backups (daily, 7+ days retention). Test one restore.
- A **GitHub OAuth app** for production with the callback `https://<api host>/api/github/oauth/callback` (optional feature).

## 2. Backend on Render (you)

1. Dashboard → New → Blueprint → this repo (`render.yaml` defines the service).
2. Enter the secrets it asks for: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CORS_ORIGIN` (exact frontend origin, no path),
   `GEMINI_API_KEY`, and the four `GITHUB_*` values (or leave GitHub off).
3. Before deploying, validate the settings with the same checks the server runs:
   `cd backend && npm run preflight -- path/to/production.env` (an env file you keep outside the repo). Fix every ✘; read every ⚠.
4. After deploy: `GET https://<api host>/api/health` (up) and `/api/ready` (database reachable, 503 if not).
5. Set an **uptime monitor** (UptimeRobot, Better Stack, or Render alerts) on `/api/ready` with email/SMS alerts to you.

Cost and abuse controls already in the config: `LLM_DAILY_BUDGET` (model calls per student per day), `MAX_SESSIONS_PER_STUDENT`,
rate limits, `REQUIRE_EMAIL_VERIFICATION=true`. Watch your Gemini quota in the first week and tune them.

## 3. Frontend on Firebase Hosting (you)

Build with the production values, then deploy:

```
cd frontend
VITE_API_URL=https://<api host> \
VITE_FIREBASE_API_KEY=... VITE_FIREBASE_AUTH_DOMAIN=... VITE_FIREBASE_PROJECT_ID=... VITE_FIREBASE_APP_ID=... \
VITE_CONTACT_EMAIL=privacy@<your domain> \
npm ci && npm run build
firebase deploy --only hosting
```

`firebase.json` already sends the security headers (CSP, no framing, nosniff). Add your custom domain in Hosting and in Firebase Auth →
Settings → Authorized domains.

## 4. Code judging: Judge0 (you, optional but needed for DSA results)

Production refuses the local Docker runner. To enable Run/Submit and counted results you need a Judge0 server you operate:

1. Deploy Judge0 CE on a VM (it needs Linux cgroup v1 or the isolate-compatible settings from the Judge0 docs; the free Render tier cannot run it).
2. Put it behind HTTPS with an auth token. Set `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL`, `JUDGE0_AUTH_TOKEN` on the backend.
3. Run `cd backend && npm run smoke:judge0` against it. Only when it passes set `EXECUTION_PROVIDER_VERIFIED=true`.

Until then the DSA screens work for reading and running nothing; submissions are reported as unavailable and nothing counts.

## 5. Legal and company data (you, with a lawyer)

- Review `/privacy` and `/terms` (shown with a "Draft for legal review" banner). Fix the wording to match your operator details
  (company name, address, grievance contact under the DPDP Act), then remove the draft banner in `frontend/src/components/legal/LegalDoc.tsx`.
- Set `VITE_CONTACT_EMAIL`. Register the business and decide GST/tax before charging anyone (UNBLUFF has no billing yet).
- **Company question lists are unlicensed.** Production uses the 50 first-party practice problems only. Do not point
  `DSA_CATALOGUE_PATH` at the company catalogue in production; the server refuses it. Get a licence or write more first-party problems
  (`npm run practice:build`).

## 6. Launch as a private beta first (you)

Invite a small cohort (about 50 students at one college). Watch for a week: errors in the Render logs, Gemini cost and 503s, sign-up
friction, and the support inbox. Decide to open wider only after that.

## Quick reference: what the code guarantees

- Private by default: any new API route requires a verified sign-in unless it is explicitly public.
- Every private record is keyed by the signed-in student's id; tests try to read one student's data as another across every area.
- Refuses to start in production with mock sign-in, mock model, memory storage, wildcard CORS, Docker runners, or an unlicensed catalogue.
- Students can download all their data, delete it, and have audits auto-deleted after `SESSION_RETENTION_DAYS`.
