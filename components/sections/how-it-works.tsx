import { FileText, Link2, ScanSearch } from "lucide-react";

import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { howItWorks } from "@/lib/copy";

const ICONS = [Link2, ScanSearch, FileText];

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <Container>
        <SectionHeading
          eyebrow="How it works"
          title={howItWorks.title}
          subtitle={howItWorks.subtitle}
        />

        <div className="relative mt-14">
          <div
            className="border-line absolute top-8 right-0 left-0 hidden border-t border-dashed md:block"
            aria-hidden="true"
          />
          <RevealGroup className="grid gap-10 md:grid-cols-3 md:gap-6">
            {howItWorks.steps.map((step, index) => {
              const Icon = ICONS[index];
              return (
                <RevealItem
                  key={step.title}
                  className="relative flex flex-col items-start gap-4"
                >
                  <div className="border-line bg-canvas hover:border-brand/60 relative z-10 flex size-16 items-center justify-center rounded-2xl border transition-colors">
                    <Icon className="text-brand size-6" aria-hidden="true" />
                    <span className="bg-brand text-ink absolute -top-2 -right-2 grid size-6 place-items-center rounded-full text-xs font-semibold">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="font-heading text-ink text-lg font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-ink-muted text-sm leading-relaxed">
                    {step.description}
                  </p>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </div>
      </Container>
    </Section>
  );
}
