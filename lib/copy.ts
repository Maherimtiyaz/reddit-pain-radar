/**
 * All marketing copy. Rule: every claim here must be true today, or be
 * labelled as coming soon. No invented testimonials, counts, logos or scarcity.
 */

export const announcement =
  "New: PainProof Weekly — real problems worth building, with proof. Free, every Tuesday.";

export const hero = {
  eyebrow: "For first-time founders and indie hackers",
  headlineLead: "Build what people",
  headlineAccent: "already want.",
  subheadline:
    "PainProof reads public conversations on Hacker News and GitHub, finds the problems people keep complaining about, and shows you the proof — before you spend months building.",
  bullets: [
    "Every pain linked to the original post",
    "An honest verdict: build, niche down, or skip",
    "Free weekly newsletter — no card needed",
  ],
  ctaPrimary: "Get the free weekly",
  ctaSecondary: "See a sample idea check",
  note: "Check My Idea ($9 per report) launches soon. Subscribers get first access.",
} as const;

export const sources = {
  label: "Where the evidence comes from",
  items: [
    { name: "Hacker News", status: "live" },
    { name: "GitHub Issues", status: "live" },
    { name: "App Store reviews", status: "soon" },
  ],
  footnote:
    "Every quote links to its source. Nothing is paraphrased or invented.",
} as const;

export const howItWorks = {
  title: "From “is this a good idea?” to a clear answer",
  subtitle:
    "No dashboards to learn. Describe the idea, read the verdict, decide.",
  steps: [
    {
      title: "Describe your idea",
      description:
        "One sentence: who it's for and what it does. That's all we need to start searching.",
    },
    {
      title: "We search real conversations",
      description:
        "Hacker News threads and GitHub issues where people describe the problem, ask for a tool, or complain about the ones they pay for.",
    },
    {
      title: "Get a verdict with proof",
      description:
        "Build it, niche down, or skip — with a PainProof Score, linked quotes, the competitors, and one 48-hour test to run next.",
    },
  ],
} as const;

export const features = {
  title: "Proof, not vibes",
  subtitle:
    "Everything a first-time founder needs to decide whether an idea is worth months of their life.",
  scoreChips: [
    { label: "Demand", value: "8", tone: "brand" },
    { label: "WTP", value: "9", tone: "signal" },
    { label: "Open", value: "3", tone: "urgency" },
    { label: "Ease", value: "6", tone: "brand" },
  ],
  items: [
    {
      title: "PainProof Score",
      description:
        "One 0–100 number from four signals: demand, willingness to pay, how open the market is, and how easy a first version is for one person. You see every part, not just the total.",
    },
    {
      title: "Linked evidence",
      description:
        "Each claim comes with the real quote and a link to where it was said. Click through and check it yourself.",
    },
    {
      title: "Competitor map",
      description:
        "Who already solves this, and where people say they fall short.",
    },
    {
      title: "Your 48-hour test",
      description:
        "One concrete next step to prove demand before you write code.",
    },
  ],
} as const;

export const demo = {
  eyebrow: "Real sample check",
  title: "A real check, built from real comments",
  subtitle:
    "We checked the idea “recover failed Stripe payments for small SaaS” against Hacker News. This is what came back.",
  theme: "Failed-payment recovery for small SaaS",
  verdict: "Niche down",
  score: 68,
  quote:
    "Stripe's built-in dunning emails have a pretty low recovery rate (most customers ignore them).",
  quoteAuthor: "Hacker News, January 2026",
  quoteUrl: "https://news.ycombinator.com/item?id=46752629",
  metrics: [
    { label: "Demand", value: 8, tone: "urgency" as const },
    { label: "Willingness to pay", value: 9, tone: "signal" as const },
  ],
  signals: [
    { label: "Demand", value: 80 },
    { label: "Willingness to pay", value: 90 },
    { label: "Competition openness", value: 30 },
    { label: "Ease of MVP", value: 60 },
  ],
  recommendation:
    "The pain is real and costly, but the generic tool is crowded: Stripe's own retries plus several dedicated startups. Pick one vertical — gyms, studios, tutors — where owners don't know what “dunning” means and need it done for them.",
  cta: "Get the free weekly",
} as const;

