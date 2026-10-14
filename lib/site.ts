const DEFAULT_SITE_URL = "https://redditpainradar.com";

/** Empty/whitespace values count as unset (`??` would not catch `""`). */
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const site = {
  name: "Reddit Pain Radar",
  title: "Reddit Pain Radar — Find what founders are complaining about",
  shortDescription: "Scored pain-point reports mined from Reddit communities.",
  description:
    "Reddit Pain Radar scans the subreddits your customers live in, scores every complaint by urgency and willingness to pay, and delivers a build-ready opportunity report in minutes.",
  url: (configuredSiteUrl || DEFAULT_SITE_URL).replace(/\/$/, ""),
  email: "hello@redditpainradar.com",
  /** Stripe payment link. Empty string means the CTAs fall back to #waitlist. */
  stripePaymentLink: process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "",
} as const;

export const navLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;
