# Learn: DSA patterns and DBMS

Replaces the GraphQL Lab. Lessons are public; progress and quizzes need sign-in.

## Content
- `backend/src/learn/content/patterns{1,2,3}.ts`: 27 patterns in families (two pointers, sliding window, prefix sums, binary search, stacks, heaps, linked lists, trees, graphs, DP, backtracking). Each has cues, idea, Python template, a hidden check, complexity, pitfalls, variants and at least 4 problems.
- `backend/src/learn/content/dbms{1,2}.ts`: 12 DBMS topics with notes, a SQL example (or none), 3 interview questions and a 4-question quiz.
- Verified by `backend/tests/unit/learnContent.test.ts`: templates are executed with `python3 -I`, SQL on SQLite.

## API (see CONTRACT.md)
Public: `GET /api/learn/patterns`, `/learn/patterns/:id`, `/learn/dbms`, `/learn/dbms/:id`.
Signed in: `GET /api/learn/progress`, `PUT /api/learn/patterns/:id/progress`, `POST /api/learn/dbms/:id/quiz`.
Progress is stored in the `unbluff_learn_progress` Firestore collection (deny-all to clients, like the other server-owned data).

## Screens
`/learn/patterns`, `/learn/patterns/:id`, `/learn/dbms`, `/learn/dbms/:id` under the sidebar's Learn group.

## Honesty rules
Quiz results are server-graded and feed the placement plan's DBMS area. Pattern and problem marks are self-reported and never counted as verified.