export const pricing = {
  title: "Start free. Pay only when you have an idea to check.",
  subtitle: "No subscription needed to get value from PainProof.",
  tiers: [
    {
      name: "PainProof Weekly",
      price: "Free",
      period: "",
      tagline: "The newsletter. Every Tuesday.",
      badge: null,
      features: [
        "5–7 real pains of the week",
        "Linked proof for every pain",
        "A build idea and verdict for each",
        "One tool or research trick per issue",
      ],
      cta: "Subscribe free",
      href: "#subscribe",
      highlight: false,
    },
    {
      name: "Check My Idea",
      price: "$9",
      period: "/report",
      tagline: "Your idea, checked against real evidence.",
      badge: "Launching soon",
      features: [
        "Verdict: build, niche down, or skip",
        "PainProof Score with the full breakdown",
        "Linked quotes from Hacker News and GitHub",
        "Competitors and their weak spots",
        "Your 48-hour validation test",
      ],
      cta: "Get early access",
      href: "?ref=check-my-idea#subscribe",
      highlight: true,
    },
  ],
} as const;

export const faq = {
  title: "Questions, answered",
  items: [
    {
      q: "What is PainProof?",
      a: "A free weekly newsletter of real problems worth building, plus a paid report that checks your own idea against real evidence. Both are for people building their first product who want proof before they commit months to it.",
    },
    {
      q: "Where does the evidence come from?",
      a: "Public posts on Hacker News and issues on GitHub today, with app store reviews next. Every quote links to the original so you can check it yourself. We never invent quotes or sources.",
    },
    {
      q: "Do you collect data from Reddit, X or LinkedIn?",
      a: "Our software doesn't. In the newsletter we sometimes link to a public post we've read ourselves, quoting a short line with credit and a link to the original.",
    },
    {
      q: "How is the PainProof Score calculated?",
      a: "Score = (Demand × 0.30 + Willingness to pay × 0.30 + Competition openness × 0.25 + Ease of MVP × 0.15) × 10. 75 and above means build it, 55–74 means niche down, below 55 means skip or rethink.",
    },
    {
      q: "What if my idea gets a “skip”?",
      a: "That's the most valuable answer we can give: it saves you months. The report still shows which nearby angles look stronger.",
    },
    {
      q: "When does Check My Idea launch?",
      a: "Soon. Newsletter subscribers hear first. The newsletter is free, and every issue has an unsubscribe link.",
    },
  ],
} as const;

export const finalCta = {
  badge: "Free every Tuesday",
  headline: "Get 5–7 problems worth building, every week.",
  subtitle:
    "Real pains from real people, each with linked proof and a build idea. Free.",
  inputPlaceholder: "you@example.com",
  button: "Subscribe free",
  success: "You're in. The next issue lands on Tuesday.",
  trust: "No spam. Unsubscribe in one click.",
} as const;

export const checkoutSuccess = {
  title: "Payment received",
  body: "Check your inbox for the next steps — usually under a minute.",
  help: "Nothing after a few minutes? Check spam, or email",
  dismiss: "Dismiss",
} as const;

export const footer = {
  tagline: "Problems worth building, with proof.",
  columns: [
    {
      title: "Product",
      links: [
        { label: "How it works", href: "#how-it-works" },
        { label: "Sample check", href: "#sample" },
        { label: "Pricing", href: "#pricing" },
        { label: "Weekly newsletter", href: "#subscribe" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "FAQ", href: "#faq" },
        { label: "Sign in", href: "/login" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    },
  ],
  copyright: `© ${new Date().getFullYear()} PainProof. All rights reserved.`,
} as const;
