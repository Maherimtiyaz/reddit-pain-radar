# PainProof — the plan on one page

> **Problems worth building, with proof.**
> For first-time indie hackers and solo founders who don't know what to build,
> or aren't sure their idea is worth it.

## One brand, three layers

```
 ┌──────────────────────────────────────────────────────────────┐
 │ 1. PainProof Weekly (FREE newsletter)  → builds the audience │
 │    5–7 real pains of the week, each with linked proof        │
 └──────────────┬───────────────────────────────────────────────┘
                │ every issue ends with: "Have an idea? Check it."
 ┌──────────────▼───────────────────────────────────────────────┐
 │ 2. Check My Idea ($9 one-off report)   → first money         │
 │    You type an idea → we return a verdict (build / niche     │
 │    down / skip), demand evidence, competitors, next step     │
 └──────────────┬───────────────────────────────────────────────┘
                │ people who buy twice want it continuously
 ┌──────────────▼───────────────────────────────────────────────┐
 │ 3. PainProof Pro ($19/mo, later)       → recurring revenue   │
 │    Unlimited checks, niche watch alerts, full pain archive   │
 └──────────────────────────────────────────────────────────────┘
```

The newsletter and the product feed each other. The newsletter **shows** the
method every week (free marketing), and Check My Idea **sells** the same method
pointed at the reader's own idea.

## Your newsletter idea, sharpened

What you said: a newsletter with ideas to build, tools, and AI knowledge,
researched from many places (X, LinkedIn, Reddit, HN…).

What makes it work:

| Your instinct                | Make it sharper                                                                      | Why                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Ideas + tools + AI knowledge | **Pains with proof is the main thing.** Tools/AI = one small "Builder's toolkit" box | "Another AI newsletter" loses. "The newsletter that proves demand before you build" is specific and memorable |
| Weekly or monthly            | **Weekly**, same day every week (e.g. Tuesday)                                       | Monthly is too slow to build a habit or an audience                                                           |
| Top 10                       | **Start with 5–7**, grow to 10 as sources grow                                       | This week's real research found ~7 strong pains. Five great ones beat ten weak ones                           |
| Research everywhere          | **Yes, but split it into two lanes** (below)                                         | Keeps you legally safe                                                                                        |

### The two-lane rule for sources (important)

| Lane                                    | Sources                                                                             | How                                                                                   | Why                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Automated** (the product, code)       | Hacker News API, GitHub Issues API, App Store reviews feed, your users' own uploads | Software fetches and scores                                                           | These have open/official APIs. Still read each one's terms before charging                                        |
| **Editorial** (the newsletter, a human) | Anything public: X, LinkedIn, Reddit, forums, HN, YouTube comments                  | **You** read, pick, link to the original, quote one short line, add your own analysis | This is normal journalism/curation. Don't scrape these with bots, don't copy whole posts, don't resell their data |

The newsletter can include Reddit, X and LinkedIn. **The automated product should not**
(that's what killed GummySearch). This isn't legal advice: read each platform's terms,
and get a lawyer's opinion before you scale.

## Name and domain

- `painproof.com` is **taken**.
- `painproof.io`, `painproof.co`, `painproof.app` and `getpainproof.com` showed no
  registration record when checked on 2026-11-17. Confirm at a registrar before buying.
- Recommendation: **painproof.co** or **getpainproof.com**, plus the matching X / LinkedIn handle.

## The first 30 days

| Week | Goal                                                                         | Done when                                                 |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | Validate by hand: [week-1-validation-kit.md](week-1-validation-kit.md)       | 5 manual reports delivered, at least 1 paid               |
| 1    | Send Issue #0: [newsletter-issue-0.md](newsletter-issue-0.md)                | Sent to your first 20–50 people                           |
| 2    | Newsletter set up: [newsletter-playbook.md](newsletter-playbook.md)          | Signup page live, Issue #1 sent                           |
| 2–3  | Only if week 1 worked: adapt the existing code into the Check My Idea engine | HN + GitHub fetchers, "Check my idea" button, $9 checkout |
| 4    | Soft launch (Indie Hackers, BetaList, Peerlist)                              | 100+ subscribers, 10+ paid checks                         |

Product Hunt and Show HN come **after** you have real users and real testimonials.

## What the existing code gives you (from the audit)

About 80% of the Reddit Pain Radar code carries over: Stripe checkout and webhook,
login, dashboard, API keys, the pain detector, LLM scoring, clustering and the
report renderer. The new work is source adapters (HN, GitHub, app reviews), renaming
the Reddit-named database columns, and a web form for "Check my idea". Don't start
that until week 1 says yes.

## Files in this folder

| File                                                                                 | What it is                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [week-1-validation-kit.md](week-1-validation-kit.md)                                 | Day-by-day plan, outreach messages, intake questions, success criteria |
| [check-my-idea-template.md](check-my-idea-template.md)                               | The report you deliver, with the scoring formula                       |
| [sample-report-failed-payment-recovery.md](sample-report-failed-payment-recovery.md) | A real example made from live Hacker News data                         |
| [newsletter-playbook.md](newsletter-playbook.md)                                     | Format, sourcing rules, tools, growth, money                           |
| [newsletter-issue-0.md](newsletter-issue-0.md)                                       | A ready-to-edit first issue from this week's real data                 |
