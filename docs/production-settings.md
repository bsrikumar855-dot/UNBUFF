# Production settings sheet

Everything you type into a dashboard to run UNBLUFF in production, in one place. Templates: `backend/production.env.example`
and `frontend/production.env.example` (placeholders only; a filled copy must stay outside the repo). Check your filled backend
file with `cd backend && npm run preflight -- /path/to/production.env`: it validates it exactly as the server does at startup.

Legend: 🔒 secret (dashboard only, never in git) · ✏️ you choose · ✅ already set by `render.yaml`

## A. Firebase (console.firebase.google.com), the production project

| Where | What to do |
| --- | --- |
| Add project | New project, **not** the `unbluff-test-…` one. Note the **Project ID** (used below). |
| Build → Authentication → Sign-in method | Enable **Email/Password**. Settings → Authorized domains: add your frontend domain. |
| Build → Firestore Database | Create database, **production mode**, a region near your students (e.g. `asia-south1`). |
| Firestore → Rules / Indexes | From the repo root: `firebase deploy --only firestore:rules,firestore:indexes --project <id>`. The rules deny all browser access. |
| Firestore → Disaster recovery | Create a **daily backup schedule**, retention 7 days or more. Do one test restore. |
| Project settings → General → Your apps → Web app | Register a web app. Copy `apiKey`, `authDomain`, `projectId`, `appId` for the **frontend** sheet (section C). |
| Project settings → Service accounts | **Generate new private key** (after deleting the old one). Paste the whole JSON on one line into Render as 🔒 `FIREBASE_SERVICE_ACCOUNT_JSON`. |
| Build → Hosting | Get started; add your custom domain. |
| Build → App Check (optional, later) | Register the web app with **reCAPTCHA v3**; the site key goes in the frontend as `VITE_FIREBASE_APPCHECK_SITE_KEY`. |

## B. Backend, Render (dashboard.render.com → New → Blueprint → this repo)

`render.yaml` fills the ✅ rows. You enter the rest.

| Variable | Value | Who |
| --- | --- | --- |
| `NODE_ENV` | `production` | ✅ |
| `STORE` | `firestore` | ✅ |
| `LLM_MODE` | `live` | ✅ |
| `TRUST_PROXY` | `1` | ✅ |
| `FIREBASE_PROJECT_ID` | the production project id | ✏️ |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the service-account JSON, one line | 🔒 |
| `CORS_ORIGIN` | `https://<frontend domain>`: scheme + host only, no path or trailing slash | ✏️ |
| `GEMINI_API_KEY` | new key from Google AI Studio | 🔒 |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | ✅ |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.6-flash` | ✅ |
| `MENTOR_TEMPERATURE` | `0.7` | ✅ |
| `LLM_DAILY_BUDGET` | model calls per student per day; start at `150`, lower it if your Gemini bill worries you | ✅ / ✏️ |
| `MAX_SESSIONS_PER_STUDENT` | `50` | ✅ |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | ✅ |
| `SESSION_RETENTION_DAYS` | `365`: audits older than this are deleted automatically | ✅ |
| `APP_CHECK` | `off` now; `monitor` after the frontend ships with the site key; `enforce` a few days later | ✅ / ✏️ |
| `EXECUTION_PROVIDER` | `none` until Judge0 exists (see D) | ✅ |
| `LATEX_COMPILER` | `none` (the PDF preview reports "unavailable") | ✅ |
| `LEETCODE_PUBLIC_LOOKUP` | `false` | ✅ |
| `LOG_LEVEL` | `info` | ✅ |

Optional, GitHub insights (**all** of these or none): `GITHUB_CLIENT_ID`, 🔒 `GITHUB_CLIENT_SECRET`,
`GITHUB_REDIRECT_URI` = `https://<api host>/api/github/oauth/callback`, `GITHUB_FRONTEND_URL` = your frontend origin,
🔒 `GITHUB_TOKEN_ENCRYPTION_KEY` = output of `openssl rand -base64 32`. Create the OAuth app at GitHub → Settings → Developer
settings → OAuth Apps; its **Authorization callback URL** must equal `GITHUB_REDIRECT_URI` exactly.

Never set in production: `DSA_CATALOGUE_PATH` pointing at the company catalogue (refused), `STORE=memory`, `LLM_MODE=mock`,
`CORS_ORIGIN=*` (all refused by the server).

After the first deploy: open `https://<api host>/api/health` (up) and `/api/ready` (database reachable). Add an uptime monitor
on `/api/ready` with alerts to your phone or email.

## C. Frontend, build settings (Firebase Hosting)

Copy `frontend/production.env.example` to `frontend/.env.production` (git-ignored), fill it, then:

```
cd frontend && npm ci && npm run build
firebase deploy --only hosting --project <id>
```

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://<api host>` |
| `VITE_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` / `_APP_ID` | from the web app you registered in A |
| `VITE_CONTACT_EMAIL` | the address students write to for data requests (shown on Privacy and Terms) |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` | optional, from App Check |

These are public by design (they ship in the page's JavaScript); they just have to be the production values.

## D. Code judging, only when you have a Judge0 server

On the backend set `EXECUTION_PROVIDER=judge0`, `JUDGE0_URL=https://<judge0 host>`, 🔒 `JUDGE0_AUTH_TOKEN`
(and `JUDGE0_AUTH_HEADER` if you renamed it). Run `cd backend && npm run smoke:judge0` against it. Only if it passes set
`EXECUTION_PROVIDER_VERIFIED=true`; until then no judged result counts toward analytics.

## E. Final check before inviting anyone

- [ ] The three old secrets are rotated (Firebase key, GitHub secret, Gemini key) and the old ones deleted.
- [ ] `npm run preflight` prints ✔ and you have read every ⚠.
- [ ] `/api/ready` returns `{"ready":true,...}` and the uptime monitor is alerting.
- [ ] Sign up with a fresh email on the real site, verify the email, run one audit, delete your data from Settings.
- [ ] Privacy and Terms reviewed by a lawyer; the draft banner removed.
- [ ] A Firestore backup exists.
