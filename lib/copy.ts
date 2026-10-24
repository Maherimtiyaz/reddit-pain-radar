export const announcement =
  "Early access — first 10 customers get 50% off for life";

export const hero = {
  eyebrow: "Now accepting early access",
  headline: "Mine Reddit for the problems worth solving.",
  subheadline:
    "Reddit Pain Radar scans the subreddits your customers live in, scores every complaint by urgency and willingness to pay, and hands you a build-ready opportunity report.",
  bullets: [
    "Scan 10 subreddits in under 5 minutes",
    "Every signal scored, quoted, and ranked",
    "Markdown reports you can act on today",
  ],
  ctaPrimary: "Start for $29/mo",
  ctaSecondary: "See how it works",
  waitlist: "247 founders already on the waitlist",
} as const;

export const socialProof = {
  label: "Trusted by founders from",
  logos: [
    "Indie Hackers",
    "Product Hunt",
    "Hacker News",
    "MicroConf",
    "Starter Story",
    "Founders Network",
    "On Deck",
    "TinySeed",
  ],
} as const;

export const howItWorks = {
  title: "Three steps. Five minutes. One clear decision.",
  subtitle:
    "No dashboards to learn. No data pipeline to maintain. Point it at a community and read the report.",
  steps: [
    {
      title: "Connect subreddits",
      description:
        "Pick the communities where your customers complain. Paste a list or let us suggest the busiest ones for your niche.",
    },
    {
      title: "AI scans and scores",
      description:
        "Every post is analyzed for urgency, frequency, and willingness to pay, then clustered into recurring pain themes.",
    },
    {
      title: "Get your report",
      description:
        "One markdown report with themes, verbatim quotes, and a build recommendation you can paste into your roadmap.",
    },
  ],
} as const;

export const features = {
  title: "From raw complaints to a ranked build list",
  subtitle:
    "Everything you need to decide what to build next — without a single spreadsheet.",
  items: [
    {
      title: "Pain Signal Score",
      description:
        "Every theme gets a 0–100 score blending urgency, frequency, and willingness to pay so you can rank opportunities at a glance.",
    },
    {
      title: "Verbatim Evidence",
      description:
        "Each theme ships with the exact quotes and thread links behind it. No paraphrasing, no invented demand.",
    },
    {
      title: "Urgency Ranking",
      description:
        "Complaints are ordered by how badly people want them solved right now — not by how loud the subreddit is.",
    },
    {
      title: "API Access",
      description:
        "Pull scored signals into your own tools, dashboards, or AI agents with a clean JSON API.",
    },
  ],
} as const;

export const demo = {
  eyebrow: "Live sample report",
  title: "This is what lands in your inbox",
  subtitle:
    "A real report shape, with animated scores. Every number links back to the posts that produced it.",
  theme: "Quote-to-Cash Automation for Roofers",
  score: 87,
  quote:
    "I wish there was a tool that just told me what problems people are complaining about this week.",
  quoteAuthor: "u/founder_42",
  metrics: [
    { label: "Urgency", value: 9, tone: "urgency" as const },
    { label: "Willingness to pay", value: 8, tone: "signal" as const },
  ],
  signals: [
    { label: "Urgency", value: 90 },
    { label: "Frequency", value: 84 },
    { label: "Willingness to pay", value: 80 },
    { label: "Competition gap", value: 72 },
    { label: "Rising trend", value: 65 },
  ],
  recommendation:
    "Build a single-purpose quote-to-cash tool for roofing contractors. Urgency is high, incumbents are generic, and buyers already pay for adjacent scheduling software.",
  cta: "Generate your first report free",
} as const;

