# Pricing: UNBLUFF Pro

*Simulated-buyer price answers pick what to test; they are not proof. The tool's tables print "$" for the buyers' answers, but every figure here is rupees a month.*

## The price
**INR 99 a month**, with a **INR 499 one-time six-month "placement season" pass**, both to be tested with real payments before they are final.

Why:
- **Where it sits in the evidence.** The panel's acceptable range is **INR 49 to 199 a month** (too cheap below 49, too expensive above 199), the least-resistance point is about **INR 50**, and the point where "bargain" and "getting expensive" are equally common is about **INR 100**. The tested INR 299 is above the range, and all 20 buyers refused it ([panel results](panel-v1/results.md)). The median answers were: too cheap 29, bargain 79, getting expensive 150, too expensive 249.
- **Against competitors** ([competitors.md](competitors.md)). The Indian placement platforms sell **one-off** access (PrepInsta INR 1,999 as quoted in its own post, about INR 167 a month over a year; GeeksforGeeks Placement 360 at USD 139.98 for two years), while USD-priced tools run USD 13.25 to 35 a month for LeetCode and USD 29.98 to 49.95 for Jobscan. A student comparing INR 99 a month, or INR 499 once for six months, sees UNBLUFF as the cheap option, not a luxury. Buyers also said directly that a **one-time option** would help because the money comes from parents.
- **The margin it gives** (CFO tool, [cfo.md](cfo.md), costs in rupees):

| price a month | contribution per student | margin at 200 paying students | break-even (paying students) | year 1 operating result |
| ---: | ---: | ---: | ---: | ---: |
| INR 99 | 73 (74%) | 46% | 77 | -10,397 |
| INR 149 | 123 (83%) | 64% | 46 | +28,103 |
| INR 199 | 173 (87%) | 73% | 33 | +66,603 |
| INR 299 (tested, refused) | not computed | n/a | n/a | n/a |

At INR 99 the business loses money in year 1 on the assumed ramp; at INR 149 it makes a small profit; INR 199 is the top of what the panel accepts. **The price that makes the numbers work (INR 149 or more) is outside the comfortable end of the panel's range**, which is itself a finding: this is a thin-margin product for this buyer unless the cost to serve falls or an institution (a college) pays.

**The model risk is bigger than the price.** If the mentor runs on a larger model than the one the production blueprint selects (Gemini 3.6 Flash after its 1 Jan 2027 price rise), 150 messages cost about INR 108, and at INR 99 every student loses money (contribution -16%). Choose the mentor's model deliberately and put a per-student monthly cap on mentor messages.

## The ladder
1. **Free**: resume ATS score, the claim audit, the study plan, DSA patterns and DBMS lessons with quizzes. The panel repeatedly said "show me real results on my own resume before I pay", so the first win must be free.
2. **Pro, INR 99 a month**: the AI mentor, unlimited plan refreshes, résumé tools, higher limits. A reason to step up: the mentor and the plan refreshes are the features that cost money to run.
3. **Season pass, INR 499 once** (six months, no auto-renew): the same, aimed at the placement season, and the answer to "my parents pay once, not monthly".
4. **College licence**: price unknown (open question). Colleges' placement cells could be the buyer; no data yet.

## The opening offer
Pro free for **7 days with no card**, then INR 99 a month; the season pass is INR 499 until the first batch placements close (a real end date set at launch). No fake "was INR 999" anchor.

## What to test with real buyers
- Two landing pages with a real pre-order or UPI payment link: **INR 99 a month** against **INR 149 a month**, and a third showing the INR 499 pass. Success line to set before running: for example 30 paid sign-ups from 1,000 visitors in two weeks.
- A campus cohort: one college, one branch, 50 students on a free trial, then an offer. Measure conversion and the cost of AI use per student.

## The panel's price objections, verbatim (for marketing)
- "Pro is INR 299 every month and that is a subscription, and my parents pay for everything I spend on." (P003)
- "I don't have money for a monthly subscription. My parents pay for everything, and asking them for INR 299 every month for a website I haven't proven is a hard conversation to start." (P011)
- "I already use LeetCode and my YouTuber's free playlists, so this feels like one more platform I would sign up for and forget." (P005)
