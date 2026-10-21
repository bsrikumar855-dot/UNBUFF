# LeetCode profile link and student-supplied import

## 1. Research conclusion (checked 18 October 2026)

**There is no official, documented way for UNBLUFF to read a student's LeetCode data, so UNBLUFF does not connect to LeetCode. It stores a username the student gives it, and numbers the student imports themselves.**

What was checked, and what it says:

| Source | Finding |
| --- | --- |
| Terms of Service, https://leetcode.com/terms/ (last modified 04/05/2024 on the page) | "Activities such as 'crawling,' 'scraping,' or 'spidering' any part of the Service, and attempting to decompile, reverse engineer, or discover the source code or underlying ideas of the Service, are strictly forbidden." It also bars processes that run while the user is not logged in and anything that places undue load on the service. |
| Privacy Policy, https://leetcode.com/privacy/ (last modified 12/13/2017) | Describes LeetCode's own collection and sharing. It offers no API, OAuth or data-export mechanism for third parties. |
| Discuss thread, https://leetcode.com/discuss/post/1297705/is-there-public-api-endpoints-available-for-leetcode/ | No official answer. Community replies describe calling LeetCode's internal `/graphql` endpoint and third-party wrappers; one commenter says outright that there is no public API and that endpoints are found by watching the browser's network tab. That is the undocumented, scraping-style access the terms forbid, not an integration. |
| Search of LeetCode's discuss and support pages for an export or developer API | Only feature requests. For a request to export submissions, LeetCode staff replied that the information "has been passed to our product team for consideration with future updates" (https://leetcode.com/discuss/feedback/4180315/). No export feature and no developer programme was found. |
| Third-party "LeetCode API" services (scraper marketplaces, community wrappers) | Not used. They work by scraping or by calling the internal endpoint, and nothing establishes that they are authorised by LeetCode. |

