# Unit economics: UNBLUFF Pro (a monthly subscription for engineering students). Unit = one paying student-month; the tool's 'per day' columns therefore read as 'per month' (days_per_month is 1).

Every number below comes from the input file. Nothing is looked up or guessed.

## One student-month

| line | per student-month |
| --- | ---: |
| Price | $99.00 |
| AI mentor: 150 messages x (3,000 in + 400 out tokens) on Gemini 3.1 Flash-Lite at USD 0.25/1.50 per 1M tokens (estimate of usage) | -$19.40 |
| AI interview audit, grading and plan assistant: ~30 calls (estimate of usage) | -$3.30 |
| Payment gateway: 2% + 18% GST on the fee = 2.36% of INR 99 (Razorpay published rate) | -$2.34 |
| Firestore reads and writes beyond the free tier (estimate) | -$1.00 |
| **Contribution** (what each student-month leaves to pay the fixed costs) | **$72.96** (74%) |

## The margin that matters

Fixed costs: $5,548 a month (Render web service, 1 CPU / 2 GB at USD 25 a month (published), at INR 95.9 per USD $2,398, Code-execution (Judge0) server needed for the verified-judging feature (ESTIMATE, no quote) $3,000, Domain and email (ESTIMATE) $150, Founder pay (none assumed: the founder works unpaid; this is not sustainable) $0).

- **Break-even: 77 student-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (200 a day): **46%** of every sale, after every cost.

## Year 1, month by month

| month | student-months a day | revenue | profit | cumulative (after $45,000 startup) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | $0 | -$5,548 | -$50,548 |
| 2 | 5 | $495 | -$5,183 | -$55,731 |
| 3 | 10 | $990 | -$4,818 | -$60,550 |
| 4 | 20 | $1,980 | -$4,089 | -$64,638 |
| 5 | 30 | $2,970 | -$3,359 | -$67,998 |
| 6 | 45 | $4,455 | -$2,265 | -$70,262 |
| 7 | 60 | $5,940 | -$1,170 | -$71,433 |
| 8 | 80 | $7,920 | $289 | -$71,144 |
| 9 | 100 | $9,900 | $1,748 | -$69,396 |
| 10 | 120 | $11,880 | $3,207 | -$66,189 |
| 11 | 140 | $13,860 | $4,666 | -$61,522 |
| 12 | 160 | $15,840 | $6,126 | -$55,397 |

- **Year 1 operating profit: -$10,397** on $76,230 of revenue.
- After the $45,000 startup spend: -$55,397.
- Startup money earned back: not within year 1.
- Cash you need before it pays for itself: **$71,433**.

## What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 46% | 77 | -$10,397 |
| Price -10% | 40% | 88 | -$18,020 |
| Volume -20% | 39% | 77 | -$21,633 |
| Unit costs +15% | 42% | 81 | -$13,404 |

## Red flags

- Year 1 loses money on operations (-$10,397).
- The startup spend is not earned back within year 1.

---
## Notes added by the CFO step (read these with the tables above)
*All amounts in this file are rupees; the tool prints a "$" sign for them. "Per day" means "per month" because the unit is one paying student-month.*

- **The margin:** at INR 99 each student-month leaves **INR 73 (74%)** after its own costs; break-even is **77 paying students**; at the assumed 200 paying students the margin after every cost is 46%.
- **The line to watch:** the mentor's model. On the cheap model the production blueprint selects, AI use is about INR 23 a student-month. If the mentor runs on a larger model after 1 January 2027 (150 messages), it is about INR 108, and **at INR 99 every student loses money (contribution -16%)**. Cap mentor messages per student and choose the model on purpose.
- **Cash:** the founder needs about **INR 71,433** before it pays for itself on the assumed ramp, mostly the INR 45,000 startup spend plus months of fixed cost before enough students pay.
- **Three ways to improve the margin (each from a run of the tool):** raise the price to INR 149 (break-even falls to 46 paying students, year 1 turns to +INR 28,103) or INR 199 (break-even 33, +INR 66,603; the top of what the panel accepts); delay the INR 3,000 a month code-execution server until the paid plan has 30 or more payers (a decision, not a tool result); sell a college licence so one buyer carries many students (price unknown, a test, not a number).
- **The ramp is the weakest input:** the panel's buy rate was 0%, so the 160 paying students by month 12 is a hope. Replace it with a real conversion measured on a free cohort.
- **The board's money conditions:** "measure the cost to serve one paying student" is now an estimate (INR 26 at INR 99), not a measurement; it is met only when real usage replaces the assumed 150 messages.
- An accountant should check the structure, payroll and tax (including GST on the subscription) before money moves. Not financial, tax or legal advice.