export const testimonials = {
  title: "Founders stopped guessing",
  subtitle:
    "Early users replaced weeks of manual subreddit reading with a five-minute report.",
  items: [
    {
      quote:
        "I cancelled three features from my roadmap after one report. The urgency scores were brutal — and correct.",
      name: "Maya Chen",
      role: "Founder",
      company: "Ledgerly",
      rating: 5,
    },
    {
      quote:
        "The verbatim quotes are the killer feature. I forwarded the report to my cofounder and we picked a direction the same day.",
      name: "Daniel Okafor",
      role: "Co-founder",
      company: "Fieldnote",
      rating: 5,
    },
    {
      quote:
        "It's like having a full-time analyst reading Reddit for me. I found a niche with real willingness to pay in my second report.",
      name: "Priya Raman",
      role: "Solo founder",
      company: "Quietstack",
      rating: 5,
    },
  ],
} as const;

export const pricing = {
  title: "One plan. Everything included.",
  subtitle:
    "Early access pricing, locked in for life for the first 10 customers.",
  tier: {
    name: "Early Access",
    price: 29,
    period: "/month",
    tagline: "For solo founders and small product teams.",
    features: [
      "3 scored reports per month",
      "Up to 10 subreddits per report",
      "Verbatim evidence with post links",
      "Markdown export",
      "Email delivery",
    ],
    cta: "Start for $29/mo",
    note: "First 10 customers get 50% off for life. 3 spots left.",
  },
} as const;

export const faq = {
  title: "Questions, answered",
  items: [
    {
      q: "How does Reddit Pain Radar find pain signals?",
      a: "We scan the subreddits you choose, read every post and comment in the window you select, and cluster recurring complaints into themes. Each theme is scored on urgency, frequency, and willingness to pay, then backed by the verbatim quotes that produced it.",
    },
    {
      q: "Do I need a Reddit account or API key?",
      a: "No. You point us at community names and we handle the rest. You never have to touch Reddit's API, rate limits, or scraping infrastructure.",
    },
    {
      q: "How is the Pain Signal Score calculated?",
      a: "The score blends four inputs: how urgently people describe the problem, how often it recurs, whether commenters mention paying for a fix, and how poorly existing tools address it. You see the full breakdown, not just the headline number.",
    },
    {
      q: "What format is the report delivered in?",
      a: "Every report is delivered as a clean markdown file by email, with themes, scores, quotes, thread links, and a build recommendation. You can also export it from the dashboard at any time.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. Early access is month-to-month with no contract, and you can cancel from your billing page in one click. The 50% lifetime discount stays if you keep your subscription active.",
    },
  ],
} as const;

export const finalCta = {
  headline: "Stop guessing. Start building what people actually need.",
  subtitle: "Join the early access list and get your first scored report free.",
  inputPlaceholder: "you@company.com",
  button: "Get Early Access",
  success: "You're on the list. Check your inbox for your first report.",
  trust: "No spam. Unsubscribe anytime.",
} as const;

export const checkoutSuccess = {
  title: "Payment received",
  body: "Your API key is on its way to your inbox — usually under a minute.",
  help: "Nothing after a few minutes? Check spam, or email",
  dismiss: "Dismiss",
} as const;

export const footer = {
  tagline: "Scored pain-point reports mined from Reddit communities.",
  columns: [
    {
      title: "Product",
      links: [
        { label: "How it works", href: "#how-it-works" },
        { label: "Features", href: "#features" },
        { label: "Pricing", href: "#pricing" },
        { label: "Sample report", href: "#demo" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "#" },
        { label: "Blog", href: "#" },
        { label: "Careers", href: "#" },
        { label: "Contact", href: "#waitlist" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "FAQ", href: "#faq" },
        { label: "API docs", href: "#" },
        { label: "Changelog", href: "#" },
        { label: "Status", href: "#" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy", href: "#" },
        { label: "Terms", href: "#" },
        { label: "Security", href: "#" },
        { label: "Cookies", href: "#" },
      ],
    },
  ],
  social: [
    { label: "Twitter", href: "https://twitter.com" },
    { label: "GitHub", href: "https://github.com" },
    { label: "LinkedIn", href: "https://linkedin.com" },
  ],
  copyright: `© ${new Date().getFullYear()} Reddit Pain Radar. All rights reserved.`,
} as const;
