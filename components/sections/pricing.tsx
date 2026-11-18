import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { isCheckSaleOpen } from "@/lib/check/availability";
import { pricing } from "@/lib/copy";
import { cn } from "@/lib/utils";

type Tier = (typeof pricing.tiers)[number];

function TierCard({ tier, open }: { tier: Tier; open: boolean }) {
  const href = open ? tier.openHref : tier.href;
  const cta = open ? tier.openCta : tier.cta;
  return (
    <div
      className={cn(
        "h-full rounded-3xl p-px",
        tier.highlight
          ? "from-brand/70 via-brand-violet/40 bg-gradient-to-b to-transparent shadow-[0_0_60px_-20px_rgba(99,102,241,0.7)]"
          : "bg-line",
      )}
    >
      <div className="bg-surface flex h-full flex-col rounded-[calc(1.5rem-1px)] p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="font-heading text-ink text-lg font-semibold">
            {tier.name}
          </span>
          {tier.badge && !open ? (
            <span className="border-urgency/40 bg-urgency/10 text-urgency rounded-full border px-3 py-1 text-xs font-medium">
              {tier.badge}
            </span>
          ) : null}
        </div>

        <p className="text-ink-muted mt-2 text-sm">{tier.tagline}</p>

        <div className="mt-6 flex items-end gap-1">
          <span className="font-heading text-ink text-5xl font-semibold tracking-tight">
            {tier.price}
          </span>
          {tier.period ? (
            <span className="text-ink-muted mb-1.5 text-sm">{tier.period}</span>
          ) : null}
        </div>

        <Button
          asChild
          variant={tier.highlight ? "default" : "outline"}
          className={cn(
            "mt-6 h-12 w-full text-base",
            !tier.highlight && "border-line bg-surface-2/60",
          )}
        >
          <a href={href}>
            {cta}
            <ArrowRight className="size-4" />
          </a>
        </Button>

        <ul className="mt-8 flex flex-col gap-3">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <span className="bg-signal/15 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
                <Check className="text-signal size-3" aria-hidden="true" />
              </span>
              <span className="text-ink-muted text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Pricing() {
  const open = isCheckSaleOpen();
  return (
    <Section id="pricing">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title={pricing.title}
          subtitle={pricing.subtitle}
        />

        <RevealGroup className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
          {pricing.tiers.map((tier) => (
            <RevealItem key={tier.name}>
              <TierCard tier={tier} open={open} />
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}
