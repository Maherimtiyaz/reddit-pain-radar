const DEFAULT_SITE_URL = "https://painproof.co";

/** Empty/whitespace values count as unset (`??` would not catch `""`). */
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

export const site = {
  name: "PainProof",
  title: "PainProof — Problems worth building, with proof",
  shortDescription: "Problems worth building, with proof.",
  description:
    "PainProof finds the problems people keep complaining about on Hacker News and GitHub, scores them, and links the proof — so first-time founders build what people already want.",
  url: (configuredSiteUrl || DEFAULT_SITE_URL).replace(/\/$/, ""),
  email: "hello@painproof.co",
  /** Stripe payment link. Empty string means checkout falls back to #subscribe. */
  stripePaymentLink: process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ?? "",
} as const;

export const navLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Sample", href: "#sample" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;
