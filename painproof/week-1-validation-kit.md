# Week 1 — Validation kit (no code)

**The question this week answers:** will first-time founders pay $9 to have
their idea checked against real evidence?

You do the whole service **by hand** this week: HN search, reading, and the
LLM prompt below. If people love it and pay, the software is worth building.
If not, you've lost one week instead of three months.

## Success criteria (decide now, judge on day 7)

| Result                                        | Meaning                          | Next step                                                    |
| --------------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| **≥3 of 5** say "very useful" **and ≥1 pays** | ✅ Real demand                   | Build the engine (week 2)                                    |
| People like it, nobody pays                   | 🟡 Value unclear at this price   | Try $5, or bundle it into a paid newsletter tier             |
| "Meh" / no replies                            | 🔴 Wrong problem or wrong people | Change the audience (e.g. PMs, agencies) before writing code |

## Setup (Day 0, about 1 hour)

1. **Stripe Payment Link:** Product "Check My Idea report", **$9 one-time**. No code needed.
   (Stripe Dashboard → Payment Links → New.)
2. **Intake form** (Google Form or Tally) with the questions below. Put the payment
   link on its thank-you screen.
3. **Tracking sheet** with columns: name · where found · idea · DM sent · replied ·
   report sent · rating 1–5 · paid? · quote I can use?
4. Bookmark **https://hn.algolia.com**, the free HN search used for evidence.

### Intake form questions

1. Your idea in one sentence. Who is it for, and what does it do?
2. Who would pay for it? (job title or type of business)
3. What do you think the main pain is?
4. Any competitors you already know?
5. What would make you _stop_ working on this idea?
6. Email (where to send the report).

## Day by day

| Day | Do this                                                                                               | Target                |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | Find 30 people asking "what should I build?" or sharing a new idea (where to look: below)             | 30 names in the sheet |
| 1–2 | Send the DM (below) to all 30                                                                         | 30 sent               |
| 2–5 | Make reports with the [template](check-my-idea-template.md). Aim for 60–90 minutes each               | 5 reports             |
| 2–5 | Send each report, then ask the 3 feedback questions                                                   | 5 feedback replies    |
| 4   | Ask happy people to pay $9 for a **second** idea, or to pay for the first one if they found it useful | ≥1 payment            |
| 6   | Send newsletter Issue #0 to everyone who replied                                                      | 1 issue sent          |
| 7   | Count the results against the success criteria above                                                  | Decision              |

## Where to find first-time founders

- **Hacker News:** recent "Ask HN: what should I build" threads, and people posting their
  first Show HN. Reply publicly with something useful; don't cold-pitch.
- **Indie Hackers:** posts in the ideas and validation groups.
- **X:** search `"what should I build"`, `"validating my idea"`, `"first SaaS"`, `#buildinpublic`.
- **LinkedIn:** people posting "I'm starting my first startup".
- **Reddit (manual, as a human):** r/SideProject, r/indiehackers, r/SaaS. **Read each
  subreddit's self-promotion rules first.** Most allow helping in comments, not
  advertising in posts.
- Your own network: friends, ex-colleagues, local startup or university groups.

## Messages to send

**DM: someone who shared an idea**

> Hey [name], saw your post about [idea]. I'm testing a small service that checks
> ideas against real evidence: what people actually complain about on Hacker
> News, GitHub and app reviews, who already competes, and whether people pay.
> Can I run one free check on your idea? It takes me a day, and I'd only ask
> for your honest reaction.

**DM: someone asking what to build**

> Hey [name], saw you're looking for something to build. I research real pains
> people are complaining about (with links as proof). Want me to send you the
> 5 strongest ones I found this week? Free. I'm testing whether it's useful.

**After sending a report: 3 feedback questions**

> 1. On a scale of 1–5, how useful was this?
> 2. Did it change what you'll do next? How?
> 3. If I charged $9 for each check, would you have paid for this one? Why or why not?

**Asking for payment (only to people who said 4–5)**

> Glad it helped! I'm opening this up as a paid service: $9 per idea check.
> If you have a second idea, here's the link: [Stripe payment link]. And if you'd
> be OK with me quoting you on the website, that would help a lot.

## How to make a report by hand (60–90 min)

1. **Turn the idea into 5–8 search phrases**: the pain words ("manually",
   "spreadsheet", "I wish there was", "too expensive") plus the topic.
2. **Search HN** at hn.algolia.com, filtered by _Comments_. Then search by _Stories_
   for "Show HN" and "Launch HN" to find competitors.
3. **Search GitHub** issues on related tools, sorted by 👍. Upvote counts are measurable demand.
4. **App Store / Google Play:** read the 1–2★ reviews of the top 2–3 competitors.
   These come from people who already pay, which is the best willingness-to-pay signal.
5. **Paste the evidence into an LLM** with this prompt:
   > You are a skeptical startup analyst. Here is an idea and raw evidence quotes with
   > links. Score: Demand (0–10), Willingness to pay (0–10), Competition openness (0–10,
   > 10 = nobody serves this well), Ease of MVP for a solo founder (0–10). Use only the
   > evidence given. Quote it. Never invent sources. Then list the 3 most promising
   > niche angles and one 48-hour test the founder can run.
6. **Fill in the [template](check-my-idea-template.md).** Check every link yourself. Never send a quote you didn't open.

See [sample-report-failed-payment-recovery.md](sample-report-failed-payment-recovery.md)
for a finished example.

## Rules

- Be honest. A "skip" verdict that saves someone 3 months is the most valuable thing you can give.
- Only real quotes, always linked.
- Never invent testimonials. Use only quotes from people who agreed to be quoted.
