# UNBLUFF (working name) · Business plan

**Verdict: Not yet**

- ✓ Each student-month earns $72.96 before fixed costs (74% contribution).
- ✗ Year 1 operating LOSS: $10,397.
- ✗ 0 of 20 simulated buyers buy (0%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $99.00 a student-month |
| Profit margin at plan | 46% per student-month |
| Break-even | 77 student-months a day |
| Year 1 operating profit | $-10,397 |
| Startup spend | $45,000 |
| Cash needed before it pays for itself | $71,433 |
| Startup money earned back | not in year 1 |
| Buyer panel | 0 buy · 20 pass |

## The idea

- What it is: a web app that prepares engineering students for campus placements using only evidence. It interrogates the claims on a student's resume, judges their code against hidden tests, teaches DSA patterns and DBMS with graded quizzes, builds an ATS-scored LaTeX resume, and gives an AI mentor that remembers what the student chooses to tell it. Its study plan is built only from verified records, and it labels anything self-reported as such.
- Who it is for: engineering students in India in their pre-final and final year who are preparing for campus placements and off-campus applications (the app uses Indian rupees, India-focused job listings and the campus placement calendar). [ASSUMPTION: the founder has not stated a target market in writing; this is inferred from the product.]
- What it sells, at what price: free today, with no payment system. The business model is undecided. [ASSUMPTION for testing: a paid "Pro" plan for the AI mentor, résumé tools and unlimited plan refreshes; the consumer panel is asked four price questions so a price range comes from the evidence instead of a guess. The test price shown to the panel is INR 299 a month.]
- Where and how: online, mobile and desktop web. Students find it through college groups, YouTube/Instagram placement-prep content and word of mouth (not yet started). Sign-in is Firebase email and password; data is stored in Firestore.
- Budget and constraints: built by one student developer on free tiers (hosting that sleeps when idle, free-tier Gemini quota). No funding, no team, no legal entity or payment processor stated. Running code for students is not live yet (no Judge0), the company-wise question list cannot be served commercially (no licence), and the résumé PDF compiler is development-only. [ASSUMPTION: none of this is stated by the founder in a budget; it is read from the repository and deployment files.]

## Summary

- **Board:** 2 fund-if, 1 pass, average 4.0 of 10. Not yet: no proof, no verified judge, too many features.
- **Competitors:** crowded and cheap; LeetCode Premium USD 35 a month, GfG USD 139.98, PrepInsta INR 1,999. The gap is a trusted, evidence-based plan.
- **Panel (simulated, 20 students):** 0 would pay at INR 299 a month; 0 would pay at INR 99 or INR 499 with a trial and refund. Reasons: price/parents, trust, free alternatives.
- **Pricing:** INR 99 a month and INR 499 for six months is inside the accepted range (INR 29 to 198).
- **Offer:** free first result, data promise, season pass, refund. It did not move the panel.
- **CFO:** INR 73 left per student-month at INR 99; break-even 77 paying students; year one loses about INR 10,400; the mentor model is the biggest cost risk.
- **Marketing, brand, ops, launch:** free-first, campus cohort, no ad spend until the free-to-paid rate is known.
- **Biggest honest limit:** the panel is simulated, n=20; several inputs are estimates.

## What the board said

**Vote: 2 fund if, 1 pass. Average score 4.0 / 10** (Offers 4, Monopoly 3 pass, Product 5).
The board is not saying "no". It is saying "not yet, and here is what has to be true". Read these as conditions, not criticism: the product is better built than it is proven.

### Risks raised by more than one member (read these first)
1. **The differentiator does not run yet.** All three members named it: the "verified evidence" promise depends on hidden-test code judging, and no execution service is deployed (Judge0). The company question list cannot be served (no licence) and the résumé PDF compiler is development-only. Until judging is live, the plan has little verified input.
2. **No proof, no first user.** Nothing shows a student who improved, no real student has had a first session, and nothing is in production. (Offers, Product, Monopoly.)
3. **No distribution and no way to charge.** No channel started, no payment processor or legal entity, the model and the INR 299 test price are assumptions, and each paid user has a per-message AI cost. (Offers, Monopoly.)
4. **Too many features for one sentence.** The Product lens says the pitch does not fit in one sentence and recommends one core loop; the Monopoly lens says each feature alone is an incremental copy of something that exists. (Product, Monopoly.)

### Where they disagree
- **Monopoly (3, pass)** sees no ten-times-better edge and no answer to "what stops a copycat in month six": the AI sits on a rented model anyone can use. The only candidate secret is the strict "unverified does not count" rule, plus a verified record that could become a switching cost.
- **Product (5)** and **Offers (4)** see enough craft and a clear identity to fund conditionally, because the rule that refuses to flatter the student is rare and believable.

### Conditions, merged (the rest of the pack tests the ones marked)
- [ ] Pick the one thing, probably the audit-to-verified-plan loop, and demote the other features from the main path before launch. (marketing, brand)
- [ ] Get hidden-test code judging live (a verified Judge0), or ship without it and say so plainly. (ops, launch)
- [ ] Remove the unlicensed company-wise question list from anything user-facing. (already enforced in production)
- [ ] Define the empty-state first session so minute one to five delivers value before any evidence exists. (offer, marketing)
- [ ] Deploy to production and watch a handful of real students through a first session. (launch)
- [ ] Run a small named cohort and measure a real before/after. (launch)
- [ ] Package one named offer with a guarantee and test prices with real payments, not only the panel. (pricing, offer)
- [ ] Measure the cost to serve one paying student, including the AI cost per message. (cfo)
- [ ] Name the first small market (one college, one branch, one placement cohort) and how the first 100 students arrive and what each costs. (competitors, marketing)
- [ ] Resolve the legal entity and a payment processor. (ops)

### The strongest version of this business the board can see
A narrow product for final-year students in one named college cohort: **"the placement plan that only counts what you proved."** The student's résumé claims are interrogated, their DSA and DBMS knowledge is checked by graded work, and a study plan is built only from that evidence, with an AI mentor that never flatters. That is smaller than what was pitched (an everything-platform) and it differs from it: the pitch lists a dozen features; the version the board would back is one loop, with a verified record the student keeps, sold first to colleges' placement cells or to student groups at a price the evidence supports. The other features become supporting material, not the headline.

### Open questions the rest of the pack answers
Who else sells this and for how much (`/founder-competitors`). Whether students would pay and what they say stops them (`/founder-consumer`). What price range the evidence supports (`/founder-pricing`). What one paying student costs to serve (`/founder-cfo`).

## The competition

Public sources only; every price links to the page it came from. Prices are in the currency the page showed. I did not convert currencies because no sourced exchange rate was used. Retrieved 22 October 2026. Vendor pages show prices for the viewer's location, so the figures a student in India sees may differ.

### Who is there

| Competitor | Type | Price of the comparable item | What it sells | Own headline |
| --- | --- | --- | --- | --- |
| [LeetCode Premium](https://leetcode.com/subscribe/) | direct | USD 35/mo (listed 39), or USD 159 billed yearly (shown as 13.25/mo) | Company-specific questions, mock interview simulations, an AI coding agent, priority judging | "Level up your coding skills and quickly land a job." |
| [PrepInsta Prime](https://prepinsta.com/prime/purchase) | direct | INR 1,999, quoted in [their own Instagram post](https://www.instagram.com/reel/DOivlqoD70T/?hl=en) as 50% off | 200+ placement courses, company-specific previous-year questions, projects, certification | "Unlock 200+ Courses" |
| [GeeksforGeeks Placement 360](https://www.geeksforgeeks.org/courses/placement-360-cip-complete-tech-interview) | direct | USD 139.98 shown (was 199.98, 30% off), 2 years access; INR not shown | DSA, OOP, LLD, SQL/DBMS/OS/CN, aptitude, **resume building**, company-tagged problems, 24x7 AI and live doubt support | "a complete self-paced program" |
| [Jobscan](https://app.jobscan.co/plan) | indirect (résumé/ATS) | USD 0 for 5 scans a month; USD 49.95/mo; USD 29.98/mo billed quarterly | ATS scan against a job listing | "Boost your interview chances." |
| [Interview Sidekick](https://www.eklavvya.com/blog/ai-interview-tools-students-colleges/) | indirect (AI interview) | USD 19/mo basic, USD 39/mo pro (third-party roundup) | AI interview practice | (roundup wording) |
| [InterviewBuddy](https://www.eklavvya.com/blog/ai-interview-tools-students-colleges/) | indirect (live mock) | INR 499 per 30-minute session (third-party roundup) | Live peer mock interviews | (roundup wording) |
| [Hello Interview](https://www.hellointerview.com/pricing) | indirect | USD 47 for 1 month, USD 89 for 1 year | Interview prep content and mock interviews | (pricing page) |
| Free substitutes | substitute | 0 | LeetCode's free tier, free articles, YouTube, general AI assistants | not researched |

### Price range for the closest items
Courses and subscriptions that cover placement prep as a whole: INR 1,999 (PrepInsta, one-off promotion) to USD 13.25 to 35 a month (LeetCode) and USD 139.98 for two years (GeeksforGeeks). Narrow tools: Jobscan USD 29.98 to 49.95 a month; live mock sessions INR 499 each. The Indian price points that are actually visible sit around **INR 500 to 2,000**, and the notable fact is that two of the three direct competitors are **one-off or long-access purchases, not monthly subscriptions**. A monthly INR 299 plan (the test price) would cost INR 3,588 over a year.

### What their customers complain about (thin: every theme has fewer than three reviews read)
Only search excerpts from public threads were read, not full review sets, so treat these as leads, not findings.
- **No clear path (1 review):** "Too much content, no clear path." ([r/PlacementsPrep](https://www.reddit.com/r/PlacementsPrep/comments/1lef7n5/is_prepinsta_prime_worth_it_if_ive_only_got_a_few/))
- **Price and refunds (1 review):** "the course is really expensive. The refund policy is almost a scam" ([r/PlacementsPrep](https://www.reddit.com/r/PlacementsPrep/comments/x7lf76/coding_ninjas_vs_prepinsta_prime_which_is_better/))
- **What students like (2 reviews):** company-specific preparation and structured aptitude sections ([r/coursereviewsIndia](https://www.reddit.com/r/coursereviewsIndia/comments/1l0rp5k/im_looking_for_a_genuine_prepinsta_prime_review/)).

### Positioning map (text)
Axes: *breadth of content* (narrow to everything) against *evidence of progress* (none to verified).
- GeeksforGeeks Placement 360 and PrepInsta Prime: very broad content; progress is course completion and certification, not verified skill.
- LeetCode Premium: deep on coding practice with a real judge; no plan, résumé or interview audit.
- Jobscan: narrow (résumé only).
- UNBLUFF today: broad (audit, practice, patterns, DBMS, mentor, résumé) and the only one that **refuses to count self-reported progress**. But its judge is not live, so today its evidence is thinner than LeetCode's.

### The gap
**A plan a student can trust because it is built only from what they proved.** The one complaint found ("too much content, no clear path") is exactly what an evidence-driven plan addresses, and none of the sourced competitors advertises a plan that ignores unverified progress. This is a lead from one review plus the absence of the claim on the competitors' pages I read, not a proven market gap. If the hidden-test judge never goes live, the gap closes.

### The threat
- **GeeksforGeeks Placement 360** already bundles DSA, DBMS/SQL, résumé building, company-tagged problems and AI doubt support with a brand and distribution UNBLUFF lacks. It could add "verified progress" quickly.
- **LeetCode** already runs a real judge and now sells an AI coding agent.
- A copycat needs only a rented Gemini key; the defensible part is the verified record students accumulate, which needs users first.

### Not researched (open)
Coding Ninjas, Scaler, AlgoUniversity, Naukri Code360, any college placement-cell software, and full review sets. Indian-rupee prices for the USD-priced vendors.

## The buyer panel

**0 buy · 20 pass** (0% buy) out of 20 simulated buyers. Seed 7, so the same cards can be dealt again.

These are simulated buyers, not customers. Use this to find objections and weak spots, then confirm the big ones with real people before you spend.

### By segment

| group | buyers | buy rate |
| --- | ---: | ---: |
| Student at a lower-tier or regional college | 9 | 0% |
| Student at a mid-tier college | 8 | 0% |
| Student at a top-tier college (IIT, NIT or a leading private college) | 3 | 0%  (thin) |

### By buying behaviour

| group | buyers | buy rate |
| --- | ---: | ---: |
| Follows one YouTuber's roadmap | 4 | 0%  (thin) |
| Relies on the college placement cell | 2 | 0%  (thin) |
| Buys a course when friends do | 2 | 0%  (thin) |
| Starts panicking two months before placements | 4 | 0%  (thin) |
| Targets service-company tests only | 2 | 0%  (thin) |
| Collects free resources and pays for nothing | 3 | 0%  (thin) |
| Grinds LeetCode every day | 3 | 0%  (thin) |

### By income

| group | buyers | buy rate |
| --- | ---: | ---: |
| under INR 482,000 | 6 | 0%  (thin) |
| INR 482,000 to 779,000 | 7 | 0%  (thin) |
| INR 779,000 and up | 7 | 0%  (thin) |

### Why they pass

| reason | buyers | in their words |
| --- | ---: | --- |
| price | 7 | "I do not have money for a monthly subscription; my parents pay for everything. Even the 499 one-time pass is a big ask from my family's money when I am not sure the AI mentor is better than just asking seniors or using free stuff." (P003) · "I pay for nothing right now and my family's money for this kind of thing is tight. Everything the Pro part promises, like mentor hints and resume tools, I can get free on YouTube, GeeksforGeeks and my free chatbot." (P008) |
| trust | 6 | "I do not know this website and I would have to hand it my resume and my data. Even if the free check is useful, I do not pay for things I have not seen work, and my family's money is not for trying out a new site." (P001) · "The college placement cell is free and it is already running the training and tests I am waiting for. The page never says this gets me a job, and the one thing that would prove progress, checking my code against hidden tests, is not out yet." (P002) |
| habit | 5 | "I already ask a free AI chatbot when I'm stuck, and my placement cell already runs training, so I don't see what I'd be paying for yet. I'd use the free resume check and plan first and see if it helps." (P004) · "I already use LeetCode and the free playlists from my YouTuber, and I rarely pay for prep stuff. The free resume score sounds useful, but I don't see why I'd pay for something I can get from what I already use." (P005) |
| need | 1 | "I can get the same kind of resume tips and placement practice free on YouTube and GeeksforGeeks, and I'm short on money and time. I would use the free resume check, but I would not pay for something I have not seen actually get me a job." (P006) |
| quality | 1 | "I already get hints for free from my chatbot and I can get practice problems on YouTube and GeeksforGeeks. The thing I actually care about, a judge that checks my code against hidden tests, is listed as coming later, so I would be paying for the parts I can already get for nothing." (P017) |

### Why they buy

| reason | buyers | in their words |
| --- | ---: | --- |

### What would flip a no

- A friend from my college who got a real placement using it, or a clear free result I can see before I give any card or pay anything.
- Seeing that students like me got placed after using it, or the hidden-test checking going live before my placement season starts.
- If my whole batch is paying for it and seniors say it got them interviews, I would ask my parents for the one-time pass.
- If the free plan showed me a real gap in my resume that my placement cell missed, and the Pro resume tools clearly fixed it during the 7-day trial.
- Proof that the paid features give me something my free resources don't, like hidden-test checks that prove my code works, which the site says is not available yet.
- If the free resume check and first plan clearly showed me gaps that YouTube did not, and the 7-day trial showed real improvement in my applications before I had to pay.
- If it gave me TCS/Infosys-style aptitude practice that I cannot get free elsewhere and it loaded fine on my bad Wi-Fi.
- A checked result I could not get anywhere else, such as my code proven against hidden tests on a real placement-style problem.
- A creator I already follow using it and telling me it worked for them, so I trust the people behind it before I give them my resume.
- If the resume questioning showed me a real weak claim on my own resume that I could not have caught myself, I would pay for the 499 six-month pass.
- If the hidden-test judge were live and I could see it grade my code against real problems, I would ask my parents for the INR 499 six-month pass.
- If the free ATS score and resume check showed a specific gap I could fix this week, and the AI mentor's hints actually got me unstuck on a problem during the free trial.

20 buyers gave all four price answers. Run founder-pricing's van_westendorp.py on the answers folder.

## Pricing

*Simulated-buyer price answers pick what to test; they are not proof. The tool's tables print "$" for the buyers' answers, but every figure here is rupees a month.*

### The price
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

### The ladder
1. **Free**: resume ATS score, the claim audit, the study plan, DSA patterns and DBMS lessons with quizzes. The panel repeatedly said "show me real results on my own resume before I pay", so the first win must be free.
2. **Pro, INR 99 a month**: the AI mentor, unlimited plan refreshes, résumé tools, higher limits. A reason to step up: the mentor and the plan refreshes are the features that cost money to run.
3. **Season pass, INR 499 once** (six months, no auto-renew): the same, aimed at the placement season, and the answer to "my parents pay once, not monthly".
4. **College licence**: price unknown (open question). Colleges' placement cells could be the buyer; no data yet.

### The opening offer
Pro free for **7 days with no card**, then INR 99 a month; the season pass is INR 499 until the first batch placements close (a real end date set at launch). No fake "was INR 999" anchor.

### What to test with real buyers
- Two landing pages with a real pre-order or UPI payment link: **INR 99 a month** against **INR 149 a month**, and a third showing the INR 499 pass. Success line to set before running: for example 30 paid sign-ups from 1,000 visitors in two weeks.
- A campus cohort: one college, one branch, 50 students on a free trial, then an offer. Measure conversion and the cost of AI use per student.

### The panel's price objections, verbatim (for marketing)
- "Pro is INR 299 every month and that is a subscription, and my parents pay for everything I spend on." (P003)
- "I don't have money for a monthly subscription. My parents pay for everything, and asking them for INR 299 every month for a website I haven't proven is a hard conversation to start." (P011)
- "I already use LeetCode and my YouTuber's free playlists, so this feels like one more platform I would sign up for and forget." (P005)

## The offer

*Method: the Offers lens in `board/lenses.md`, a summary of a published framework, not anyone's words.*

### 1. The problems between a student and a placement (from the panel and the competitors)
Before buying: "I do not trust a new site with my resume and my data" (6 of 20); "I can get this free on YouTube, GeeksforGeeks and a free chatbot" (9); "my parents pay for everything and a monthly fee is a hard ask" (7); "will this actually get me a job?" (most); "I already use LeetCode"; "my placement cell already trains us"; "the feature that would justify paying, code checked against hidden tests, is not available yet" (about a third of v2 answers).
During: no clear path ("too much content, no clear path", [one public review](https://www.reddit.com/r/PlacementsPrep/comments/1lef7n5/is_prepinsta_prime_worth_it_if_ive_only_got_a_few/)); weak hostel Wi-Fi; a plan that is empty on day one because nothing is verified yet.
After: did it help; what happens to my resume; can I leave.

### 2. Solutions, scored (value to the student 1 to 5 / cost to deliver 1 to 5)
| Solution | Answers | Value | Cost |
| --- | --- | ---: | ---: |
| Free first result in ten minutes: ATS score, the weak claims on the resume, and a first study plan | "show me real results before I pay" | 5 | 1 (a few model calls) |
| "Your data stays yours": one-button delete of everything, nothing sold or shared, a plain-language page | trust | 5 | 1 (the delete controls already exist) |
| Season pass INR 499 once, plus INR 99 a month | price, parents | 4 | 2 |
| 7-day Pro trial, no card, full refund in 7 days | risk | 4 | 2 (needs billing built) |
| Hints, not answers; the full solution only after two hints | habit ("a free chatbot just gives the answer") | 3 | 1 (exists) |
| "Nothing counts unless it was checked" as the product's promise | trust, "bluff" | 4 | 1 (exists) |
| Code run against hidden tests | quality, need | 5 | 4 (a Judge0 server to run and verify) |
| Cohort mode for a college placement cell | "my college already trains us", "the cell could pay" | 4 | 5 (not built) |

Keep high value and low cost first; the two expensive ones (hidden-test judging and the college mode) are the board's conditions and the most requested.

### 3. The stack
- **The core:** *the placement plan that only counts what you proved.* Described by the outcome, not the features.
- **Bonus 1 (kills "no first result"):** the free ten-minute check: resume ATS score, the claims on your resume that a recruiter would question, and your first three weak topics.
- **Bonus 2 (kills "I do not trust you"):** the data promise and the one-button delete, shown before sign-up.
- **Bonus 3 (kills "my parents pay once"):** the INR 499 season pass, six months, no auto-renew.
- **The guarantee:** a full refund in the first 7 days of Pro, no questions. It does not promise a job (nothing can), and it is cheap: even if one in five Pro payers asked, that is about INR 20 a payer at INR 99 (an estimate, to be replaced by the real claim rate).
- **Urgency:** only the real one, the placement calendar and a season pass that closes on a real date set at launch. No fake countdown.
- **Name:** *Proof Plan.*

### 4. Value equation, before and after (my scoring, 1 to 10)
| Element | Before | After | What moved it |
| --- | ---: | ---: | --- |
| Dream outcome (a placement offer) | 6 | 6 | unchanged: the product cannot promise the outcome |
| Perceived likelihood | 3 | 4 | the free first result and the "nothing unverified counts" promise; still no proof from real students |
| Time to the result | 4 | 7 | a first result in ten minutes, free |
| Effort and sacrifice | 4 | 5 | a plan instead of a content library; still asks daily work |

### 5. Re-test on the same 20 simulated students (same seed, same cards)
| | v1 (INR 299 a month, nothing else) | v2 (INR 99 or INR 499 once, 7-day trial, refund, data promise, free first result) |
| --- | ---: | ---: |
| Would pay | 0 of 20 | **0 of 20** |
| Median "getting expensive" | INR 149.5 | INR 149 |
| Median "too expensive" | INR 224.5 | INR 249 |
| Acceptable price range | INR 49 to 199 | INR 29 to 198 (INR 99 is inside it) |
| Reasons for passing | price 7, trust 6, habit 4, need 3 | price 7, trust 6, habit 5, quality 1, need 1 |

**Nothing moved on the question that matters.** The price is now acceptable, yet nobody would pay. Three things the re-test does show:
1. **Trust and price stay the top reasons**, so a better offer on paper does not remove them. Trust is only fixed by proof from real people ("a friend's real placement result", "seeing seniors who got interviews").
2. **Several said they would use the free part first** (the resume check and the plan). Free adoption looks likely; paying does not, until the free part has earned it. This supports a free-first launch that measures free-to-paid conversion with real students.
3. **The missing hidden-test judge is cited again and again** as the thing that would justify paying. The product's best feature is the one that does not run yet.

Simulated buyers are not customers and the sample is 20; a flat zero is a strong signal to test with real people, not a forecast of zero. The pitch also introduced a trial, a refund and a pass that do not exist yet and would have to be built.

## The numbers

Every number below comes from the input file. Nothing is looked up or guessed.

### One student-month

| line | per student-month |
| --- | ---: |
| Price | $99.00 |
| AI mentor: 150 messages x (3,000 in + 400 out tokens) on Gemini 3.1 Flash-Lite at USD 0.25/1.50 per 1M tokens (estimate of usage) | -$19.40 |
| AI interview audit, grading and plan assistant: ~30 calls (estimate of usage) | -$3.30 |
| Payment gateway: 2% + 18% GST on the fee = 2.36% of INR 99 (Razorpay published rate) | -$2.34 |
| Firestore reads and writes beyond the free tier (estimate) | -$1.00 |
| **Contribution** (what each student-month leaves to pay the fixed costs) | **$72.96** (74%) |

### The margin that matters

Fixed costs: $5,548 a month (Render web service, 1 CPU / 2 GB at USD 25 a month (published), at INR 95.9 per USD $2,398, Code-execution (Judge0) server needed for the verified-judging feature (ESTIMATE, no quote) $3,000, Domain and email (ESTIMATE) $150, Founder pay (none assumed: the founder works unpaid; this is not sustainable) $0).

- **Break-even: 77 student-months a day.** Below that you lose money every month.
- **Profit margin at your plan** (200 a day): **46%** of every sale, after every cost.

### Year 1, month by month

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

### What if

| scenario | margin at plan | break-even a day | year 1 profit |
| --- | ---: | ---: | ---: |
| Base plan | 46% | 77 | -$10,397 |
| Price -10% | 40% | 88 | -$18,020 |
| Volume -20% | 39% | 77 | -$21,633 |
| Unit costs +15% | 42% | 81 | -$13,404 |

### Red flags

- Year 1 loses money on operations (-$10,397).
- The startup spend is not earned back within year 1.

---
### Notes added by the CFO step (read these with the tables above)
*All amounts in this file are rupees; the tool prints a "$" sign for them. "Per day" means "per month" because the unit is one paying student-month.*

- **The margin:** at INR 99 each student-month leaves **INR 73 (74%)** after its own costs; break-even is **77 paying students**; at the assumed 200 paying students the margin after every cost is 46%.
- **The line to watch:** the mentor's model. On the cheap model the production blueprint selects, AI use is about INR 23 a student-month. If the mentor runs on a larger model after 1 January 2027 (150 messages), it is about INR 108, and **at INR 99 every student loses money (contribution -16%)**. Cap mentor messages per student and choose the model on purpose.
- **Cash:** the founder needs about **INR 71,433** before it pays for itself on the assumed ramp, mostly the INR 45,000 startup spend plus months of fixed cost before enough students pay.
- **Three ways to improve the margin (each from a run of the tool):** raise the price to INR 149 (break-even falls to 46 paying students, year 1 turns to +INR 28,103) or INR 199 (break-even 33, +INR 66,603; the top of what the panel accepts); delay the INR 3,000 a month code-execution server until the paid plan has 30 or more payers (a decision, not a tool result); sell a college licence so one buyer carries many students (price unknown, a test, not a number).
- **The ramp is the weakest input:** the panel's buy rate was 0%, so the 160 paying students by month 12 is a hope. Replace it with a real conversion measured on a free cohort.
- **The board's money conditions:** "measure the cost to serve one paying student" is now an estimate (INR 26 at INR 99), not a measurement; it is met only when real usage replaces the assumed 150 messages.
- An accountant should check the structure, payroll and tax (including GST on the subscription) before money moves. Not financial, tax or legal advice.

## Marketing

### Positioning
For engineering students in India preparing for campus placements, UNBLUFF is the placement plan that only counts what you proved. Unlike content libraries (GfG, PrepInsta) or problem banks (LeetCode), it tells you what to do today and refuses to count anything it has not checked.

### Who we talk to first
Third-year students in mid-tier colleges who already use YouTube and free tools and whose parents pay. Not the top-tier, who have mentors, and not final-year panic buyers.

### Channels (cheapest first; every one is a test, not a forecast)
1. **Free first result as the ad:** the resume check. People share their score.
2. **College WhatsApp and Telegram groups:** one student ambassador per college, 20 colleges, rewards in free Pro months (no cash).
3. **Creators:** small YouTube placement-roadmap channels (10k to 100k subs). Offer a free season pass for their audience, not a paid post at first.
4. **Placement cells:** a free pilot for one cohort in return for a testimonial and real outcome data.
5. **Reddit** (r/PlacementsPrep, r/developersIndia): honest answers, a link only where it is wanted.

### Ten hooks, each answering a panel objection
1. "Is your resume claim true? Paste it and see what a recruiter would question." (trust, need)
2. "Your ATS score in ten minutes. Free. No card." (first win)
3. "Delete everything with one button. We never sell your resume." (data trust)
4. "INR 499 for the whole placement season. Not per month." (parents)
5. "Not another course. One plan, one task for today." (too much content)
6. "A mentor that gives hints, not answers." (habit, cheating)
7. "Solved 200 problems and still blank in interviews? This is why." (pain)
8. "Nothing counts until it is checked." (the promise)
9. "Cancel and get your money back in 7 days." (risk)
10. "Built by a student who bombed his first interview." (placeholder: replace with the founder's real story; do not publish an invented one)

### 30 days from launch (dates assume launch on 23 Nov 2026; shift with the real date)
- Week 1 (23 to 29 Nov): landing page live at INR 99 vs INR 149 test; recruit 5 ambassadors; post hooks 1 to 3 in 10 groups.
- Week 2 (30 Nov to 6 Dec): run the free resume check with 100 students; collect scores, ask for permission to quote.
- Week 3 (7 to 13 Dec): approach 5 creators; start the campus cohort (about 50 students at one college).
- Week 4 (14 to 20 Dec): first paid conversion read; decide on price; publish the first real student story if consent is given.
- Days 28 to 30: review against the success lines in launch.md.

### Budget and the limit on cost per customer
The CFO shows INR 73 contribution per paying student-month at INR 99. A season pass buyer (INR 499 over six months) leaves about INR 280 after costs (estimate). **Never spend more than about INR 150 to win one paying student** until real retention is known. Start with INR 0 paid spend; give the first INR 5,000 only to the channel with the best free-to-paid rate.

## Brand

### Checks the founder must run (not done here)
- Trademark: search "UNBLUFF" in classes 9, 41, 42 on the IP India public search; take a lawyer's view before spending on the brand.
- Domains and handles: check .com, .in, .app and Instagram, YouTube, X, LinkedIn.
- Name risk: "bluff" can read as an accusation. Keep the tone on the student's side: "we help you stop bluffing yourself", not "we catch bluffers".

### Promise and voice
**Promise:** a placement plan that only counts what you proved.
**Voice:** direct, calm, a little dry; a senior who is honest, never a guru. Short sentences. Say what is not built yet.
**Never:** guarantee a job, fake testimonials, fake countdowns.

### Taglines (to test)
- "Stop bluffing. Start proving."
- "Only what you proved counts."
- "Your placement plan, honestly."

### Look (already in the product)
Red liquid-glass accent on a dark/light surface; Lora (serif headings) and Geist (body), both open-licence fonts. Check text contrast on the glass surfaces at AA (4.5:1) before launch; the sidebar and landing glass are the likeliest to fail on light mode.

### Logo brief
A simple wordmark in Lora, one mark: a check inside a speech bubble or a crossed-out "bluff" word. One colour, readable at 16px (favicon) and on WhatsApp previews. Do not use stock AI imagery.

## Operations

### Daily cycle (one founder)
Morning: check error logs, cost dashboard (Gemini, Render) and refund/support inbox. Midday: reply to students (target under 24 hours). Evening: review the day's signups, free-to-paid, and one improvement shipped.

### Suppliers (single points of failure, with a plan B)
| Need | Supplier | If it fails |
| --- | --- | --- |
| Hosting API | Render | Move the container to Fly.io or Cloud Run (Docker already in repo) |
| Auth, database, web | Firebase | None cheap; export data weekly |
| AI | Gemini API | Swap model via the LLM adapter; cap messages per student |
| Payments | Razorpay | Cashfree as a second gateway |
| Code execution | A Judge0 server (not yet verified) | Keep the judge feature off until proven |
Prices come from cfo-sources.md; the Judge0 and domain costs are estimates.

### People
Founder only. First hire is not before 200 paying students. Part-time support from one student ambassador per college, paid in free months.

### Standard procedures
Refund: reply in 24 hours, refund in full within 7 days of Pro, log reason. Data deletion: the in-app delete button; confirm to the student by email. Incident: if student data may have leaked, stop signups, rotate credentials, tell students, and take advice on DPDP duties. Mentor cost spike: lower the message cap first, then change model.

### Licences and legal (confirm with professionals; none of this is advice)
Company registration (Private Limited or LLP) before taking money; GST registration depending on turnover and the subscription; a privacy policy and terms; compliance with the Digital Personal Data Protection Act 2023 (consent, deletion, breach notice); licence for any company-specific interview data (the product refuses to boot in production with an unlicensed catalogue); Razorpay KYC.

### Risk register
1. Mentor model cost rises (cap messages). 2. Judge0 not working (keep off, say so). 3. Resume data leak (isolation tested; keep rules closed). 4. Credentials already leaked in chat (rotate now). 5. Zero paid conversion (free-first launch). 6. GfG or LeetCode add the same feature. 7. Gemini outage or policy change. 8. Refund abuse. 9. Founder burnout (single person). 10. Trademark conflict on the name.

## Launch plan

### The cheap real test first
Do not build billing before proof. For four weeks: (a) landing page with a waitlist and two prices (INR 99 vs INR 149, plus the INR 499 pass), measuring click-to-pay intent; (b) a free cohort of about 50 students in one college using the real product, with a pay-or-not question at day 21.

### Success lines (set before the test)
- 30%+ of the cohort uses the plan three or more days a week for two weeks.
- 10%+ of active students say yes to paying at day 21 (the plan's default bar is 25% buy; the free-first bar is lower because the panel said no).
- At least 3 students share a real before/after story with consent.
If the first fails, fix the product. If the second fails, change the offer or price. Do not spend on ads.

### Critical path (before any paid launch)
1. Rotate the leaked credentials. 2. Production Firebase project and hosting variables (docs/security-and-launch.md). 3. Judge0 server verified, or the feature clearly labelled unavailable. 4. Privacy policy, terms, one-button delete visible. 5. Legal entity and Razorpay. 6. Company-data licence decision. 7. Billing, trial and refund built.

### Countdown (launch target 23 Nov 2026)
- 22 Oct to 1 Nov: credentials rotated, production project created.
- 2 to 10 Nov: Judge0 decision; privacy/terms; landing waitlist live.
- 11 to 18 Nov: recruit the campus cohort; entity and Razorpay started.
- 19 to 22 Nov: dry run, backup, runbook check.
- 23 Nov: soft launch to the cohort and groups.

### Launch-day run sheet
Check health endpoint and logs, post hooks 1 to 3, watch signups and errors every hour, reply to every message within 2 hours, end of day: count signups, resume checks, errors, cost.

### 30-day review
Compare with the success lines, decide: continue, change the offer, change the price, or pivot to cohort licences for placement cells.

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
