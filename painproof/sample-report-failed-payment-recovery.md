# PainProof check: a tool that recovers failed Stripe payments for small SaaS

**Prepared for:** sample report (made by hand from live Hacker News data, 2026-11-17)
**Sources searched:** Hacker News via the Algolia search API: 6 searches, ~40 relevant
comments read, from 2012 to 2026. GitHub and app reviews were not searched for this sample.

## Verdict: 🟡 Niche down

**PainProof Score: 68/100**

The pain is real, old and expensive: failed card payments quietly cancel paying
customers. But the generic product is **crowded**. Stripe has built-in fixes, and
several dedicated tools have launched since 2014. Don't build "another dunning tool".
Build for a specific slice that the general tools serve badly.

## Scores

| Signal               | Score | Why                                                                                                                                                                          |
| -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demand               | 8/10  | Comments describe failed payments as a large share of churn ([HN, 2019](https://news.ycombinator.com/item?id=19425196)), and new founders keep building tools for it in 2026 |
| Willingness to pay   | 9/10  | The pain is lost revenue you can measure, so the return on a tool is easy to show                                                                                            |
| Competition openness | 3/10  | Stunning (since ~2014), FlyCode (YC S22), Rekko and WorkAid (both 2026), plus Stripe's own Smart Retries                                                                     |
| Ease of MVP          | 6/10  | Stripe webhooks plus email/SMS is doable solo, but payments carry trust and compliance weight                                                                                |

Score = (8×0.30 + 9×0.30 + 3×0.25 + 6×0.15) × 10 = **68**

## Proof: what real people said

> "sometimes the majority of its entire churn is caused by unexplained failed card
> charges from Stripe" ([HN, 2019](https://news.ycombinator.com/item?id=19425196))

> "I noticed 30,000 failed charges in one year… I hate seeing those failed charge[s]"
> ([HN, 2014](https://news.ycombinator.com/item?id=7671238))

> "I was tired of manually chasing customers when their subscription payments failed
> on my gym SaaS. Stripe's built-in dunning emails have a pretty low recovery rate
> (most customers ignore them)." ([HN, Jan 2026](https://news.ycombinator.com/item?id=46752629))

> "this is a deep topic and people bleed all over it when running a SaaS company"
> ([HN, 2016](https://news.ycombinator.com/item?id=12340620))

## Who already solves this

| Competitor                                                                                | What they do                                             | Weak spot / gap                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| Stripe Smart Retries + card updater ([HN](https://news.ycombinator.com/item?id=16767288)) | Built-in ML retries, automatic card updates              | Generic emails; founders say recovery is low |
| Stunning ([HN, 2014](https://news.ycombinator.com/item?id=8468620))                       | Dunning emails for Stripe                                | Long-established, so hard to beat head-on    |
| FlyCode, YC S22 ([Launch HN](https://news.ycombinator.com/item?id=41998159))              | Owns retries and communications end-to-end; backup cards | Aimed at larger merchants                    |
| Rekko ([HN, 2026](https://news.ycombinator.com/item?id=46752629))                         | SMS + email on each retry, started for gyms              | Very new: shows the vertical angle works     |
| WorkAid Dunning ([HN, 2026](https://news.ycombinator.com/item?id=47427517))               | Visibility into recovery rates                           | Very new                                     |

Other known players outside this search: Churn Buster, Churnkey, Baremetrics Recover.

## Best angles for you

1. **Pick one vertical (gyms, studios, tutors, local services).** Rekko began with
   gyms. Non-tech owners don't know what "dunning" means and need it done for them.
2. **Move customers off cards entirely.** One commenter says that where direct debit
   is available "they essentially never exhibit" these failures
   ([HN, 2019](https://news.ycombinator.com/item?id=19425196); see also
   [2020](https://news.ycombinator.com/item?id=25078710)). A tool that moves at-risk
   subscribers to bank debit is a different product from "retry the card".
3. **Visibility only.** Founders "have very little visibility into how many payments
   actually fail" ([HN, 2026](https://news.ycombinator.com/item?id=47427517)). A
   free failed-payments report could feed into a paid fix.

## Your 48-hour test

Find 10 owners of gyms or studios that bill monthly by card. Ask: _"How many members
did you lose last year because their card failed? Would you pay $29/month to get
half of them back automatically?"_ If 3 say yes with a number, build the MVP for
that vertical only.

## Limits of this report

Hacker News only, and HN leans towards developers. Competitor details come from their
own HN posts, not independent reviews. The next step would be reading 1–2★ reviews of
these tools and talking to 5 real gym owners.

---

_PainProof: problems worth building, with proof._
