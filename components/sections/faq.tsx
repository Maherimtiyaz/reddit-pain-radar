import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { isCheckSaleOpen } from "@/lib/check/availability";
import { faq } from "@/lib/copy";
import { site } from "@/lib/site";

function faqItems() {
  return [...faq.items, isCheckSaleOpen() ? faq.launch.open : faq.launch.soon];
}

const faqJsonLd = (items: ReturnType<typeof faqItems>) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
});

export function Faq() {
  const items = faqItems();
  return (
    <Section id="faq">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(items)) }}
      />
      <Container className="max-w-3xl">
        <SectionHeading eyebrow="FAQ" title={faq.title} />

        <div className="mt-12">
          <Accordion type="single" collapsible className="w-full">
            {items.map((item, index) => (
              <AccordionItem
                key={item.q}
                value={`item-${index}`}
                className="border-line"
              >
                <AccordionTrigger className="text-ink hover:text-brand-light py-4 text-left text-base hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-ink-muted pb-4 text-sm leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <p className="text-ink-faint mt-8 text-center text-sm">
          Still curious?{" "}
          <a
            href={`mailto:${site.email}`}
            className="text-brand-light hover:text-brand underline-offset-4 hover:underline"
          >
            {site.email}
          </a>
        </p>
      </Container>
    </Section>
  );
}
