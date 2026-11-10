# Operations

## Daily cycle (one founder)
Morning: check error logs, cost dashboard (Gemini, Render) and refund/support inbox. Midday: reply to students (target under 24 hours). Evening: review the day's signups, free-to-paid, and one improvement shipped.

## Suppliers (single points of failure, with a plan B)
| Need | Supplier | If it fails |
| --- | --- | --- |
| Hosting API | Render | Move the container to Fly.io or Cloud Run (Docker already in repo) |
| Auth, database, web | Firebase | None cheap; export data weekly |
| AI | Gemini API | Swap model via the LLM adapter; cap messages per student |
| Payments | Razorpay | Cashfree as a second gateway |
| Code execution | A Judge0 server (not yet verified) | Keep the judge feature off until proven |
Prices come from cfo-sources.md; the Judge0 and domain costs are estimates.

## People
Founder only. First hire is not before 200 paying students. Part-time support from one student ambassador per college, paid in free months.

## Standard procedures
Refund: reply in 24 hours, refund in full within 7 days of Pro, log reason. Data deletion: the in-app delete button; confirm to the student by email. Incident: if student data may have leaked, stop signups, rotate credentials, tell students, and take advice on DPDP duties. Mentor cost spike: lower the message cap first, then change model.

## Licences and legal (confirm with professionals; none of this is advice)
Company registration (Private Limited or LLP) before taking money; GST registration depending on turnover and the subscription; a privacy policy and terms; compliance with the Digital Personal Data Protection Act 2023 (consent, deletion, breach notice); licence for any company-specific interview data (the product refuses to boot in production with an unlicensed catalogue); Razorpay KYC.

## Risk register
1. Mentor model cost rises (cap messages). 2. Judge0 not working (keep off, say so). 3. Resume data leak (isolation tested; keep rules closed). 4. Credentials already leaked in chat (rotate now). 5. Zero paid conversion (free-first launch). 6. GfG or LeetCode add the same feature. 7. Gemini outage or policy change. 8. Refund abuse. 9. Founder burnout (single person). 10. Trademark conflict on the name.
