# Sources and assumptions behind numbers.json

All amounts are in Indian rupees. A figure is **published** if it comes from a vendor page I read on 22 October 2026, and an **ESTIMATE** if it is my reasoning with no quote behind it. Replace every ESTIMATE with a real quote before relying on the result.

| Input | Value | Basis |
| --- | --- | --- |
| USD to INR | 95.9 | RBI reference rate of 24 Sep 2026 (95.9099) as listed by [NSE](https://www.nseindia.com/report-detail/rbi-reference-rate-statistics); a month old, so currency moves are not modelled |
| Gemini 3.1 Flash-Lite | USD 0.25 per 1M input, 1.50 per 1M output tokens | [Google's pricing page](https://ai.google.dev/gemini-api/docs/pricing) (the model the production blueprint uses by default) |
| Gemini 3.6 Flash (fallback / the model used in development) | USD 0.75 input, 3.75 output per 1M tokens until 31 Dec 2026, then 1.50 and 7.50 | same page. **If the mentor ran on this model after 1 Jan 2027, the same 150 messages would cost about INR 108 a student-month, more than the INR 99 test price.** Which model the mentor uses decides whether the business works |
| Mentor usage | 150 messages x (3,000 input, 400 output tokens) per paying student-month | ESTIMATE of a heavy user; the real average is unknown until students use it |
| Audit, grading, plan assistant | ~30 calls of ~2.5k in / 300 out | ESTIMATE |
| Payment fee | 2% + 18% GST on the fee (2.36%), UPI and cards | [Razorpay](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/) |
| Hosting | Render web service USD 25 a month (1 CPU, 2 GB); USD 7 for under 1 CPU / 512 MB | [Render pricing](https://render.com/pricing) |
| Database and sign-in | Firebase no-cost plan includes 1 GiB stored, 50K reads and 20K writes a day | [Firebase pricing](https://firebase.google.com/pricing); beyond that, pay-as-you-go. A small allowance is included as an ESTIMATE |
| Code execution | INR 3,000 a month | ESTIMATE for a small self-hosted Judge0 server; not quoted |
| Registration, legal, marketing | INR 45,000 one-off | ESTIMATE |
| Ramp (paying students a month) | 0, 5, 10, 20, 30, 45, 60, 80, 100, 120, 140, 160 | **Assumption.** The simulated panel produced a 0% buy rate at INR 299, so this ramp is a hope, not a forecast, and it is the line that decides the plan |
