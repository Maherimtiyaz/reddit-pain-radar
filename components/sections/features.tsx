import { Code2, Flame, Gauge, Quote } from "lucide-react";

import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid";
import { RevealGroup, RevealItem } from "@/components/ui/reveal";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { features } from "@/lib/copy";
import { cn } from "@/lib/utils";

const ICONS = [Gauge, Quote, Flame, Code2];

function ScoreChips() {
  const chips = [
    { label: "Urgency", value: "9", tone: "text-urgency" },
    { label: "Freq", value: "84", tone: "text-brand-light" },
    { label: "WTP", value: "8", tone: "text-signal" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="border-line bg-surface-2/70 flex items-center gap-2 rounded-lg border px-3 py-1.5"
        >
          <span className="text-ink-faint text-[0.7rem] tracking-wide uppercase">
            {chip.label}
          </span>
          <span className={cn("font-heading text-sm font-semibold", chip.tone)}>
            {chip.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Features() {
  return (
    <Section id="features">
      <Container>
        <SectionHeading
          eyebrow="Features"
          title={features.title}
          subtitle={features.subtitle}
        />

        <RevealGroup className="mt-14">
          <BentoGrid>
            {features.items.map((feature, index) => {
              const Icon = ICONS[index];
              return (
                <RevealItem
                  key={feature.title}
                  className={cn(index === 0 && "md:col-span-2")}
                >
                  <BentoGridItem
                    className="h-full"
                    title={feature.title}
                    description={feature.description}
                    header={index === 0 ? <ScoreChips /> : undefined}
                    icon={
                      <span className="border-line bg-surface-2 inline-flex size-9 items-center justify-center rounded-lg border">
                        <Icon
                          className="text-brand size-4.5"
                          aria-hidden="true"
                        />
                      </span>
                    }
                  />
                </RevealItem>
              );
            })}
          </BentoGrid>
        </RevealGroup>
      </Container>
    </Section>
  );
}