So UNBLUFF does **not**: scrape profile pages; call `leetcode.com/graphql` or any internal endpoint; use scraping packages or third-party proxies; ask for passwords, `LEETCODE_SESSION`, CSRF tokens or cookies; automate a browser login; or call manual linking or file import "synchronisation". The backend has no HTTP client for LeetCode at all, so this cannot happen by accident (the profile address is built locally and is only ever opened by the student's own browser).

If LeetCode later publishes an official API or OAuth flow, it should be added behind its own provider interface beside `LeetCodeStore`, using its documented authorisation flow, and the five states below would gain a real `officially_connected`. Today that state is hard-wired false in the type (`officially_connected: false`).

I could not verify LeetCode's own rule for usernames. UNBLUFF accepts 2 to 40 letters, digits, underscores or hyphens as a conservative safety rule of its own, so a real username outside that shape cannot be linked.

## 2. What the student can do

1. **Link a profile** (Settings, beside GitHub, and on the LeetCode page): a username or a `leetcode.com` profile address. The server saves the username and builds `https://leetcode.com/u/<username>/`. Nothing is looked up.
2. **Import numbers** they supply: upload a JSON or CSV file in the documented format, or type the numbers into a form. They are validated, shown back, and stored only after the student confirms.
3. **See insights** (`/leetcode`): only what the imported data contains, with its source, capture date and freshness.
4. **Ask the AI mentor** about the imported numbers, and see them as context beside matching DSA topics in the placement plan.
5. **Unlink** (keeping or deleting the imported numbers) or **delete** any single snapshot.

## 3. The five states (always shown, computed by the server)

| State | Meaning here |
| --- | --- |
| Profile linked | A username and profile link are saved. |
| Ownership unverified | Always true. No supported way to prove the student owns the profile exists, so it is never claimed. |
| Imported data available | The student supplied data that passed validation. |
| Officially connected | Never true. There is no official integration. |
| Live sync unavailable | Always true. No compliant live data provider exists. |

There is no green "Connected" status anywhere: a saved username alone shows no statistics.

## 4. Import format (`unbluff.leetcode-import/1`)

JSON, or two-column `key,value` CSV with the same fields. At most **64 KB**. The student may use any numbers they have the right to use, from any source; the app records only how the data arrived (typed, JSON file, CSV file) and an optional note of the student's own.

```json
{
  "schema_version": "unbluff.leetcode-import/1",
  "source_description": "optional note, at most 120 characters",
  "username": "optional; must match the linked username if one is linked",
  "captured_at": "2026-01-15T09:30:00+05:30",
  "totals": { "solved": 60, "easy": 30, "medium": 24, "hard": 6 },
  "available": { "easy": 900, "medium": 1900, "hard": 850 },
  "topics": [{ "topic": "Array", "solved": 28 }],
  "contest": { "rating": 1500, "global_rank": 250000, "attended": 3 },
  "activity": [{ "date": "2026-01-12", "problems_solved": 2 }]
}
```

CSV keys: `schema_version`, `source_description`, `username`, `captured_at`, `solved`, `easy`, `medium`, `hard`, `available_easy|medium|hard`, `contest_rating`, `contest_global_rank`, `contest_attended`, `topic:<Name>`, `activity:<YYYY-MM-DD>`. Comments (`#`), blank lines, a header row, quoting, CRLF and a byte-order mark are accepted.

Only `schema_version`, `captured_at` and `totals.solved` are required. Everything else is optional and, if absent, is shown as unavailable.

**Validation** (every problem is reported in one pass, with its field path):

* Unknown fields are rejected, including any account id, email, password, cookie, token or session field. The owner is always the signed-in student; no file can name one.
* `schema_version` must match exactly.
* `captured_at` needs an explicit time zone (`Z` or `+hh:mm`), must be a real date, not in the future (five minutes of clock skew allowed) and not before 2015. It is stored as UTC. It is the date the numbers were true, and it drives freshness.
* Counts are whole numbers, never negative, at most 10,000.
* The easy/medium/hard split is all three or none, and must add up to `solved`. With `available`, solved cannot exceed what was available per difficulty.
* Topics: 1 to 40 characters from a safe set, no duplicates (case-insensitive), each at most the total. Their counts may add up to more than the total, because topics overlap.
* Contest: rating 0 to 5000, rank at least 1, attended 0 to 5000, not empty.
* Activity: real dates, no duplicates, not after the capture, at most 100 per day, at most 400 days, and the sum cannot exceed the total (it means problems first solved that day).
* Warnings (accepted, but shown): no difficulty split, a zero total, numbers more than 45 days old, a total lower than an earlier snapshot, a snapshot older than the latest one, activity more than a year old.
* Rejected: empty or binary files, invalid JSON, over 64 KB, and the example template as it is (it carries `example_data: true` and a note saying it is fictitious).

The templates (JSON and CSV, downloadable from the page) use clearly fictitious numbers and refuse to import until replaced. Test fixtures in this repository are likewise fictitious and are never data a student sees.

## 5. Data model (Firestore, server-only; the browser never reads it and `firestore.rules` denies clients)

* `unbluff_leetcode_connections`, id = uid: `owner_uid`, `username`, `username_key`, `profile_url`, `linked_at`, `updated_at`.
* `unbluff_leetcode_snapshots`, id = `<uid>__<content hash>`: the normalised numbers, `source` (`manual_entry | json_file | csv_file` plus the student's note), `captured_at`, `imported_at`, `linked_username` at the time, and `owner_uid`.

No token, cookie or credential of any kind is stored, because none is ever collected. Queries filter by `owner_uid` only, so no composite index is needed.

**Idempotence and history.** The snapshot id is a hash of the numbers and capture time (not the file format, order or note), and it is created with an atomic create-if-absent. The same data imported twice, in any format, or from two tabs at once, is stored once and keeps its first import time. Different numbers at an exact capture time that already has a snapshot are refused rather than overwritten. History is up to 120 snapshots; a student can remove a mistaken one, and unlinking offers to keep or delete them.

## 6. API

See `CONTRACT.md` §5 (LeetCode). All routes need a verified student: `GET/PUT/DELETE /api/leetcode/connection`, `POST /api/leetcode/import/preview`, `POST /api/leetcode/import/confirm` (the preview's `content_hash` must match, so the student imports exactly what they reviewed), `GET /api/leetcode/insights`, `GET /api/leetcode/import-history`, `DELETE /api/leetcode/import-history/:id`. Reads are limited to 90 and writes to 30 per minute per student.

## 7. Kept apart from UNBLUFF's judged results

Imported statistics are external, self-supplied context. They:

* never mark a question solved, never create a submission, and never touch analytics, acceptance rates or the revision queue. The LeetCode module has no write access to any of those stores (it is given only a read-only "judged count" function for display), and tests assert that analytics, progress, revision and submissions are identical before and after a large import;
* are shown beside UNBLUFF's judged count, never added to it, with the difference stated;
* appear in the DSA analytics page only as a separate, labelled "External progress (not counted above)" note.

There is no mapping from LeetCode problems to UNBLUFF questions, so nothing can be double-counted.

## 8. Placement planner

When a student imported topic counts, a matching DSA topic in the plan's skill list shows, in its **self-reported** field, "You reported N "Topic" problems on LeetCode (imported, captured DATE); not verified and not counted here". Matching is exact after ignoring case, spacing and a trailing "s" ("Array" matches "Arrays"); a topic not in the data is unknown, not zero. The numbers never change an estimate, status, confidence, coverage or any task, and a single note in the limitations lists says so. Stale data is labelled as out of date. The planner's method text states the rule.

## 9. AI mentor

* Triggered by the student's `leetcode_context` switch (the "Ask the AI mentor" links on the LeetCode page set it) or by a message that mentions LeetCode or imported statistics. Otherwise nothing about LeetCode is sent.
* The model receives a short summary: totals, difficulty split, up to eight topics and the lowest few, contest figures, an activity total, and the change across imported snapshots, with the capture and import dates, how old the data is, and an explicit "not live, not synchronised, not verified". It receives **no username, no profile link, no student-written note and no credential**. Topic names are validated text and the block's closing tag is defanged.
* The prompt rules tell it to say "as you reported" (never "your LeetCode shows"), to quote numbers exactly, to treat an unlisted topic as unknown, to flag stale data, to never claim aggregate counts prove problem-solving ability, never add them to judged practice, and, when nothing was imported, to say so, give no number, and suggest linking and importing.
* The answer carries `leetcode_context: { used, captured_at, stale }`, and the mentor page tells the student what was or was not used.

## 10. Tests and verification

* Backend unit: `leetcodeProfile`, `leetcodeImport` (schema, CSV, templates, every rejection above), `leetcodeService` (state semantics, preview/confirm, idempotence, conflict, limit, history and timestamps, isolation, unlink and delete, mentor context text).
* Backend integration (`tests/integration/leetcode.test.ts`): authentication on every route, ownership against spoofed ids, headers and query, validation, separation from analytics/progress/submissions, the planner note and its non-effect, and the mentor prompt (gating, no-data, other students, injection, stale, unconfigured).
* Emulator (`tests/emulator/leetcode.emulator.test.ts`): create-if-absent, owner separation, unsafe ids, deletion and the service end to end on the Firestore emulator.
* Frontend (`tests/leetcode.test.tsx`): profile checking, the five states, link and unlink choices, loading, empty, error and retry states, upload and manual import, preview, rejection, already-imported, conflict, insights with unavailable parts, separation panel, mentor context, the DSA analytics note, and navigation.
* Browser check against the Firestore and Auth emulators with a mock mentor: linked a profile in Settings, imported two snapshots by form, saw the identical import reported as already imported and a disagreeing split rejected, viewed insights and the analytics note. No horizontal overflow at 1440, 390 and 320; axe (WCAG 2.0/2.1 A/AA) reported no violations on Settings, the LeetCode page at 1440 and at 390; no console errors.

## 11. Limits

* Nothing is live and nothing is verified. A student can type any numbers; the app labels them as the student's own and never treats them as evidence of ability.
* Ownership of the profile is never established. A linked username is a label.
* No official integration exists, so there was nothing to test against LeetCode. No LeetCode API was called at any point.
* The username rule is ours, not LeetCode's.
* A CSV/JSON import cannot carry the list of individual problems, so there is no problem-level matching.
* Tested on the Firestore emulator, not a live Firebase project. The mentor was exercised with the built-in mock model, not Gemini.


## 7. Optional username lookup (`LEETCODE_PUBLIC_LOOKUP=true`)

**Off by default.** Section 1 still holds for a default deployment: there is no official API, so UNBLUFF never contacts LeetCode.

An operator who accepts the risk can turn on a lookup. LeetCode's terms forbid automated access of this kind, and the endpoint is the unofficial `https://leetcode.com/graphql` one LeetCode's own site uses, so it can change or block without notice.

- **Linking validates the name.** With the lookup on, a username must match a public LeetCode profile before it is saved. An unknown name is refused (`400`). If LeetCode is unreachable the link is saved unchecked.
- **`POST /api/leetcode/lookup`** fetches the linked username's solved counts (easy, medium, hard) and the number of problems available, and stores them as a snapshot with source `public_lookup`, shown as "Looked up from your public LeetCode profile, not verified as yours". The total is recomputed from the three difficulties; implausible numbers are rejected. `GET /api/leetcode/lookup` returns `{ available }`.
- **Limits.** One outgoing lookup per student per 10 minutes (a repeat inside that window returns the stored snapshot without contacting LeetCode); identical numbers are never stored twice; only the username is sent (no cookies, no credentials, no redirects); an outage returns `502 LEETCODE_UNAVAILABLE`.
- **Still true:** ownership is never verified, the connection is never "official", and nothing is kept in sync. Topics, contest data and activity are not fetched, so those panels stay empty unless the student imports them.
