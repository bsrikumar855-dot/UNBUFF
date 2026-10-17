#!/usr/bin/env bash
# Full UNBLUFF flow with curl + jq:
# health → roles → extract → confirm → interrogate every claim → report → fix-task → retest → report
#
#   API=http://localhost:8080 bash scripts/smoke.sh
#   SMOKE_DELAY=7 API=... bash scripts/smoke.sh     # live mode on a free-tier key
#
# Answers mix strong answers, a short answer and "I don't know". Works in mock and live mode.
set -euo pipefail

API="${API:-http://localhost:8080}/api"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v jq >/dev/null 2>&1; then
  jqr() { jq -r "$1"; }
else
  jqr() { node "$HERE/jq-lite.mjs" "$1"; }
fi

hr() { printf '\n==== %s ====\n' "$1"; }

# Optional pacing for free-tier Gemini quotas (e.g. SMOKE_DELAY=7 for 20 requests/minute).
pause() { if [[ -n "${SMOKE_DELAY:-}" ]]; then sleep "$SMOKE_DELAY"; fi; }

post() { # post <path> <json>
  local out status
  pause
  out=$(curl -sS --max-time "${CURL_TIMEOUT:-90}" -w '\n%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' --data-binary "$2")
  status="${out##*$'\n'}"
  out="${out%$'\n'*}"
  if [[ "$status" != 2* ]]; then echo "HTTP $status on POST $1: $out" >&2; return 1; fi
  printf '%s' "$out"
}

get() {
  local out status
  out=$(curl -sS --max-time "${CURL_TIMEOUT:-90}" -w '\n%{http_code}' "$API$1")
  status="${out##*$'\n'}"
  out="${out%$'\n'*}"
  if [[ "$status" != 2* ]]; then echo "HTTP $status on GET $1: $out" >&2; return 1; fi
  printf '%s' "$out"
}

json_str() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }

RESUME='Priya Sharma - B.Tech Computer Science, 2026
Built a React e-commerce dashboard with Redux handling 10k+ products
Implemented REST API integration with Axios and JWT auth
Made the site fully responsive using CSS Grid and Flexbox
Wrote unit tests with Jest achieving 80% coverage
Used Git and GitHub for version control in a 4-member team
Organised the college coding club hackathon for 200 students'

STRONG_ANSWERS=(
  "I personally wrote the products slice and the ProductTable component. When a filter changes I dispatch setFilter, the reducer returns a new state object, useSelector sees a different reference and schedules a re-render, React diffs the new element tree against the old one using keys and commits only the changed rows."
  "I built it with useReducer for the cart and Redux Toolkit for products because the product list was shared by three pages; Context would have re-rendered every consumer on each change. The downside was boilerplate, and once a stale closure in a useEffect showed old prices until I added the dependency."
  "Step by step: the component calls setState, React marks the fiber dirty, on the next render it calls the component again, reconciles the returned elements with the previous tree and applies the minimal DOM updates in the commit phase, then runs effects."
)
REST_ANSWERS=(
  "I personally wrote the Axios client for GET /products, POST /cart and POST /auth/login, with a request interceptor that adds the Authorization Bearer token."
  "On a 401 my response interceptor calls POST /auth/refresh once, stores the new access token in memory, and replays the original request; if the refresh fails it clears the token and redirects to the login page."
  "I kept the access token in memory rather than localStorage because any XSS script can read localStorage; the trade-off is that a hard refresh loses it until the httpOnly refresh cookie gets a new one, which caused a brief logged-out flash we had to handle."
)
CSS_ANSWERS=(
  "I personally built the product listing page with CSS Grid using repeat(auto-fill, minmax(220px, 1fr)) for the cards, and used Flexbox for the header and the checkout form rows."
  "auto-fill creates as many 220px tracks as fit in the container, then the 1fr maximum shares the leftover space equally, so the cards grow until another 220px column fits and the column count jumps."
  "I chose Grid over flex-wrap because flex-wrap stretches the orphan cards in the last row wider than the others, while Grid keeps every track the same width; the downside was overflow in a 280px sidebar, which I fixed with minmax(min(220px, 100%), 1fr)."
)
SHORT_ANSWER="It just works fine."
GAP_ANSWER="Honestly, I don't know how that part works internally."

hr "health";          get /health | jqr '.'
hr "roles";           get /roles | jqr '.'
hr "role detail (skill ids)"; get /roles/frontend_developer | jqr '.skills | length'

hr "extract"
EXTRACT=$(post /claims/extract "{\"role_id\":\"frontend_developer\",\"resume_text\":$(json_str "$RESUME"),\"declared_skills\":[\"TypeScript\"]}")
echo "$EXTRACT" | jqr '.'
SID=$(echo "$EXTRACT" | jqr '.session_id')
COUNT=$(echo "$EXTRACT" | jqr '.claims | length')
echo "session: $SID   claims: $COUNT"

