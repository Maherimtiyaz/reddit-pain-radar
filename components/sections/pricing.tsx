import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { pricing } from "@/lib/copy";
import { site } from "@/lib/site";

const ctaHref = site.stripePaymentLink || "#waitlist";

export function Pricing() {
  return (
    <Section id="pricing">
      <Container>
        <SectionHeading
          eyebrow="Pricing"
          title={pricing.title}
          subtitle={pricing.subtitle}
        />

        <Reveal className="mx-auto mt-14 max-w-md">
          <div className="from-brand/70 via-brand-violet/40 rounded-3xl bg-gradient-to-b to-transparent p-px shadow-[0_0_60px_-20px_rgba(99,102,241,0.7)]">
            <div className="bg-surface rounded-[calc(1.5rem-1px)] p-8">
              <div className="flex items-center justify-between">
                <span className="font-heading text-ink text-lg font-semibold">
                  {pricing.tier.name}
                </span>
                <span className="border-signal/40 bg-signal/10 text-signal rounded-full border px-3 py-1 text-xs font-medium">
                  50% off for life
                </span>
              </div>

              <p className="text-ink-muted mt-2 text-sm">
                {pricing.tier.tagline}
              </p>

              <div className="mt-6 flex items-end gap-1">
                <span className="font-heading text-ink text-5xl font-semibold tracking-tight">
                  ${pricing.tier.price}
                </span>
                <span className="text-ink-muted mb-1.5 text-sm">
                  {pricing.tier.period}
                </span>
              </div>

              <Button asChild className="mt-6 h-12 w-full text-base">
                <a href={ctaHref}>
                  {pricing.tier.cta}
                  <ArrowRight className="size-4" />
                </a>
              </Button>

              <p className="text-urgency mt-3 text-center text-xs">
                {pricing.tier.note}
              </p>

              <ul className="mt-8 flex flex-col gap-3">
                {pricing.tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <span className="bg-signal/15 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full">
                      <Check
                        className="text-signal size-3"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-ink-muted text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
