#!/usr/bin/env bash
# Deploy the backend to Cloud Run, built remotely by Cloud Build (no local Docker needed).
# The Gemini key comes from Secret Manager, never from the image, a file, or a log.
#
# Usage (from anywhere):
#   SETUP=1 bash backend/scripts/deploy.sh        # first time: APIs, Firestore, secret, IAM, deploy
#   bash backend/scripts/deploy.sh                # later deploys
#   CORS_ORIGIN=https://<app>.web.app bash backend/scripts/deploy.sh
set -euo pipefail

REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-unbluff-api}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.1-flash-lite}"   # free tier: ~20 req/day on 3.6-flash
GEMINI_FALLBACK_MODEL="${GEMINI_FALLBACK_MODEL:-gemini-3.6-flash}"
CORS_ORIGIN="${CORS_ORIGIN:-*}"   # placeholder until the Firebase Hosting URL exists
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
: "${PROJECT:?No project. Run: gcloud config set project <id>}"

if [[ "${SETUP:-0}" == "1" ]]; then
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
    firestore.googleapis.com secretmanager.googleapis.com --project "$PROJECT"

  if ! gcloud firestore databases describe --database='(default)' --project "$PROJECT" >/dev/null 2>&1; then
    gcloud firestore databases create --location="$REGION" --type=firestore-native --project "$PROJECT"
  fi

  if ! gcloud secrets describe gemini-api-key --project "$PROJECT" >/dev/null 2>&1; then
    # Read the key from backend/.env and pipe it via stdin: never echoed, never written to disk.
    grep -E '^GEMINI_API_KEY=' "$ROOT/backend/.env" | head -1 | cut -d= -f2- | tr -d '\r\n"' \
      | gcloud secrets create gemini-api-key --replication-policy=automatic --data-file=- --project "$PROJECT"
  fi

  # Cloud Run's default runtime identity is the Compute Engine default service account.
  NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
  RUNTIME_SA="${RUNTIME_SA:-${NUMBER}-compute@developer.gserviceaccount.com}"
  gcloud secrets add-iam-policy-binding gemini-api-key --project "$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor >/dev/null
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/datastore.user --condition=None >/dev/null
fi

cd "$ROOT"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --source backend \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars "NODE_ENV=production,STORE=firestore,LLM_MODE=live,GEMINI_MODEL=${GEMINI_MODEL},GEMINI_FALLBACK_MODEL=${GEMINI_FALLBACK_MODEL},CORS_ORIGIN=${CORS_ORIGIN}"

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