hr "confirm (unchanged list)"
CLAIMS_JSON=$(echo "$EXTRACT" | node -e '
  const b = JSON.parse(require("fs").readFileSync(0, "utf8"));
  process.stdout.write(JSON.stringify(b.claims.map(({ id, text, resume_line, skill_id }) => ({ id, text, resume_line, skill_id }))));')
post /claims/confirm "{\"session_id\":\"$SID\",\"claims\":$CLAIMS_JSON}" | jqr '.progress'

answer_for() { # answer_for <claim index> <turn number> <skill id>
  local idx=$1 n=$2 skill=$3 k=$(( ($2 - 1) % 3 ))
  if (( idx == 1 && n == 2 )); then echo "$SHORT_ANSWER"; return; fi   # 2nd claim: short answer at L2 → shaky
  if (( idx == 3 )); then echo "$GAP_ANSWER"; return; fi                # 4th claim: honest gap
  case "$skill" in
    rest_apis) echo "${REST_ANSWERS[$k]}" ;;
    responsive_css) echo "${CSS_ANSWERS[$k]}" ;;
    *) echo "${STRONG_ANSWERS[$k]}" ;;   # React answers: on-topic for React claims, off-topic (and graded so) elsewhere
  esac
}

for (( i = 0; i < COUNT; i++ )); do
  CID=$(echo "$EXTRACT" | jqr ".claims[$i].id")
  SKILL=$(echo "$EXTRACT" | jqr ".claims[$i].skill_id")
  hr "interrogate $CID ($SKILL)"
  TURN=$(post /interrogate "{\"session_id\":\"$SID\",\"claim_id\":\"$CID\"}")
  echo "Q (L$(echo "$TURN" | jqr '.level')): $(echo "$TURN" | jqr '.question')"
  n=0
  while [[ "$(echo "$TURN" | jqr '.turn')" != "done" ]]; do
    n=$((n + 1))
    A=$(answer_for "$i" "$n" "$SKILL")
    echo "A: $A"
    TURN=$(post /interrogate "{\"session_id\":\"$SID\",\"claim_id\":\"$CID\",\"answer\":$(json_str "$A")}")
    echo "   level_passed=$(echo "$TURN" | jqr '.grade.level_passed')  guard_flips=$(echo "$TURN" | jqr '.grade.guard_flips | length')  turn=$(echo "$TURN" | jqr '.turn')"
    if [[ "$(echo "$TURN" | jqr '.turn')" != "done" ]]; then
      echo "Q (L$(echo "$TURN" | jqr '.level'), $(echo "$TURN" | jqr '.turn')): $(echo "$TURN" | jqr '.question')"
    fi
  done
  echo "→ verdict=$(echo "$TURN" | jqr '.claim.verdict') levels_passed=$(echo "$TURN" | jqr '.claim.levels_passed') proficiency=$(echo "$TURN" | jqr '.claim.proficiency')"
  echo "  progress: $(echo "$TURN" | jqr '.progress' | tr -d '\n ')"
done

hr "report"
REPORT=$(get "/report/$SID")
echo "$REPORT" | jqr '.'
echo "readiness=$(echo "$REPORT" | jqr '.readiness') coverage=$(echo "$REPORT" | jqr '.coverage')"

read -r WEAK WEAK_SKILL < <(echo "$REPORT" | node -e '
  const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const c = r.claims.find((c) => c.verdict === "shaky") ?? r.claims.find((c) => ["bluff", "honest_gap"].includes(c.verdict));
  console.log(c ? c.id + " " + c.skill_id : "");') || true
if [[ -z "$WEAK" ]]; then echo "No weak claim to fix/retest"; exit 0; fi

hr "fix-task $WEAK"
post /fix-task "{\"session_id\":\"$SID\",\"claim_id\":\"$WEAK\"}" | jqr '.'

hr "retest $WEAK"
TURN=$(post /interrogate "{\"session_id\":\"$SID\",\"claim_id\":\"$WEAK\",\"mode\":\"retest\"}")
echo "Q (L$(echo "$TURN" | jqr '.level'), retest): $(echo "$TURN" | jqr '.question')"
n=0
while [[ "$(echo "$TURN" | jqr '.turn')" != "done" ]]; do
  n=$((n + 1))
  LEVEL=$(echo "$TURN" | jqr '.level')
  A=$(answer_for -1 "$LEVEL" "$WEAK_SKILL")   # strong, on-topic answer for this level
  echo "A: $A"
  TURN=$(post /interrogate "{\"session_id\":\"$SID\",\"claim_id\":\"$WEAK\",\"answer\":$(json_str "$A")}")
  echo "   level_passed=$(echo "$TURN" | jqr '.grade.level_passed') turn=$(echo "$TURN" | jqr '.turn')"
  if [[ "$(echo "$TURN" | jqr '.turn')" != "done" ]]; then
    echo "Q (L$(echo "$TURN" | jqr '.level')): $(echo "$TURN" | jqr '.question')"
  fi
done
echo "→ retest: $(echo "$TURN" | jqr '.claim.retest' | tr -d '\n ')  verdict=$(echo "$TURN" | jqr '.claim.verdict')"

hr "report after retest"
REPORT2=$(get "/report/$SID")
echo "$REPORT2" | jqr '.'
echo "readiness: $(echo "$REPORT" | jqr '.readiness') → $(echo "$REPORT2" | jqr '.readiness')   coverage: $(echo "$REPORT2" | jqr '.coverage')"
echo "SMOKE OK"
